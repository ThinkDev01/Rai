# Engineering Standards & Best Practices

**Purpose:** Cross-cutting engineering standards and patterns that apply across modules and over time — architecture choices, backend rules, frontend rules, security defaults, observability, design patterns, tooling decisions. Project-agnostic reference; extend with new entries as they land. Not a substitute for `v2-plans.md` (active roadmap), `v2-decisions.md` (decision log), or `upgrades.md` (parked features and swap targets).

Last updated: June 2026.

---

## 1. Architecture *(HLD)*

**Modular Monolith → Microservices path**
Start as a single deployable unit with domain-based module boundaries. Each module (auth, tickets, sprints) owns its routes, controller, model, and types — completely self-contained. When a domain needs independent scaling, it can be extracted into its own service with minimal refactoring.

- Pattern: **Domain-Driven Design (lite)** — boundaries are business domains, not technical layers
- Tradeoff: Monolith is simpler operationally; microservices suit large teams and uneven load profiles. Default to monolith until you have evidence you need the split.

**Stateless backend (strict)**
No server-side sessions. No in-memory state tied to a request. Every instance is identical — horizontal scaling is just adding more containers. The discipline:

| Pattern | Allowed? | Why / how to do it instead |
|---|:-:|---|
| Module-level `let counter = 0` mutated across requests | ❌ | Persistent state → DB. v2 rate limiter is the only historical exception, swapped to a Postgres-backed store **during v2 build** (not later). |
| Module-level `const cache = new Map()` shared across requests | ❌ | Use Postgres (durable) or external cache like Redis (parked, RF-14). Request-scoped `Map`s inside a function are fine — they die with the request. |
| `setInterval` / `setTimeout` retaining state across requests | ❌ | Background work belongs in cron jobs or scheduled tasks (DB-backed, per §3 "Background jobs"). |
| Cookies-only session (no JWT) | ❌ | Auth via Cognito JWT (self-contained, no lookup). Mobile parity requires header-based auth (§3 "APIs are mobile-compatible from v2 day one"). |
| Request-scoped variables inside a controller / service function | ✅ | Created and garbage-collected per request. No cross-request leakage. |
| Pool / connection objects at module top level | ✅ | They're shared resources, not request state. The `pg` pool, the AWS SDK client, the logger — these belong at module load. |
| Cron jobs (scheduled work) | ✅ | They're scheduled — not in-memory cross-request state. Persistent state still in DB (§3 background-jobs pattern). |

**Auth via JWT, validated stateless.** No DB lookup for token validity — `aws-jwt-verify` checks against cached JWKS public keys.

**Rate-limiter:** ships in v2 with `rate-limit-postgresql` (PostgresStore against existing RDS) — **not** the in-memory default. Single-EC2 day-1 still works; multi-EC2 future works without code change. Single source of counter truth, no in-memory exception.

---

## 2. Backend Standards *(LLD)*

**Env-driven config (12-factor app)**
All config via environment variables. No hardcoded values. App validates required env vars at startup and exits immediately if any are missing — fail fast, fail loud.

**Transactions for multi-table operations**
Any operation touching more than one table is wrapped in a single PostgreSQL transaction. One step fails → whole transaction rolls back. No partial commits, ever.

**DB constraints as last line of defense**
Business rules enforced at DB level (FK, NOT NULL, CHECK constraints) — not just at application level. App validation catches user errors early; DB constraints catch code bugs.

**Parameterized queries always**
Never string-concatenate SQL. Every variable goes through the driver's parameterization (`$1, $2, ...`). Eliminates SQL injection by design.

**BIGINT → JS number at the driver level** *(v2)*
The `pg` driver returns BIGINT (OID 20) as a string by default to preserve precision past `2^53 - 1`. Override once at app startup: `pg.types.setTypeParser(20, (val) => parseInt(val, 10))`. Ensures every BIGSERIAL primary key (projects, sprints, tickets, comments, ticket_status_history) returns as JS `number` consistently across services, controllers, and frontend payloads. Precision risk is theoretical at our scale (~10^15 rows per table); the alternative is a tax on every controller and URL builder. Locked in `v2-decisions.md` Q13.

**ID generation: UUIDs are app-side, not DB-side** *(v2)*
`organizations.id` and `subscriptions.id` are UUID v7, generated in the service layer using the `uuidv7` npm package (pinned exact version). `users.id` is whatever Cognito's `sub` returns (UUID v4). No `gen_random_uuid()` defaults in migrations, no `pg_uuidv7` extension — keeps the schema portable across Postgres versions and managed services. Tenant-scoped tables (projects, sprints, tickets, comments, ticket_status_history) use `BIGSERIAL` and let Postgres generate. Locked in `v2-decisions.md` Q13.

**Tenant scoping: JWT, never URL params** *(v2 multi-tenant)*
For any tenant-scoped query, `org_id` comes from the JWT (resolved by auth middleware into `req.context.org_id`) — never from `req.params`, `req.query`, or the URL path. URL slugs (e.g. `/orgs/<slug>/...`) are display-only; if present, middleware verifies the slug resolves to the same `org_id` as the JWT, otherwise 403. Trusting URL-derived org IDs lets a user edit the path to read another tenant's data — JWT-as-source-of-truth closes that door, and keeps the same code working when the URL form changes (e.g. path → subdomain).

The chain for tenant-scoped routes is:
```ts
router.post(
  '/',
  authMiddleware,            // verifies Cognito JWT, attaches req.user (with currentOrgId/Role/SubStatus validated against DB)
  requireOrgContext,         // 403 if no current org; attaches req.context = { org_id, role, subscription_status }
  requireOrgRole('owner','admin'),  // role gate, reads req.context.role
  createProjectHandler,
);
```
Every model function for tenant tables MUST take `orgId` as its first explicit arg and include `WHERE org_id = $1` (compounded with other filters). No model function may read `req.*` directly — controllers do that and pass `org_id` in. This is the contract that lets RLS layer on later (defense-in-depth, parked in `upgrades.md`) without touching any model.

**Cross-system writes: Cognito-first + bounded retry + best-effort compensation** *(v2)*
Any operation that writes to both Cognito and Postgres in the same logical action (signup, org switch, email change, account delete) follows one universal pattern:
1. **Cognito-first ordering.** Cognito owns identity and authentication state; DB rows mirror that. The Cognito write goes first inside `withCognitoBackoff` (retries on `TooManyRequestsException` / `ThrottlingException`).
2. **Bounded DB retry.** The DB write follows inside `withDbRetry` (retries on transient pg errors: `08006`, `40001`, `40P01`).
3. **Best-effort compensation when DB fails after retries.** Capture the Cognito-side pre-write state, attempt a single bounded revert on DB failure. If revert succeeds → user retries the whole action, both sides clean. If revert also fails → structured log + ops alert + manual cleanup.
4. **Account delete is the one flow without compensation** — `AdminDeleteUser` is destructive. Log + alert + manual SQL cleanup on DB failure. User is already locked out at Cognito, no security exposure.
5. **All writes critical.** No background-write category. Failures error the user-facing operation; the user retries.
6. **No silent auto-heal.** Middleware-detected mismatches return `500 "Account state inconsistent"` + structured log + alert. Ops fixes manually.

Retry helpers live in `backend/lib/retry.ts`. Reserved log event names: `event: "<flow>_rollback_failed"`, `event: "<flow>_mismatch"` — watched by the alert pipeline (CloudWatch alarm → SNS → email). Locked in `v2-decisions.md` RF-8.

**Centralized error handler**
One error handler at the end of the Express middleware chain. All thrown errors flow here. Never send stack traces or internal messages to clients — always a clean, generic response.

**Graceful shutdown**
On SIGTERM (Docker stop, K8s pod eviction), close the DB pool and finish in-flight requests before exiting. Without this, requests get cut mid-execution in containerized deployments.
- ✓ **Done 2026-10-21:** `server.ts` now runs `server.close()` (drain in-flight requests) → `pool.end()`, with a hard 8s cap.
  - **Was:** pool closed only, without draining requests.
  - The same path runs on an `uncaughtException`, then exits `1` so the container restarts clean.

**Trust proxy**
Set `app.set('trust proxy', 1)` when running behind Nginx or any load balancer. Without it, rate limiting and IP-based logic sees the proxy IP — everyone shares the same bucket.

**Payload size limit**
`express.json({ limit: '10kb' })`. Prevents memory spikes from large request bodies. Tune the limit per endpoint type if needed (file upload endpoints handled separately).

**API versioning**
All feature routes under `/api/v1/`. Infrastructure endpoints (health check) are unversioned. When breaking changes are needed, introduce `/api/v2/` — old clients don't break.

**Indexes on hot paths locked at first migration** *(v2)*
Every column that drives a per-request lookup or a frequent join gets a covering index in the schema's first migration — retrofitting indexes after data exists is painful (locks, downtime, rebuild cost). v2's locked hot-path index list: `users(cognito_sub)` UNIQUE, `user_orgs(user_id, org_id)` UNIQUE composite, `user_orgs(org_id)`, `user_orgs(user_id, last_accessed_at DESC)`, `organizations(slug)` UNIQUE, `subscriptions(org_id)` UNIQUE, `invites(token)` UNIQUE, and a partial index on `invites(invited_email, org_id) WHERE used_at IS NULL AND revoked_at IS NULL` for the invite supersede + pre-flight queries. Composite index column order follows the equality-first / range-last rule (e.g. `(user_id, last_accessed_at DESC)` because `user_id` is equality and `last_accessed_at` is range/sort). Partial indexes used wherever a query has a WHERE clause that filters most rows out (e.g. invite-pending lookup ignores used/revoked rows). New tenant tables in v2 follow the same discipline — index `org_id` on every tenant-scoped table (Q16). Locked in `v2-decisions.md` RF-14.

**Service layer + cross-module imports** *(v2 modular monolith)*
Each module under `backend/modules/<name>/` is self-contained: `*.routes.ts`, `*.controller.ts`, `*.model.ts`, `*.types.ts`, and optionally `*.service.ts`. The service file is the module's *public API* — cross-module imports must go through `<other-module>/<name>.service.ts` and nothing else. Reaching into another module's model, controller, or routes is rejected at review. Service files are opt-in: add one when (a) another module consumes the logic, or (b) the controller is doing real business logic (multiple model calls, validation chains, cross-table rules). Simple read-only modules (`health`, `me`, `reports`, `search`, `comments`, `backlog`) can stay controller → model. Services intended to be swappable (e.g., `AuthService` per §8, `BillingService` for future microservice peel-out) ship as an interface + concrete implementation from day one. There is no top-level `services/` folder; every service has a home module. Locked in `v2-decisions.md` Q12.

---

## 3. Frontend Standards *(LLD)*

**Optimistic UI with rollback**
Every state-changing action updates the UI immediately — never block on network. If the API call fails, roll back to previous state and show an error toast. Users feel speed; failures are handled gracefully.

Two patterns in use depending on context:

_Mutation-based (forms, modals):_
- `isPending` → disable submit button + show "Creating…/Saving…" label
- `onSuccess` → `invalidateQueries` + `toast.success` + close modal
- `onError` → `toast.error` (hook-level, no extra code in UI)

_Local-state-based (DnD board columns):_
- Snapshot current state before change: `const prev = columns`
- Apply change immediately: `setColumns(newState)`
- Call mutation: `moveTicket({ ticketId, status })`
- On error: `setColumns(prev)` — reverts the snapshot
- `invalidateQueries` on success keeps cache fresh without re-triggering the useEffect

**Server state vs client state — keep them separate**
- Server state (API data): TanStack Query — caching, background refetch, deduplication built in
- Client state (UI state, auth): Zustand — simple, no boilerplate
- Tradeoff: Zustand vs Redux — Redux suits large teams with complex shared state and time-travel debugging needs. Zustand suits small-to-medium apps where simplicity matters more than tooling.

**Loading / Error / Empty / 404 — every page handles all four**

Every page using `useQuery` must handle:
1. `isLoading` → render skeleton shimmer (never a spinner)
2. `error` + `isNotFoundError(error)` → `<PageNotFound>` with back link
3. `error` (other) → `<PageError message="..." onRetry={refetch} />`
4. Empty data (200 with `[]`) → empty state UI using copy from `lib/messages.ts`

`isNotFoundError(error)` uses `axios.isAxiosError()` — no `as any` casts.

**React Query cache keys start with `orgId`** *(v2 multi-tenant)*
Every TanStack Query `queryKey` for tenant-scoped data starts with the active `orgId` as its first segment: `['org', orgId, 'projects']`, `['org', orgId, 'tickets', ticketId]`, etc. Two reasons: (1) on org switch, an in-flight refetch from the previous org cannot pollute the new org's cache — different keys, different cache entries; (2) cache from a previously-visited org survives a quick switch-back without a fresh fetch. Without this convention, switching orgs mid-fetch flashes wrong-tenant data on the new dashboard for one render. Locked in `v2-decisions.md` RF-6.

**Defense-in-depth on org switch** *(v2, applied during Phase 2)*
Three layers cooperate so an org switch can never leave wrong-tenant data on screen:
1. **Active eviction.** `Header.tsx` `switchOrg.onSuccess` calls `qc.clear()` after `hydrate()` and routes to `/dashboard` so no tenant-scoped path refetches the previous org's IDs.
2. **Key isolation.** Every hook's `queryKey` is `['org', orgId, ...]` (above). Even without `clear()`, two orgs' cache entries occupy different slots.
3. **Safety net.** `(app)/layout.tsx` tracks `currentOrgId` via a `useRef` and on any transition (cross-tab sync, regression in the Header handler, etc.) does `qc.clear()` + `router.replace('/dashboard')`. The Header is the primary path; the layout watcher is the brace.

The bug this prevents: switching orgs from inside a private project view used to leave the project rendered (cached) while every child request (comments, status updates) hit the backend's org guard and returned "project not found" — a confusing half-broken UI rather than a clean redirect.

**Centralized empty-state copy**
All empty state titles, descriptions, and CTA labels live in `lib/messages.ts` as a typed `as const` object. No hardcoded strings in components. Change copy in one place; every page picks it up.

**Error boundaries**
`app/(app)/error.tsx` is a Next.js App Router error boundary. It catches unexpected runtime JS crashes (component throws during render) in any authenticated page. Separate from network error handling — those are per-page via `<PageError>`.

**Nullable fields — match API reality**
Optional fields that the API may return as null must be typed `string | null`, not `string`. Key fields: `Ticket.description`, `Sprint.goal`, `Sprint.notes`, `Project.description`. Access with `?? ''` or conditional render — never assume truthy.

**APIs are mobile-compatible from v2 day one** *(v2)*
Even though the native mobile app is v3 work, every v2 API is designed so the future mobile team can wire up without backend rework. Concrete rules: (1) **JWT/Bearer auth only** — no cookie-only endpoints (Cognito tokens work identically for web and mobile via `Authorization: Bearer <token>` header). (2) **One endpoint per resource** — no `/web/...` vs `/mobile/...` route forks; both clients hit the same endpoint. (3) **JSON-only responses** — no HTML rendering on the backend. (4) **`X-Client-Type` request header convention** — frontend self-reports `web` / `ios` / `android` / `cli`; v2 logs it, branches on it where useful (analytics, feature flags), but doesn't gate functionality on it. (5) **Device-registration stub endpoint** — `POST /api/v1/devices/register {device_token, platform}` lands in v2 as a write to `user_devices` table; v3's FCM push channel reads from this table. v2 stub is ~10 lines; saves v3 the API roundtrip.
Result: when v3 mobile team starts, they consume the same v2 APIs as the web frontend. No "mobile-specific backend changes" sprint needed before mobile development can begin.

**Responsive web is baseline, not a separate phase** *(v2)*
v1 ships responsive / mobile-friendly views across all existing pages. v2 inherits this — every new page added in the v2 build (org switcher, member management, billing, settings additions, etc.) must work on mobile widths from day one. Not a Phase F polish task. The simplified-mobile-view item parked in `v2-plans.md` Phase F is a separate, future "stripped-down Kanban for small screens" concept — distinct from the base responsive baseline that every page must already meet.

**Notifications: single module with channel adapters** *(v2)*
All notification dispatch goes through `backend/modules/notifications/`. One service entry point — `notificationService.notify({ userId, type, data, channels? })` — handles both event-triggered (immediate) and time-scheduled (delayed via the background-jobs pattern below) notifications. Channels are adapter files in `channels/` (email via SES, in-app via DB table, push via FCM in v3 — stub in v2). Templates per notification type in `templates/`. User preferences in `user_preferences.service.ts`. Adding a new channel = new adapter file. Adding a new notification type = new template file + one `notify()` call from the triggering endpoint. **Full catalog of notification types + channel defaults + module structure + user-preferences schema lives in `dev-notifications.md`** — that's the single source of truth, not duplicated here.

**Background jobs (scheduled tasks): DB-as-the-scheduler pattern** *(v2)*

✓ **Runner wired 2026-06-09** — `backend/jobs/cron.ts` registers all jobs via **`node-cron`** in the backend container; started from `server.ts`, stopped on graceful shutdown, disable-able with `CRON_ENABLED=false`. Live jobs: `sprint-autostart` (hourly), `invite-cleanup` + `billing-sweep` + `purge-orgs` (daily). Each is also a standalone idempotent `run*()` (manual `npm run jobs:*`). Full schedule table + the catalog of which notifications fire lives in **`dev-notifications.md` → Scheduled jobs (cron runner)**. Every run is wrapped (throw → logged + swallowed) with an overlap guard.

v2 has several recurring background jobs: sprint auto-start on planned date (v1 fix item 19), opt-in sprint-start notifications at user-chosen time (item 19), subscription pre-expiry email warnings (Q11), invite expiry cleanup (RF-12), and others as they surface.

**Two polling shapes:**
- **Poll the domain row's own due-column** when one exists (sprint `start_date`, invite `expires_at`) — no extra table, just a model query + partial index on the predicate. This is what `sprint-autostart` and `invite-cleanup` do.
- **Per-domain `scheduled_at`/`fired_at` table** when the due time is independent of any existing column (e.g. the opt-in sprint-start alert at a *user-chosen* time). Pattern below.

For the table-backed variant, v2 uses **`node-cron` inside the existing backend container** polling **per-domain tables** with two standard columns:

- `scheduled_at TIMESTAMPTZ NOT NULL` — when this row should fire
- `fired_at TIMESTAMPTZ NULL` — when it actually fired (NULL = pending)

Each domain that needs scheduling gets its own table (`sprint_start_notifications`, `subscription_expiry_warnings`, `invite_expirations`, etc.) — typed, queryable, owned by the relevant module. Don't build a generic `scheduled_jobs` table; per-domain is faster + clearer.

**Cron job shape (~30 lines per job):**

```ts
// runs every 1 minute
const due = await db.query(`
  SELECT * FROM <domain_table>
  WHERE scheduled_at <= NOW() AND fired_at IS NULL
  ORDER BY scheduled_at
  FOR UPDATE SKIP LOCKED
  LIMIT 100
`);
for (const row of due) {
  await processRow(row);
  await db.query(`UPDATE <domain_table> SET fired_at = NOW() WHERE id = $1`, [row.id]);
}
```

**Per-table requirement:** partial index on `(scheduled_at) WHERE fired_at IS NULL` — keeps the cron query touching only pending rows as the table grows.

**Properties that make this scalable + v3-migration-clean:**
- **Idempotent.** Re-running the query returns nothing for already-fired rows. Safe under restarts, retries, parallel workers.
- **Durable.** State in DB, survives crashes / restarts / deploys.
- **Concurrent-safe.** `FOR UPDATE SKIP LOCKED` lets multiple backend instances run the same cron without double-processing.
- **Fast.** Partial index means query touches only pending rows.

**v3 migration path (parked in `upgrades.md`):** AWS EventBridge scheduled rule → Lambda runs the same SELECT + UPDATE logic against the same tables. Zero data migration. Or evolve to per-row EventBridge schedules (one schedule per notification row → Lambda fires at exact moment, no polling needed) for sub-minute precision. Action logic identical either way.

Locked in `v2-decisions.md` (item 19 walk-through, May 2026).

**User-facing copy lives in `frontend/content/`, not inline in components.**
Marketing strings, button labels, toast messages, placeholders, empty-state lines, branded email HTML — all centralized. Component logic imports from a content module:

```ts
import { HERO } from '@/content/marketing';
<h1>{HERO.headline}</h1>
```

Why: copy edits don't require JSX hunting; one file scan reveals tone inconsistencies; we're set up for i18n later without a rewrite. TypeScript (not JSON) — IDE auto-complete catches typos, comments explain *where* a string appears, and the loader can later swap to locale-keyed JSON without touching call sites.

What does NOT go in `content/`: dummy mockup data (product simulation, not marketing copy), server logs, Zod validation messages (keep next to the schema until they sprawl).

Files today:
- `content/marketing.ts` — landing + pricing
- `content/placeholders.ts` — search prompts + empty states
- `content/emails/*.html` — branded Cognito email HTML (verify, forgot password, MFA)
- `content/README.md` — full convention

When you add a new placeholder or empty-state, lift it here first. When refactoring an existing surface, lift its strings as you touch the file. Big-bang refactor across the whole app would be churn for low value.

---

## 4. Security *(LLD + HLD mix)*

| Measure | What it does | Where |
|---------|-------------|-------|
| Helmet | Sets 12+ security HTTP headers (CSP, HSTS, X-Frame-Options, etc.) | Global middleware |
| CORS | Restricts cross-origin requests to known origins (env var, not wildcard) | Global middleware |
| Rate limiting (global) | 100 req/15min/IP — `express-rate-limit` with `rate-limit-postgresql` PostgresStore (ships in v2 build; not in-memory). Works on single EC2 today and multi-EC2 later with zero code change. | Global middleware |
| Rate limiting (auth endpoints) | Cognito's basic per-pool throttling protects login/signup/refresh. Cognito Advanced Security tier ($0.05/MAU) adds risk-based limiting and adaptive auth (deferred — see `upgrades.md`). | Cognito user pool config |
| Account lockout | Cognito-configurable in pool policy: failed-attempts threshold + lockout duration. Defaults to 5 failures → 15-min lockout (tunable). | Cognito user pool config |
| Password strength | Cognito-configurable: minimum length + character classes (uppercase / lowercase / digit / symbol). Set in pool policy. Optional haveibeenpwned-style breach check via Cognito Advanced Security. | Cognito user pool config |
| Cognito user pool | Managed identity provider — owns password hashing (bcrypt-grade), refresh-token rotation, replay detection, multi-device, password reset, email verification, MFA toggle. AWS owns the auth bug surface. | Auth provider |
| Cognito JWT verification | `aws-jwt-verify` validates token signature against Cognito's JWKS endpoint, plus issuer + audience + token-use checks | Auth middleware per route |
| bcrypt (cost 12) | Password hashing — used in `MockAuthService` for unit tests; production passwords are owned by Cognito | Test-only auth model |
| Payload limit | Prevents large body attacks | `express.json({ limit })` |
| Parameterized queries | Eliminates SQL injection | All models |
| Trust proxy | Correct IP behind reverse proxy | App config |
| Env validation | Refuses to start with missing secrets | Bootstrap |

**Never:**
- Log passwords, tokens, or full request bodies
- Return stack traces or internal error messages to clients
- Hardcode secrets or connection strings
- Use wildcard CORS origins in production

---

## 5. Resilience & Failure Handling *(LLD)*

**Backend**
- Transactions = atomic. Partial state is worse than no state.
- DB constraints = data integrity that survives code bugs.
- Pool error handler = prevents silent Node crash on idle client errors.
- Graceful shutdown = no interrupted transactions on deploy.

**Frontend**
- Optimistic updates = UI never freezes.
- Rollback on error = UI never shows a lie.
- `onSettled` refetch = UI always reconciles with server truth after any mutation.
- Error toasts = user always knows when something failed, never silently.

**The principle:** Every failure should be visible, bounded, and recoverable. Silent failures and partial state are the enemy.

---

## 6. Observability (Logging) *(LLD)*

**Structured logging with pino**
Every log is a JSON object — searchable, filterable, parseable by log aggregators (CloudWatch, Datadog, etc.).

**userId on every log**
Every single log includes `userId` (or `"system"` / `"anonymous"`). This makes filtering all logs for one user trivial in any log tool.

**Two renders, one source** *(v2)*
Same log calls render two ways, switched by `ENVIRONMENT` (`backend/config/logger.ts`): dev → pretty single line (only the level word ANSI-colored); prod → clean JSON (one object per line). Dev uses an in-process pino-pretty stream (not a transport worker) so function prettifiers work. Times are **IST** via Intl `Asia/Kolkata` (never `process.env.TZ`, which would shift the whole app's Date handling); CloudWatch keeps its own UTC `@timestamp` for sorting.

**reqId — request correlation** *(v2)*
Every log line of one HTTP request shares an auto-injected `reqId` (per-process incrementing counter). Stored in `AsyncLocalStorage` (`backend/config/requestContext.ts`), set by a middleware in `app.ts`, read by the pino `mixin` — controllers never pass it. Filter by `reqId` to replay one request end-to-end. Per request (not per user/ticket); resets on restart.

**Human messages** — `msg` narrates the step ("Saved the new ticket to the database"), not terse machine codes.

**Cloud delivery — awslogs driver** *(v2)*
Both `docker-compose.prod.yml` ship stdout via the Docker `awslogs` driver, so CloudWatch `@message` is the JSON line itself (no `{"log":…,"stream":…}` wrapper). Region `ap-south-2`, groups `backend-logs` / `frontend-logs`; needs EC2 role CloudWatch Logs perms + `ENVIRONMENT=prod`. The driver is set at container-create, so apply with a recreate (`docker compose … up -d`), not a restart. Gotcha: pino-pretty folds pino's `errorKey` into its error-like set, so to keep `err`/`error` inline we set a sentinel `errorKey` on the pino instance.

**Frontend logger** (`frontend/lib/logger.ts`) keyed by `component` (no reqId), split by where code runs:
- **Server-side** → structured (IST, JSON in prod) to `docker logs`. **The frontend does NOT ship to CloudWatch** — backend is the single CloudWatch source (client logs can't reach it, and server-side frontend logging is minimal). No awslogs block in the frontend compose.
- **Client-side** → lean: native `console.info/warn/error` (devtools supplies time, level color, source, expandable object), printed as `Component — message` + the raw data object. No manual time/userId/JSON-string. info/warn are dev-only on the client; errors always.

> **Usage** — how to read/filter logs in CloudWatch lives in `backend/guide - logging.md`.

**Controller log order** (enforced convention)
1. <Action> route hit → route + method + userId
2. Request body received → masked body + relevant params
3. Validation passed, querying DB → fields being sent to model
4. <Action> successful → result summary only
5. Send response

**pino-http** logs method, URL, statusCode, responseTime only. Never full headers or raw objects.

**Reserved structured log markers** *(v2)*
The alert pipeline (per `dev-deployment.md` § "v2 Infra Setup — Critical-error alert pipeline") watches specific event names. Reserved markers — use these exact patterns to trigger alerts, do not invent variants:

| Marker | Fires when |
|--------|-----------|
| `event: "<flow>_rollback_failed"`, `severity: "critical"` | Cross-system compensation attempt failed (RF-8). `<flow>` is `signup`, `org_switch`, `email_change`. |
| `event: "<flow>_mismatch"`, `severity: "critical"` | Middleware detected JWT claim ↔ DB state mismatch (RF-8). |

Any other `severity: "critical"` log will also trigger the alert via the catch-all metric filter — these two are the named patterns we expect.

---

## 7. Tooling Decisions & Tradeoffs *(HLD)*

| Decision | What we use | Why | When to use the alternative |
|----------|------------|-----|----------------------------|
| Language | TypeScript (strict) | Catches entire classes of bugs at compile time | JavaScript only if prototyping throwaway code |
| Backend framework | Express | Minimal, well-understood, huge ecosystem | Fastify for higher raw throughput; NestJS for large teams needing enforced structure |
| Database | PostgreSQL | ACID, rich query language, JSON support, battle-tested | MySQL for read-heavy workloads with simpler schemas; MongoDB for truly schema-less or document-heavy data |
| ORM/Query | Raw SQL via `pg` | Full control, no magic, easy to reason about | Prisma or TypeORM when team size makes raw SQL risky or migrations need tooling |
| Auth | AWS Cognito user pool (`aws-jwt-verify` + `aws-amplify`) | Managed identity provider — built-in password reset, email verification, account lockout, password strength, refresh-token rotation, MFA toggle, SSO toggle. AWS owns the auth bug surface. Free up to 50K MAU; $0.0055/MAU after. | Self-built JWT (~300 lines, full ownership) only if leaving AWS or needing extreme UX customization; Auth0/Clerk if not on AWS |
| Client state | Zustand | Minimal API, no boilerplate, sufficient for this scale | Redux Toolkit for large teams with complex cross-cutting state and time-travel debugging |
| Server state | TanStack Query | Caching, deduplication, background sync, optimistic updates | SWR is a lighter alternative; manual fetch if the app is simple and caching isn't needed |
| HTTP client | axios | Interceptors for JWT injection and 401 handling | `fetch` is fine for simple apps; axios interceptors are the key reason here |
| Logging | pino | Fastest Node.js logger, structured JSON, transport ecosystem | Winston is more configurable but slower; console.log only for scripts |
| Rate limiting | express-rate-limit + `rate-limit-postgresql` PostgresStore | Standard middleware; Postgres-backed store ships in v2 build so the limiter is shared across EC2 instances when scale-out lands. No in-memory state. | Custom middleware only if you need per-user or per-endpoint rules out of the box; Redis-backed store if Redis lands later (lower latency than Postgres). |
| Containers | Docker + Compose | Consistent environments, easy local dev, prod-ready | Bare metal if you never plan to scale or containerize |
| Reverse proxy | Nginx | SSL termination, static file serving, load balancing | Caddy for simpler SSL config; Traefik for dynamic container routing |
| CI/CD | AWS CodePipeline + CodeBuild (`buildspec.yml` per repo) | Native to our AWS stack (ECR/EC2/SSM/CloudWatch), no extra vendor, IAM-scoped. Dev owns the `buildspec.yml` gates; devops owns the pipeline wiring. | GitHub Actions if leaving AWS or wanting build minutes off-AWS; GitLab CI if repo moves to GitLab |
| Build gates | tsc (static) · vitest (test) · `npm audit` (deps) · Trivy (image) | Each gate is a hard stop — a bad image can't reach ECR. tsc stands in for ESLint until ESLint is added; test gate is `--passWithNoTests` until v2 suite lands. | Add ESLint + Playwright E2E as the suite matures; Snyk/Grype as Trivy alternatives |
| UI design system | Atlassian/Jira palette + Inter font | Familiar to dev teams, clean and functional, not decorative | Custom brand design if the product is consumer-facing and identity matters |
| CSS framework | Tailwind CSS v4 | Utility-first, no context switching, co-located styles | CSS Modules for strict style isolation; styled-components if design tokens come from JS |
| Theme management | CSS variables in `@theme` (globals.css) | Single file to retheme entire app, Tailwind v4 native approach | JS-based theming (e.g. Chakra, MUI) when you need runtime theme switching |
| Icon library | lucide-react | Consistent stroke weight, matches Jira's clean style, tree-shakeable | Heroicons (similar quality); Font Awesome for broader icon coverage |

---

## 8. Design Patterns in Use *(LLD)*

**Repository pattern (model layer)**
All DB access is isolated in `module.model.ts`. Controllers never write SQL. Models never contain business logic. Clean separation — swap the DB layer without touching controllers.

**MVC (adapted)**
`routes → controller → model` maps to View routing → Controller logic → Model data access. The "View" in an API is the JSON response shape.

**Middleware chain**
Express middleware stack is a pipeline: security → logging → rate limit → route → 404 → error handler. Each middleware has a single responsibility. Order matters.

**Fail-fast**
Env validation, input validation, and type checks happen as early as possible. The later a failure is detected, the harder it is to debug and the more damage it can cause.

**Single source of truth**
Server is always the source of truth. Frontend optimistic updates are predictions — `onSettled` always reconciles with reality. DB constraints back the server up.

**Derive authoritative state from our own facts, not external-event labels** *(v2)*
When an external system (payment provider, IdP) reports a state-change via webhook, treat its **label** as advisory and recompute the user-facing state from data **we own**. The billing read-only gate is the canonical example: it is computed from the org's own **trial / paid-period end dates** (`gateForSubscription`, mirrored in the auth-query `EFFECTIVE_GATE_SQL`), NOT from a stored status column a Razorpay `subscription.cancelled` webhook may have written. So an org that cancelled but still has a paid month left keeps full access — and a stray/early/duplicate webhook can never wrongly read-only an org with time remaining. Rule: a webhook may *inform* a state change, but the gate the app enforces is always re-derived from first-party dates at read time.

**Service-interface abstraction for swap-ready infrastructure** *(v2)*
For any subsystem with a viable managed alternative (auth, search, email, storage), define a thin interface in front of the implementation. v2 ships with `CognitoAuthService` (wraps AWS Cognito + `aws-jwt-verify`) behind an `AuthService` interface (`login`, `refresh`, `logout`, `verifyAccessToken`, `switchOrg`). Controllers depend only on the interface; API contracts (`/api/v1/auth/*`) stay stable. To swap to a different provider later (self-built JWT, Auth0, Clerk), add a new implementation of the interface and change one DI wiring line — no controller, route, or contract changes. Frontend mirrors this with a parallel `AuthClient` interface (v2 = `CognitoAuthClient` wrapping `aws-amplify`). The same pattern is the standard fallback for any other system later (e.g. `SearchService` if search ever moves from Postgres FTS to Elasticsearch / Algolia). v2 also uses this pattern for `MembershipResolver` — `DbMembershipResolver` ships in v2 issuing the auth-chain LEFT JOIN query (`users` ⋈ `user_orgs` ⋈ `organizations` ⋈ `subscriptions`); v3 drops in `CachedMembershipResolver` wrapping the DB one with Redis lookup-then-fallback when measured load crosses RF-14's trigger criteria, with zero middleware changes. Active alternatives are documented in `upgrades.md`.

**AuthService normalization contract + no-raw-provider-SDK rule** *(v2, RF-16)*
For the abstraction above to actually deliver plug-and-play swap, two disciplines are load-bearing. **(1) `AuthService.verifyAccessToken()` returns a normalized shape** — `{externalAuthId, email, emailVerified, currentOrgId}` — never raw provider claims. Middleware reads only the normalized fields and never branches on provider type. Each provider's impl knows how to extract these from its own token format (Cognito's `sub` + `custom:current_org_id`, Auth0's `sub` + `app_metadata.current_org_id`, Clerk's `sub` + `privateMetadata.current_org_id`, etc.). **(2) No raw provider SDK imports outside the concrete `AuthService` implementation.** Controllers, models, and any non-auth module must not import `@aws-sdk/client-cognito-identity-provider` (or any future provider's SDK) directly. Review-rejected if found. All provider-specific admin operations (`AdminGetUser`, `AdminUpdateUserAttributes`, `AdminDeleteUser`, `AdminSetUserPassword`, `AdminListUserAuthEvents`) live behind `AuthService` methods. Combined with the **decoupled identity model** (`users.id` = our UUID v7; `users.external_auth_id` = provider sub today, swappable per provider, per RF-16), this makes a future Cognito swap a days-long migration (new `AuthService` impl + DI wiring + per-user script that updates `external_auth_id`) instead of a months-long FK rewrite. Locked in `v2-decisions.md` RF-16.

**Test fixture for the abstraction:** unit tests use a `MockAuthService` implementing the same interface (bcrypt + local Postgres `users` table for tests only — production has no password column). Keeps tests fast / deterministic / offline. The real Cognito provider is exercised in dev (shared `rai-dev` pool) and in CI integration tests (dedicated `rai-ci` pool that resets between runs). Industry-standard pattern for AWS-ecosystem startups.

**Federated account linking via backend lazy-sync** *(v2, RF-7)*
When a user signs up native (`dip@novetum.com` / password) and later signs in via Google or Microsoft with the same verified email, we link both identities into a single `users` row — not two. Implementation lives in the lazy-sync step of `loadUser` middleware: on first authenticated request, if the JWT's email matches an existing verified `users.email` row, call `AdminLinkProviderForUser` from the `AuthService` impl and reuse the existing `users.id`; otherwise insert a new row keyed by the Cognito `sub`. **No Pre-Sign-up Lambda.** Reason: same as the lazy-sync-over-Lambda lock in convo-053 — keeps everything in backend code, no extra AWS artifact to maintain, debuggable locally. The link operation is idempotent and safe to retry. Microsoft IdP in Cognito is configured **multi-tenant + personal accounts** (anyone with a Microsoft login can authenticate) — org membership is still gated by Rai's invite system per Q6, so this widens IdP reach without weakening access control.

---

## 9. What to Think About on Any New Project *(meta — mix)*

Before writing a line of feature code, answer these:

1. **Stateless?** Can any instance serve any request? If not, why not — is that unavoidable?
2. **Fail fast?** Does the app refuse to start with bad config? Does it fail loudly or silently?
3. **Atomic operations?** What happens if step 2 of a 3-step process fails? Is that safe?
4. **Swappable infrastructure?** Is the DB, cache, or queue behind an abstraction, or hardwired?
5. **Observable?** Can you answer "what was user X doing at 14:32?" from logs alone?
6. **Failure UX?** When the API fails, does the user know? Does the UI recover or freeze?
7. **Security defaults on?** Are headers, CORS, rate limits, and input validation in place before the first feature ships?
8. **Version your API?** Will you ever need to make breaking changes? If yes, version from day one.

---

## 10. Scaling & Capacity *(HLD + ops)*

Where the system bends under load, what's already hardened in v2, and what's parked. The full deploy topology, env-var contract, and devops handoff live in `dev-deployment.md` — this section doesn't duplicate them. The choices that make scaling *cheap* — stateless backend, Postgres-backed rate limiter, env-driven config, swap-ready infrastructure, modular monolith — are detailed in §1, §2, §4, and §8 above; here we cover thresholds, bottlenecks, and capacity. **Upgrade on evidence (actual CPU / memory / DB query time), not assumption.**

### Environment model
v2 deliberately **splits** the three layers v1 collapsed into one Docker stack, so each scales, deploys, and fails independently:
- **Frontend** — static build on **S3 + CloudFront** (no server, no Docker)
- **Backend** — **EC2 + Docker**, a single container running the Node API only
- **Database** — **RDS PostgreSQL 16** in a private subnet (backend security group is the only inbound)

Two fully isolated environments — **staging** and **prod** — each with its own EC2, RDS, and Cognito user pool. Repos are split to mirror the infra (backend / frontend / mobile-later). **Current status:** staging is **live** on this stack (HTTPS via Let's Encrypt + host Nginx); prod cutover pending. Env reload model: backend `.env` is **mounted** (edit → restart container); frontend `NEXT_PUBLIC_*` are **baked at build** (edit → rebuild).

### Scale thresholds — when to act
Infra grows in steps tied to user count; each band names the next thing to change — don't skip ahead. Items already in place for v2 are noted so you don't redo them.
- **0–500 users** — current setup is fine. Single backend EC2, RDS, CloudFront frontend.
- **500–2,000** — vertical-scale the EC2 (`t3.medium → t3.large`); bump the pg pool only if the connection alarm fires.
- **2,000–10,000** — add an ALB + a second backend EC2 (horizontal); consider Redis as a read cache. _(RDS and the Postgres-backed rate limiter are already in place — no action needed.)_
- **10,000+** — ECS/EKS · RDS read replicas · Redis cluster · larger CloudFront/WAF tuning.

### Bottlenecks & fixes
Every known limitation, its current v2 status, the fix trigger, and where it lives.

| #   | Bottleneck                        | Status (v2)         | Fix when                             | Location                            |
| --- | --------------------------------- | ------------------- | ------------------------------------ | ----------------------------------- |
| 1   | Rate limiter                      | ✓ Done in v2        | n/a — Postgres-backed, multi-EC2 safe | `backend/middleware/rateLimiter.ts` |
| 2   | DB connection pool (`max ~10`)    | Active, fine        | Connection-exhausted alarm fires     | `backend/config/db.ts`              |
| 3   | No caching                        | Parked (RF-14)      | High RDS CPU on read-heavy endpoints | `MembershipResolver`, model files   |
| 4   | Auth                              | ✓ Done in v2        | n/a — now AWS Cognito                 | `modules/auth/` (`AuthService`)     |
| 5   | Single backend EC2 / single proc  | Active, acceptable  | CPU >70% / need zero-downtime deploy | EC2 + (future) ALB                  |
| 6   | Database hosting                  | ✓ Done in v2        | n/a — RDS from day-1                  | RDS Postgres 16 · `DB_HOST`         |
| 7   | File storage                      | Parked (v3 uploads) | Before any file-upload feature       | S3 `rai-{env}-uploads`              |
| 8   | Frontend error tracking (Sentry)  | Not set up          | Before / at prod deploy (v1 Phase 9) | `frontend/`                         |

**Details:**

**1. Rate limiter — ✓ Done in v2**
- **Was (v1):** counters lived in process memory, so each instance counted separately — a user could hit instance A 100× + B 100× = 200, bypassing the 100/15min limit.
- **Now:** ships with `rate-limit-postgresql` (PostgresStore against the existing RDS). Single source of counter truth — works on single EC2 today and multi-EC2 later with **zero code change**.
- **Future (parked, RF-14):** swap the store to Redis if/when lower latency than Postgres is needed.

**2. DB connection pool**
- **Problem:** the app-level `pg` pool is ~10 connections; under high concurrency, extra requests queue for a free connection.
- **Status:** ~10 is fine for v2 — don't pre-tune. The CloudWatch "DB connections > 80% of pool" alarm is the signal to bump.
- **Fix:** raise the pool `max` (tune to the RDS instance class) when the alarm fires.

**3. No caching — parked (RF-14)**
- **Problem:** every request hits RDS; repeated reads (project / user / sprint lists, membership lookups) re-query each time.
- **Status:** intentionally no app cache in v2. Membership resolution goes through `DbMembershipResolver` (a LEFT JOIN across `users` / `user_orgs` / `organizations` / `subscriptions`).
- **Fix (v3):** drop in `CachedMembershipResolver` (Redis lookup-then-fallback) with zero middleware change, once measured load crosses the RF-14 trigger. General read cache: _check cache → return on hit → else query DB → write back_, TTL 60s for lists.

**4. Auth — ✓ Done in v2**
- **Was (v1):** self-built JWT, stateless — token revocation wasn't possible, so a stolen token stayed valid until expiry.
- **Now:** **AWS Cognito user pool.** Revocation via `signOut({ global: true })`, refresh-token rotation, account lockout, password strength, MFA + SSO are pool toggles. JWTs validated offline against cached JWKS (`aws-jwt-verify`) — no DB lookup for token validity.
- **Fallback by design:** all auth sits behind an `AuthService` interface, so a swap back to self-built JWT (or Auth0/Clerk) is a new implementation + one DI wiring line, not a rewrite. `JWT_SECRET` remains as a transitional value only.

**5. Single backend EC2 / single process**
- **Problem:** Node is single-threaded (one process = one core); if the EC2 goes down, the backend is down.
- **Status:** acceptable day-1. Backend is **strictly stateless** (no in-memory session, cache, or counter — the one historical exception, the rate limiter, is already Postgres-backed), so scale-out needs no code change.
- **Fix (in order):** ① **vertical** — `t3.medium → large → xlarge` (one console click); ② **horizontal** — add an ALB, put the existing + a new EC2 in a target group (~$16/mo); ③ **DB** — RDS instance class up → Aurora (swap target) → read replicas.

**6. Database hosting — ✓ Done in v2**
- **Was (v1):** PostgreSQL in a Docker volume on the EC2 disk — loss risk on instance failure, no backups, no replicas, connection limit tied to instance size.
- **Now:** **RDS PostgreSQL 16** in a private subnet (Multi-AZ for prod, single-AZ for staging, automated daily backups with 7-day retention). Staging is already live on RDS. Local dev still uses Docker Postgres.
- **Future (parked):** Aurora swap (~3× cost) under `upgrades.md`; read replicas (RF-14) for heavy read traffic.

**7. File storage — parked (v3 uploads)**
- **Problem:** local-disk attachments/avatars are lost on container restart or EC2 replacement.
- **Status:** the S3 uploads bucket (`rai-{env}-uploads`, public access blocked, versioning on) is provisioned; the upload feature itself is v3.
- **Fix:** write to S3 from day one of the feature; **never** write files to local disk.

**8. Frontend error tracking (Sentry) — not set up**
- **Problem:** production browser JS errors are invisible (`logger.error()` only writes to the console, so we never learn when real users hit errors).
- **Status:** still the open gap. Backend critical errors are **already** covered by the CloudWatch → SNS → email pipeline (RF-8) — this item is the **frontend** side only.
- **Fix:** add `@sentry/nextjs` (wraps Next at the framework level); minimal change — `next.config.ts` + two Sentry config files. Do before prod deploy (was tagged **v1 Phase 9**).

### Scaling order of operations
When CPU / memory / latency degrade, act cheapest-and-simplest first:
1. **Vertical scale.** Bump the EC2 instance class (`t3.medium → large → xlarge`). One console click, ~5-min restart. Covers most spikes.
2. **Horizontal scale.** Add an ALB → existing EC2 + a new one in a target group. Zero-config because the backend is stateless (rate limiter already shared via RDS). ~$16/mo for the ALB.
3. **Database scale.** RDS instance class up → Aurora (swap target, `upgrades.md`) → read replicas (RF-14) when reads dominate.

### Current capacity
- **Backend** — single EC2 (`t3.medium` staging baseline), one Docker container, stateless
- **Database** — RDS Postgres 16 (`db.t4g.small` staging / `db.t4g.medium` prod), private subnet
- **Frontend** — S3 + CloudFront (static; effectively not a capacity constraint)
- **Weak point** — RDS first: the app pg pool (`~10`) + no read cache means the database feels pressure before the backend does
- **Downtime risk** — backend is a single EC2 day-1 (single point of failure until the ALB step); RDS Multi-AZ removes the DB as one in prod
- Not yet formally load-tested on the v2 topology — capacity is monitor-driven. Watch the CloudWatch alarms (5xx rate, DB CPU, DB connections) and **act on evidence, not assumption.**

### Infra upgrade order — done vs remaining
**Already done in v2:** ① DB on RDS (private subnet, backups, Multi-AZ for prod) · ② Auth on Cognito (`modules/auth` behind `AuthService`) · ③ Rate limiter on Postgres store (multi-EC2 safe) · ④ Frontend on S3 + CloudFront (ACM cert + WAF basic rate-limit) · ⑤ Backend critical-error alert pipeline (CloudWatch → SNS → email, RF-8).

**Remaining, in order:** ① Add **Sentry** to the frontend _(before prod deploy)_ · ② **ALB + a second backend EC2** when vertical scaling stops being enough · ③ **Redis** (read cache + lower-latency rate-limiter store) at the RF-14 trigger · ④ Move backend to **ECS** for managed orchestration · ⑤ **RDS read replicas** for heavy read traffic.

---

## 11. Principles — Followed vs Deferred *(meta)*

The named principles Rai runs on, and the ones it consciously skipped. Each rule in §§1–10 is an instance of one of these. **Deferred ≠ rejected** — most are parked in `upgrades.md` / `v2-decisions.md` behind an evidence trigger.

### Followed

**Core SDE**
- **SRP (Single Responsibility)** — model = data access, controller = request flow, service = business logic; one concern per middleware.
- **OCP (Open/Closed)** — swap-ready `AuthService` / `BillingService` behind an interface: extend by a new impl, never edit consumers (§8).
- **LSP (Liskov Substitution)** — `MockAuthService` drops in for `CognitoAuthService` in tests without breaking callers.
- **ISP (Interface Segregation)** — thin, purpose-specific interfaces (`AuthService`, `MembershipResolver`), no fat contracts.
- **DIP (Dependency Inversion)** — controllers depend on the interface; DI wires the concrete implementation.
- **KISS** — modular monolith over microservices; raw SQL over ORM magic.
- **YAGNI** — no cache / replicas / ALB until a measured trigger (§10).
- **DRY** — one `/api/v1` prefix const, copy centralized in `content/`, one canonical doc per topic.
- **Separation of Concerns** — domain modules; `routes → controller → model`; server vs client state split.
- **Single Source of Truth** — server/DB is the fact; optimistic UI + `reqId` reconcile back to it.
- **Fail-fast** — env validation exits the app on a missing secret.
- **Law of Demeter** — cross-module calls go only through the other module's service file (§2).

**Database**
- **Normalization** — relational schema, minimal redundancy; denormalize only on measured read pressure.
- **Parameterized queries** — every variable via `$1, $2` through `pg`; no string-concat SQL.
- **Indexing strategy** — hot-path covering indexes at the first migration (equality-first composites, partial indexes).
- **DB constraints** — FK / NOT NULL / CHECK / UNIQUE enforce rules even when app code is buggy.
- **ACID transactions** — any multi-table write is one transaction, all-or-nothing.
- **Forward-only migrations** — ordered, versioned; never edit a shipped migration.
- **Concurrency-safe claiming** — `FOR UPDATE SKIP LOCKED` lets cron run on multiple instances without double-processing.
- **Connection pooling** — shared `pg` pool with an error handler (no silent crash).
- **Tenant isolation** — `WHERE org_id = $1` in every tenant-scoped query.
- **Soft-delete + audit columns** — recoverable deletes; `created_at` / `updated_at` on rows.

**Backend**
- **Stateless / 12-factor** — no in-memory cross-request state; all config via env vars.
- **Atomic cross-system writes** — Cognito-first + bounded retry + best-effort compensation (RF-8).
- **Defense-in-depth** — app validation + DB constraints + managed auth, layered.
- **Idempotent jobs** — re-running a cron query skips already-fired rows.
- **Scope-from-JWT-never-URL** — `org_id` comes from the token; URL slugs are display-only (§2).

**Frontend**
- **Server/client state split** — TanStack Query for server data, Zustand for UI/auth.
- **Optimistic-with-rollback** — instant UI; snapshot revert + error toast on failure.
- **Scope-keyed caches** — `['org', orgId, ...]` so an org switch can't bleed another tenant's data.
- **Every state handled** — loading / error / empty / 404 on every page.
- **Error boundary** — `app/(app)/error.tsx` catches unexpected render crashes.

**Security**
- **Least privilege** — IAM-scoped accounts; role gates on routes.
- **Defense-in-depth** — app + DB + Cognito each enforce independently.
- **Secure-by-default** — Helmet / CORS / rate-limit on before feature #1.
- **Managed auth** — Cognito owns hashing, lockout, reset, MFA, refresh-token rotation.

**DevOps / CI-CD**
- **Containerized & reproducible** — the same Docker image promotes dev → staging → prod.
- **Environment parity** — staging mirrors prod, each fully isolated.
- **Infra separation** — CloudFront (frontend) / EC2 (backend) / private-subnet RDS.
- **CI hard gates** — tsc · test · `npm audit` · Trivy; a bad image can't reach ECR.
- **Secrets-in-env** — never in code or repo; validated at startup.
- **Zero-downtime deploys** — graceful SIGTERM drain before exit.
- **Alert pipeline** — reserved critical markers → CloudWatch → SNS → email.
- **Rollback** — versioned images + reversible migrations.

**Patterns**
- **Repository** — all SQL in `*.model.ts`; controllers never query.
- **MVC (adapted)** — `routes → controller → model`; the JSON response is the view.
- **Middleware chain** — security → logging → rate limit → route → 404 → error handler.
- **Service-interface** — the OCP + DIP workhorse for swap-ready infra (§8).
- **Dependency Injection** — implementations wired in one place behind interfaces.

### Deferred (parked, not rejected)

- **Microservices** — modular monolith instead; extract a domain only on scaling evidence.
- **Caching / Redis** — none in v2 (RF-14); add when RDS read CPU climbs.
- **Row-Level Security (RLS)** — app-level tenant scoping is the contract today; model code is already RLS-ready, so it layers on later as defense-in-depth.
- **Realtime / WebSockets** — no live-update need; REST + refetch suffices.
- **Geospatial / PostGIS** — no location features.
- **GraphQL** — REST chosen (simpler, one endpoint per resource, mobile-friendly).
- **ORM (Prisma / TypeORM)** — raw `pg` for full control.
- **Horizontal scale (ALB + 2nd EC2)** — stateless so ready, but single EC2 day-1; add at the CPU trigger.
- **RDS read replicas / Aurora** — parked until reads dominate.
- **Frontend error tracking (Sentry)** — open gap; add before prod deploy.
