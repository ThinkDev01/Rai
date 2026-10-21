# Guide — Backend

Multi-tenant REST API for Rai. Express 5 + TypeScript on PostgreSQL, AWS Cognito auth. Modular monolith.

**Stack:** Node + `tsx` · Express 5 · PostgreSQL (`pg`) · AWS Cognito (`aws-jwt-verify`) · AWS SES · pino · UUIDv7 · vitest

## What's in this guide
- **Folder structure** — where everything lives
- **Request flow** — the layers a request passes through
- **Modules** — what each one owns
- **Auth & org context** — Cognito + the middleware
- **Module → route map**
- **Response envelope & errors**
- **Logging**, **Database & migrations**
- **Conventions** (Do / Don't), **Env & run**

---

## Folder structure
```
backend/
├── app.ts          ← builds the Express app: middleware + mounts every module's routes
├── server.ts       ← entry point: boots app, runs migrations, starts cron, listens
├── modules/        ← one folder per domain (modular monolith)
│   └── <name>/     ← controller · routes · model · (service) · (types)
├── jobs/           ← cron.ts (node-cron runner) + *.job.ts (sprint-autostart, invite-cleanup)
├── middleware/     ← authMiddleware, requireOrgContext, requireOrgRole, rateLimiter, errorHandler
├── config/         ← db (pg pool), logger (pino), env, migrations/ (001–021 SQL)
├── types/          ← common.types.ts (ApiResponse, AuthenticatedRequest, OrgRole, param/query helpers)
├── scripts/        ← migrate.ts, stress seed/cleanup, billing-sweep, purge-orgs
└── tests/          ← vitest
```

## Request flow (the layers)
```
HTTP → app.ts            (helmet, cors, json limit, pino-http, rate limit)
     → module.routes     (path + which middleware to attach)
     → authMiddleware    → verifies Cognito JWT, attaches req.user
     → requireOrgContext → attaches req.context { org_id, role }
     → requireOrgRole()  → role gate (only where needed)
     → controller        → logs, validates input, calls service/model, sends response
     → service           → business logic / multi-step orchestration (rich modules only)
     → model             → parameterized SQL only, returns typed rows
     → PostgreSQL
```
- **Thin modules** (health, me, search, reports) skip the service layer: controller → model.
- **Rich modules** (auth, projects, sprints, tickets, users) have a `*.service.ts`.
- `model` = SQL only, zero logic. `controller` = no SQL.

## Modules — what each owns
| Module | Endpoints | Notes |
|---|---|---|
| `health` | `GET /api/health` | DB ping; unversioned |
| `auth` | logout, switch-org | Cognito-backed (see Auth below) |
| `me` | get/update profile, my tickets | thin |
| `orgs` | create/update/soft-delete/restore org, deleted-list, export (json/xlsx), members, transfer, leave, discover | the tenant (delete = 30-day recycle bin) |
| `invites` | preview, accept, revoke, create, list | token-based, 7-day |
| `projects` | CRUD + members | nests sprints/tickets/reports |
| `sprints` | create/update/delete | nested under a project |
| `tickets` | CRUD + comments | nested under a project |
| `reports` | burndown, sprint-report, velocity | nested under a project |
| `users` | a user's tickets (cross-project) | |
| `search` | org-wide search | |
| `notifications` | list, unread-count, mark-read, mark-all-read, get/update-preferences | user-scoped feed (no org context); `notify()` is the single dispatch entry called from other modules' service layer; channels = in-app + email + push (FCM) |
| `otp` | `POST /otp/request` (mint + email a code) | email-OTP gate for sensitive actions; `verifyActionOtp()` (in `otp.service`) is the single verify entry called from the gated controllers; see "Sensitive-action OTP" below |
| `push` | `POST /devices` (register), `DELETE /devices` (unregister) | mobile FCM device registry; user-scoped (no org context). The notifications `push.channel` reads these tokens to fan out; FCM init + send live in `config/firebase.ts` (no-op until `FIREBASE_SERVICE_ACCOUNT` is set). Validated eagerly at boot (`isPushEnabled()` in `server.ts`) so a bad credential surfaces in startup logs, not on the first push. Smoke-test without a device: `npm run test:push` (pushes to a fake token; a `messaging/invalid-argument` rejection = credential valid + FCM reachable) |
| `billing` | `GET /billing`, `GET /billing/invoices`, `POST /billing/subscribe`, `POST /billing/confirm`, `PATCH /billing/auto-renew`, `POST /billing/cancel` (OTP-gated), `POST /billing/webhook` (public, signed) | subscriptions + per-seat pricing + read-only enforcement. Owner/admin only; uses `attachOrgContext` (NOT the write-gate) so paying/reactivating works under read-only. `BillingProvider` interface (`billing.factory` → Razorpay only, keys required at boot; no fallback). See "Billing" below |
| `feedback` | `POST /feedback` (submit) | in-app feedback modal; auth only (no org gate — works anywhere). Stores a `feedback` row + emails support via SES (to `SUPPORT_EMAIL`, default `support@rai.novetum.com`). Tight rate limit (5/hr/IP) |
| `email` | *(no routes)* SES send + `templates/` | called by invites + notifications + otp + feedback |

Full request/response per endpoint → **`Api-Documentation/`**.

## Auth & org context
- **Auth = AWS Cognito.** `authMiddleware` verifies the Bearer JWT with `aws-jwt-verify`, links/loads the local user, attaches `req.user`.
- **Swappable by design:** `auth/` exposes an `AuthService` interface (`auth.factory.ts` → `cognito-auth.service.ts`), so the provider can change without touching controllers (self-built JWT kept as fallback).
- **Org context:** `requireOrgContext` resolves the active org and attaches `req.context = { org_id, role, subscription_status }`. Org is read from the **`X-Org-Id` header** (per-tab, set by the frontend from the URL slug), falling back to the JWT `custom:current_org_id` claim.
- **Read-only write-gate:** `requireOrgContext` is `attachOrgContext` **plus** the subscription gate — when the org is read-only (`suspended`/`cancelled`) and the request is a write (POST/PUT/PATCH/DELETE), it returns `403 SUBSCRIPTION_EXPIRED`. Reads always pass (indefinite read-only, v2-decisions Q11 / RF-10). One central gate; no per-controller checks. Billing routes mount **`attachOrgContext`** (context only, no gate) so pay/reactivate/cancel work while read-only.
- **Role gate:** `requireOrgRole('owner','admin', …)` guards privileged routes. Roles: `owner` > `admin` > `project_manager` > `user`.

## Module → route map (v2)
```
/api/health                          health        (unversioned)
/api/v1/auth/*                        auth          (logout, switch-org)
/api/v1/me/*                          me
/api/v1/orgs/*                        orgs          (+ /:id/invites → invites)
/api/v1/invites/*                     invites       (preview, accept, revoke)
/api/v1/projects/*                    projects
/api/v1/projects/:id/sprints/*        sprints       (nested)
/api/v1/projects/:id/tickets/*        tickets       (nested)
/api/v1/projects/:id/reports/*        reports       (nested)
/api/v1/users/*                       users
/api/v1/search                        search
/api/v1/notifications/*               notifications (user-scoped feed; no X-Org-Id)
/api/v1/otp/*                         otp           (request action code; no X-Org-Id)
/api/v1/devices                       push          (register/unregister FCM device; no X-Org-Id)
/api/v1/billing/*                     billing       (summary, subscribe, confirm, auto-renew, cancel)
/api/v1/billing/webhook               billing       (public + raw body, mounted BEFORE express.json)
/api/v1/feedback                      feedback      (submit feedback; auth only, no X-Org-Id)
```
`app.ts` is the only place routes mount — one line per top-level module; nested resources mount inside the projects router.

## Sensitive-action OTP
High-impact, irreversible actions are gated by an emailed 6-digit code — a UX + abuse speed-bump on top of the existing role checks, not the primary auth boundary.

- **Gated actions (the allowlist):** `delete_org`, `transfer_ownership`, `delete_project`, `cancel_subscription` — defined in `otp/otp.types.ts`. Add a gated action = add a key + label there, call `verifyActionOtp()` in that controller, and `requestActionOtp` from the frontend.
- **Flow:** frontend calls `POST /api/v1/otp/request` `{ action, targetId }` → `otp.service` mints a code (`otp.model.createChallenge`), stores only its SHA-256 hash, emails the plaintext to `req.user.email`. The user submits the code on the action's own endpoint (e.g. `otpCode` in the `DELETE /orgs/:id` body); that controller calls `verifyActionOtp(userId, action, targetId, code)` **after** its role check and **before** the mutation.
- **Binding + safety:** a code is bound to `(user, action, targetId)` — it can't authorize a different org/project or a different action. Single-use (consumed on success), 10-min TTL, 3-attempt cap, and a resend retires the prior code (all in `otp.model`). The request route has its own tight rate limiter (5 / 10 min / IP) since every call sends a real email.
- **Authorization split:** `/otp/request` does **not** check whether the caller may perform the action (it only emails their own address) — the execution endpoint re-checks role + code. So minting a code you can't use is harmless.

## Billing
Per-seat subscriptions with a swappable provider. Product rules → `Guide/guide-billing.md`; schema → `guide - db.md`.

- **Provider abstraction:** `billing.provider.ts` defines `BillingProvider`; `billing.factory.ts` always returns **`RazorpayBillingProvider`** (its constructor throws if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are missing). **No NoOp fallback** — the required keys are validated at boot (`config/env.ts` `validateEnv()`), so there is exactly one billing flow in every environment: subscribe always opens a real Razorpay checkout, never a fake instant-activate. All Razorpay SDK access is confined to `providers/razorpay.provider.ts` (no-raw-SDK rule). Tests inject a deterministic stub via `setBillingProvider()` (the test seam) — never the real provider, never the network. _(`NoOpBillingProvider` still exists as an injectable dev/test seam but is no longer auto-selected.)_
- **Two payment modes:** `recurring` (Razorpay Subscriptions — auto-renew via UPI-autopay/card mandate, needs `RAZORPAY_PLAN_ID` env — falls back to `plans.razorpay_plan_id`) and `one_time` (Razorpay Orders — pay one period, manual re-pay; keys only). The frontend picks per subscribe.
- **Lifecycle sync:** `billing.service` is the only surface other modules import. It maps the detailed `subscriptions.status` → the org gate (`organizations.subscription_status`) and never lets them drift. Org create → 30-day trial row (`ensureTrialForOrg`, best-effort + lazy backstop in `getSummary`).
- **Webhook:** `POST /api/v1/billing/webhook` is mounted in `app.ts` **before** `express.json` with `express.raw` (Razorpay signs raw bytes). HMAC-verified with `RAZORPAY_WEBHOOK_SECRET`, distilled to a normalized event, applied to state. Always 200s on a verified event so the provider doesn't retry.
- **Pricing (Jira-style MQB):** bill = `price_per_seat × peak active seats during the cycle`. Seat count is derived live (`COUNT(user_orgs)`); `peak_seats` is the cycle high-water mark. Mid-cycle adds prorate; removals get no credit.
- **Expiry sweep:** `sweepTrialWarnings()` (T-7d/T-1d emails) + `sweepExpired()` (flips expired trials / lapsed non-renewing periods to read-only). ✓ Wired into the cron runner (`billing-sweep`, daily 03:15 IST, alongside `purge-orgs`); also runnable manually via `npm run billing:sweep`. Recurring renewals come via webhook. See `Guide/dev-notifications.md` → Scheduled jobs.
- **Cancel** is OTP-gated (`cancel_subscription` action) and end-of-period by default (full access until `current_period_end`).
- **Resume = re-subscribe, never a flag flip.** A Razorpay subscription, once cancelled (even at cycle end), can't be un-cancelled. So turning auto-renew back **on** for a live cancelled sub is rejected (`PATCH /billing/auto-renew` → **409 `RESUBSCRIBE_REQUIRED`**); the client re-subscribes (fresh checkout + mandate). `subscribe` detects a still-running paid period (`status='active'` & future `current_period_end`) and sets the new subscription's `start_at` to that period end — no access gap, no double-bill. `setAutoRenew(true)` only flips the flag when there's no live mandate yet (e.g. still on trial).
- **Payment-method policy** (frontend `lib/razorpay.ts` `openCheckout`): **card + UPI** for both recurring and one-time (UPI Autopay creates a recurring mandate the same as a card mandate); netbanking/wallet/EMI off. Account-enabled methods still gate this in the Razorpay dashboard — recurring also needs the account activated for recurring/Autopay.
- **Billing notifications (v2 policy):** `trial_started` on org create (in-app + email + push); `trial_expiring` at **7-day** and **1-day** marks (fired by `sweepTrialWarnings` in the daily `billing:sweep`); `subscription_expired` **once** when the sweep flips an org to read-only. All go to owner+admins. No further nags in v2. See `dev-notifications.md`.
- **Test helpers:** `npm run seed:trial-ended -- <org-slug> [reset|active]` flips an existing org to read-only (trial ended) / fresh 30-day trial / paid-active. `npm run billing:test-notify -- <org-slug> <started|expiring7|expiring1|expired>` fires one billing notification (in-app + email) to that org's owner+admins — for testing delivery without the cron or any state change.
- **Invoices/receipts:** `GET /billing/invoices` → `provider.listInvoices(subscriptionId)`. Razorpay auto-generates one invoice per subscription charge, each with a hosted downloadable PDF (`short_url`) — **no extra setup beyond the keys/plan/webhook**, no PDF library, no `invoices` table. One-time orders return `[]` (Razorpay only auto-invoices subscriptions). GST tax-invoices (our branded PDF + GSTIN) stay v3.

## Response envelope & errors
- Every response: `{ "success": bool, "data": ..., "error": "" }`.
- Validate inputs in the **controller** (plain if-checks, no validation lib) → `400` with a clear message.
- Status codes: 200/201, 400, 401, 403, 404, 409, 410, 413, 500 (+ 502 for SES).
- **`errorHandler`** (last middleware) catches errors that reach Express:
  - **Errors carrying a 4xx `status`** keep it, and the caller gets a clear message:
    - malformed JSON → `400`
    - body over the limit → `413`
    - CORS-rejected origin → `403`
    - These are logged at `warn`.
  - **Everything else** → `500` "Internal server error" (no internals leaked), logged at `error` with the stack.
  - **Was:** every error → `500`, including bad client input.
- **Process-level crashes** (`server.ts`):
  - **`uncaughtException`:** logged at `fatal`, then a graceful shutdown (stop accepting, drain in-flight, close pool; hard 8s cap), exit `1`. Docker's `restart: always` brings up a clean process.
    - **Was:** logged and kept running in an unknown state.
  - **`unhandledRejection`:** still logged and kept alive.
- IDs: **UUIDv7** for users/orgs/invites; **BIGSERIAL** ints for projects/sprints/tickets/comments.

## Logging
pino (`config/logger.ts`). Every log carries `userId`, `route`, and a message; order = entry → validation → branch → success/error. Format + CloudWatch how-to → **`guide - logging.md`**.

## Database & migrations
PostgreSQL via `pg` — **parameterized queries only**, SQL lives in models. Migrations `001–010` auto-run on boot (`scripts/migrate.ts`, also `npm run migrate`). Full schema + tables → **`guide - db.md`**.

## Conventions
| Do | Don't |
|---|---|
| SQL only in `model` | logic or SQL in the controller |
| validate in controller before the model | trust client input |
| parameterized queries (`$1`) | string-concatenate SQL |
| type request bodies + DB rows | use `any` |
| wrap every multi-table write in a transaction | risk partial commits |
| log with `userId` + `route` | silent failures / `process.exit` on recoverable errors |
| return specific, actionable error messages | generic 500s where avoidable |

## Env & run
```bash
cp .env.example .env     # RDS + Cognito + SES values; ENVIRONMENT=dev
npm install
npm run migrate          # (also auto-runs on boot)
npm run dev              # tsx watch on server.ts
```
`.env` is **mounted** in prod — edit + restart applies, no rebuild. Full env contract → **`dev-deployment.md`** (in the docs repo).
