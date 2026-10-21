# Rai — Future Upgrades & Alternative Approaches

> ## 📌 TODO — EventBridge cron setup (code DONE in RP-3; only AWS config remains)
> Approach: **HTTP endpoint** (RP-3), not SSM/docker-exec. EventBridge → ALB → `POST /api/v1/internal/jobs?job=<name>`.
> Single dispatch endpoint — one API destination, `job` query param selects the handler.
> The ALB forwards to ONE healthy target → job runs once with no instance-tagging. See convo-069.
> ```
> Code (already merged into backend dev — no action):
>   - jobs/cron.ts deleted; node-cron removed; startCronJobs/stopCronJobs gone from server.ts.
>   - jobs/jobs.routes.ts added → POST /api/v1/internal/jobs?job=<name> (x-internal-secret header auth).
>     400 if job param missing or unrecognised.
>   - npm scripts kept for manual runs (jobs:sprint-autostart, jobs:invite-cleanup, billing:sweep, purge:orgs).
>
> AWS config (TODO, per env — staging + prod):
>   - Set INTERNAL_JOB_SECRET on backend (same value used in EventBridge connection).
>   - EventBridge: 1 Connection (header x-internal-secret) + 1 API Destination
>     (endpoint = base backend URL + /api/v1/internal/jobs, POST).
>   - 4 Schedules, timezone Asia/Kolkata — each adds query string param key `job`:
>       hourly    → ?job=sprint-autostart
>       daily 0300→ ?job=invite-cleanup
>       daily 0315→ ?job=billing-sweep
>       daily 0330→ ?job=purge-orgs
>   - Harden: ALB listener rule restricting /api/v1/internal/jobs* to AWS EventBridge source IPs.
>   - Verify each via docker logs rai-api after first run (endpoint logs start/finish).
> ```

> ## ⭐ MOST IMPORTANT — Agent-ready access (PATs + MCP)
> Make Rai usable from Claude / agentic tools. API already works headlessly; the gap is auth ergonomics.
> - **Don't** hand users raw Cognito JWTs (1h expiry, ID token isn't for API auth).
> - **Do:** issue **Personal Access Tokens** (Settings → revocable, scoped `rai_pat_…`) — GitHub/Stripe model.
> - **Endgame:** thin **MCP server** over existing endpoints → native `move_ticket` / `list_projects` tools, plain-language control.
> - Path: ship PAT issuance → wrap API in MCP.
> - **Design detail added 2026-07-17 (convo-072):** the PAT is a **standalone random secret** — never a Cognito token with a key concatenated onto it. Store only `sha256(pat)`; show plaintext once. Insertion point is the top of `middleware/authMiddleware.ts` (branch on the `rai_pat_` prefix → resolve to the same `AuthUser`; everything downstream is untouched). **Scope each key to one org for v1** — `currentOrgId` is server-side session state today, so concurrent agents would stomp each other's org. CORS is a non-issue (agents are server-to-server); explicitly reject PATs from browser origins. Auth is only half — serve **`/openapi.json`** so a stranger's agent can *discover* endpoints without repo access.

> ## 📌 Priority stack — set 2026-07-17 (convo-072)
> User's explicit ranking. "If we can't deliver everything, these are the highest priorities."
> **Must-ship (in order):**
> 1. **Agent-ready access** (the ⭐ block above).
> 2. **The bug fixes** — side-panel comment section not scrollable; board wrongly defaulting to the logged-in user.
> 3. **Media/attachments + the markdown/textbox revamp** — treated as one push; they share the composer.
>
> **Everything else queued below:** criticality filter, kanban empty state, profile pics/customisation, customisable kanban columns, org-level reports, plus the Cognito-logo / feedback-email / mobile-responsiveness bugs.

**Purpose:** Single source of truth for things we plan to add later AND alternative ways to implement things we're already doing. When a feature gets parked during a discussion, it lands here. When we pick implementation A knowing implementation B is a viable swap target, the alternative lands here. `v2-plans.md`, `v2-decisions.md`, and `dev-standards.md` reference this doc instead of duplicating.

Two sections:
- **Upcoming Features** — features parked during decision discussions. Not in scope right now, but we know we'll do them.
- **Alternative Implementations** — different ways to do things we're already doing, captured in case we want to swap later. Excludes options we ruled out completely.

Last updated: 2026-07-17 (convo-072 — priority stack set; Default-to-me reversed; attachments promoted; markdown revamp, criticality filter, kanban empty state, customisable columns, and org-level reports added).

## Contents

- [⬆ Promoted to v2 — Production go-live plan (2026-06-08)](#-promoted-to-v2--production-go-live-plan-2026-06-08)
  - [Launch decision](#launch-decision)
  - [Pulled forward from v3 (phase mapping)](#pulled-forward-from-v3-phase-mapping)
  - [Go-live checklist](#go-live-checklist)
- [⚠ Needs Discussion (2026-06-08 cross-check)](#-needs-discussion-surfaced-2026-06-08-cross-check)
- [⚠ Needs Discussion (2026-07-17, convo-072 cross-check)](#-needs-discussion-surfaced-2026-07-17-convo-072-cross-check)

**Upcoming Features**

- [Cognito CustomMessage Lambda trigger](#cognito-custommessage-lambda-trigger-richer-email-templating)
- [Global search: expand beyond tickets](#global-search-expand-beyond-tickets-projects--sprints--members--comments)
- [Per-user starring for projects + sprints + tickets](#per-user-starring-for-projects--sprints--tickets-pinning--filterable)
- [Project color hash: full-key sum + expanded palette](#project-color-hash-full-key-sum--expanded-palette)
- [Default-to-me filter on ticket-listing pages](#default-to-me-filter-on-ticket-listing-pages) ⚠ *reversed 2026-07-17*
- [Type-specific ticket fields (Jira parity)](#type-specific-ticket-fields-jira-parity)
- [Markdown/textbox revamp](#markdowntextbox-revamp--full-md-support-that-actually-looks-good) ⭐
- [Filter board by ticket criticality / priority](#filter-board-by-ticket-criticality--priority)
- [Kanban empty state — prompt to create + start a sprint](#kanban-empty-state--prompt-to-create--start-a-sprint)
- [Customisable kanban columns / stages](#customisable-kanban-columns--stages)
- [Org-level reports / visualisations across all projects](#org-level-reports--visualisations-across-all-projects)
- [Code-based org invites (Discord-style join codes)](#code-based-org-invites-discord-style-join-codes-alongside-email-invites)
- [Row-Level Security (RLS) defense-in-depth](#row-level-security-rls-as-defense-in-depth-on-top-of-middleware)
- [Vanity subdomains per org](#vanity-subdomains-per-org-acmeraiapp)
- [Manage-devices UI](#manage-devices-ui-push-notification-device-list-per-user)
- [Pre-production email/sender hardening](#pre-production-emailsender-hardening)
- [Deterministic-color assignment](#deterministic-color-assignment-for-projects--orgs--members-collision-free-until-palette-exhausts)
- [Custom DP / logo / avatar for orgs and projects](#custom-dp--logo--avatar-for-orgs-and-projects-and-member-avatars)
- [Password-reset: reject reusing current password](#password-reset-reject-reusing-the-current-password)
- [Org slug rename with alias redirects](#org-slug-rename-with-alias-redirects)
- [Admin-invites-admin owner approval guard](#admin-invites-admin-requires-owner-email-approval-privilege-escalation-guard)
- [Mobile push notifications via FCM](#mobile-push-notifications-via-firebase-cloud-messaging-fcm)
- [WebSocket-based in-app notifications](#websocket-based-in-app-notifications-replace-polling)
- [SMS notifications (Twilio / AWS SNS)](#sms-notifications-twilio--aws-sns)
- [Slack / Microsoft Teams integrations](#slack--microsoft-teams-notification-integrations)
- [AWS EventBridge + Lambda for scheduled jobs](#aws-eventbridge--lambda-for-distributed-scheduled-jobs)
- [Strict private-project visibility](#strict-private-project-visibility-creator-admin--assigned-pm-only-owner-always-sees-all)
- [OTP / 2FA verification for ownership transfer](#otp--2fa-verification-for-ownership-transfer)
- [OTP gate for all destructive actions](#otp-gate-for-all-destructive-actions-v3-expansion)
- [Org switch preserves current page](#org-switch-preserves-current-page-v3-smart-redirect)
- [MFA / 2FA (TOTP, SMS, push)](#mfa--2fa-totp-sms-push)
- [Active sessions UI](#active-sessions-ui-settings--your-active-sessions)
- [Suspicious activity detection](#suspicious-activity-detection-login-from-new-ipdevice-prompts-mfa-or-email-confirmation)
- [Disposable / temp-mail blocking at signup](#disposable--temp-mail-blocking-at-signup-anti-fake-account)
- [Comprehensive audit logging](#comprehensive-audit-logging-app-wide-not-just-auth)
- [Third-party SSO (Google/Microsoft v2; GitHub v3) (RF-7)](#third-party-sso--google--microsoft-in-v2-github-in-v3-saml--oidc-remain-parked-rf-7)
- [Domain-based auto-org-join (RF-7)](#domain-based-auto-org-join-acmecom--acme-org-rf-7)
- [Workspace merge tool](#workspace-merge-tool-clean-up-duplicate-orgs)
- [Card-at-signup for trial](#card-at-signup-for-trial-anti-abuse-mitigation)
- [Token refresh storm handling (RF-2)](#token-refresh-storm-handling-high-concurrency-refresh-rf-2)
- [Multi-region Cognito user pools (RF-2)](#multi-region-cognito-user-pools-rf-2)
- [Backend per-user serialization lock (RF-6)](#backend-per-user-serialization-lock-for-org-switching-rf-6)
- [Outbox pattern for cross-system writes (RF-8)](#outbox-pattern-for-cross-system-writes-cognito--postgres-rf-8)
- [Redis cache for membership lookups (RF-14)](#redis-cache-for-per-request-membership-lookups-rf-14)
- [Cache invalidation strategy (RF-15)](#cache-invalidation-strategy-for-membership-cache-rf-15)
- [Read replicas for membership query (RF-14)](#read-replicas-for-the-membership-query-rf-14)
- [CSRF tokens for cookie-based auth](#csrf-tokens-for-cookie-based-auth-beyond-samesitelax-baseline)

**v3 Billing Follow-ups**

- [Real payment provider (Razorpay / Stripe)](#real-payment-provider-razorpay-primary-stripe-alt)
- [Card requirement at signup](#card-requirement-at-signup)
- [GST invoicing](#gst-invoicing-india-specific-mandatory)
- [Dunning policy](#dunning-policy-failed-payment-retries)
- [Refund policy](#refund-policy)
- [Chargeback handling](#chargeback-handling)
- [Annual billing interval](#annual-billing-interval-with-discount)
- [Multi-currency](#multi-currency)
- [Discount codes / coupons](#discount-codes--coupons)
- [Subscription pause (vs hard cancel)](#subscription-pause-vs-hard-cancel)
- [Mid-cycle proration](#mid-cycle-proration-final-lock)
- [Reactivation-after-cancel window](#reactivation-after-cancel-window)
- [Invoice receipts to billing contact](#invoice-receipts-to-billing-contact)
- [Webhook idempotency](#webhook-idempotency)

**Data Retention & Portability (Q14)**

- [Org-level data import](#org-level-data-import-counterpart-to-export)
- [User-facing restore ("recycle bin")](#user-facing-restore-recycle-bin)
- [Internal Admin Panel (v3)](#internal-admin-panel-v3)
- [Internal product analytics layer (v3)](#internal-product-analytics-layer-v3)
- [Feature backlog — v3 planning notes](#feature-backlog--discussion-notes-for-v3-planning-nothing-finalised)
- [Org name reclamation / "domain auction"](#org-name-reclamation--domain-auction-v4v5)

**Alternative Implementations**

- [Backend hosting: ALB + multi-EC2](#backend-hosting-alb--multi-ec2-instead-of-single-ec2-with-nginx)
- [Backend hosting: ECS / Fargate](#backend-hosting-ecs--fargate-instead-of-ec2--docker)
- [Database: Aurora PostgreSQL](#database-aurora-postgresql-instead-of-rds-postgresql)
- [DNS: Route 53](#dns-route-53-instead-of-godaddy)
- [Rate-limiter store: Redis](#rate-limiter-store-redis-instead-of-postgres)
- [Auth: Self-built JWT](#auth-self-built-jwt-instead-of-aws-cognito)
- [current_org_id injection: Pre-Token-Generation Lambda](#current_org_id-injection-pre-token-generation-lambda-instead-of-custom-user-attribute)
- [Cross-tab session sync: BroadcastChannel](#cross-tab-session-sync-broadcastchannel-instead-of-storage-event)
- [Web token storage: cookie via Amplify config](#web-token-storage-cookie-via-amplify-config-instead-of-localstorage-default)

**⚠ Needs Discussion**

- [Email deliverability hardening (SPF/DKIM/DMARC + warmup)](#email-deliverability-hardening--spf--dkim--dmarc--domain-warmup)
- [Org-level soft-delete / trash-bin](#org-level-soft-delete--trash-bin-before-billing-ships)
- ["Bought sub then deleted org" edge case](#bought-subscription-then-deleted-org-edge-case)
- [R&D / non-IT use of the PM tool](#rd--non-it-use-of-the-pm-tool)
- [Raw notes to explore](#-raw-notes-to-explore-added-2026-06-08--need-to-discuss)

[How to use this doc](#how-to-use-this-doc)

---

## ⬆ Promoted to v2 — Production go-live plan (2026-06-08)

v2 is the **final pre-prod build** — we ship to **production** at the end of it. This section is the **single reference** for that push: the launch decision, what was pulled forward from v3, and the full go-live checklist. Detailed specs stay in their `§` sections below + the `v2-plans.md` phases; nothing here is "later".

### Launch decision
- **Ship to prod at the end of v2.** The **mobile app is ready** (separate dev) and ships to prod alongside web.
- **Skip the internal admin dashboard** for launch — support runs through the `support@` shared inbox until volume justifies it (parked, § Internal Admin Panel).
- Assorted **minor changes / polish** folded into the same push.
- **Cut to v3:** custom logos / avatars — not launch-important; deterministic colored letter-squares stay as v2 identity (§ Custom DP / logo / avatar).
- **Explicitly out for launch:** internal admin dashboard (support@ instead), internal product analytics (deferred), and everything under § Upcoming Features not in the checklist below.

### Pulled forward from v3 (phase mapping)
Items moved v3 → v2, with where they land. Specs in their `§` sections; phases in `v2-plans.md`.

| Item | Phase | v2 scope note |
| --- | :-: | --- |
| Razorpay real payment provider | 4 | Only *advanced* billing follow-ups remain v3 (§ v3 Billing Follow-ups) |
| Org-level data import | 5 | § Org-level data import (export/import scope under review). **Entity** recycle bin (tasks/sprints) → back to v3 on 2026-06-08; org-level recycle bin shipped (migration 012). |
| MFA / 2FA · Active sessions UI · Suspicious activity detection | 7 | See those `§` sections |
| OTP gate for destructive actions (incl. ownership transfer) | 7 | ✅ Core done in v2 (email-OTP — org/project delete + transfer). Billing OTP + Cognito-MFA upgrade still parked: § OTP gate… · § OTP / 2FA … ownership transfer |
| Mobile push (FCM) | 3 | ✅ Backend done in v2 — `device_tokens` (migration 018) + `/api/v1/devices` register/unregister + real `push.channel` (FCM send + dead-token prune) + `config/firebase.ts`. Remaining: Firebase credential (`FIREBASE_SERVICE_ACCOUNT`) + mobile client + handoff doc (app = separate dev). |

### Go-live checklist
The complete list to reach production, grouped by track. Rationale is inline; full specs in the `§` sections + `v2-plans.md` phases.

**Status legend:** ✅ done · 🔄 in progress · ⚠ critical, still open · _(no marker)_ not started. Done items keep their line, gain a ✅ + date + one-line "how/where", and drop any ⚠ — so the remaining ⚠ lines are always "what's critical and still open".

**A. Non-code (paperwork / admin)**
- **Terms of Service** — drafted (`Guide/Official Documentation/`); fill placeholders + legal review.
- **Privacy Policy** — drafted (DPDP-aligned); fill placeholders + legal review.
- **`support@` inbox** — set up + actively monitored (also the privacy / grievance contact).
- **Release notes + product guide** — drafted; final review before publish.
- **Mobile team handoff doc** — write + hand over (API contract, FCM register endpoint, auth flow).
- **Pricing page / plan details** — final pricing, billing cycle, and trial terms shown to users.
- **Company / contact details** — registered entity name, address, grievance officer named in docs.

**B. Engineering — launch-critical (scoped in v2 phases)**
- ⚠ **Email deliverability** — SES sandbox exit + SPF / DKIM / DMARC + branded Cognito emails via SES. *Blocks onboarding: invites + password-resets otherwise land in spam or silently fail.* (§ Pre-production email/sender hardening)
- ⚠ **Org-level soft-delete / recycle bin** — `deleted_at` on `organizations` + 30-day purge, **live before billing** so an accidental org delete is recoverable. Entity-level restore (tasks/sprints) = § User-facing restore (**v3**, not v2).
- ⚠ **DB backups + tested restore** — RDS automated backups / PITR, restore **rehearsed once**. *Losing the DB with no backup is fatal for a paid product.* (surfaced 2026-06-08)
- **Critical-error alert pipeline** — CloudWatch + SNS → email (RF-8) + external uptime / health ping. *Can't run paid prod blind.*
- **MFA / 2FA + active sessions** (Phase 7) — launch-critical for B2B trust.
- **Mobile push (FCM) — Firebase setup + creds** — backend code is ✅ done (Phase 3); pre-prod = create the Firebase project → generate a service-account key → base64 into backend `FIREBASE_SERVICE_ACCOUNT` → restart → hand the mobile dev the project + the register/unregister endpoint contracts. Push is a no-op until this is done (in-app + email unaffected). Cred under `devops@novetum.com`. Steps: `dev-notifications.md` → "Firebase setup". *Not launch-blocking for web; needed before the mobile app ships.*
- **Type-specific ticket fields + data export / import** (Phases 5/6) — product completeness.
- **Prod DNS cutover + SSL cert.**
- **Razorpay live keys** — swap test → live + verify a real end-to-end payment.
- **Finish remaining v2 feature scope** (per phases).

**C. Engineering — additional (not in the phases above)**
- **Prod environment stood up** — prod EC2 (separate from staging), Docker, nginx, prod DB.
- **Legal pages wired in-app** — link ToS + Privacy in the footer, signup, and billing screens.
- **Account / org deletion + data-export flow** — user can leave and take their data (privacy compliance).
- **Cookie / session notice** — minimal banner if required for the launch region.
- **Rate-limiter prod retuning** — limiter already live (Postgres-backed); retune: per-user key (corporate NAT), per-endpoint limits (tighter on `/auth/*`), higher global ceiling. See `v2-plans.md`.
- **Secrets management** — prod secrets out of source, stored securely; rotate any reused from staging.
- **Prod env-var contract reviewed** — every required var set for prod; no staging values leak in.
- **Log retention / cost** — confirm CloudWatch log retention + cost sanity for prod volume.
- **Rollback plan** — known-good image + documented steps to revert a bad deploy.
- **Final typecheck + test pass** both ends.
- **Staging smoke test of the full prod flow** — signup → verify → create org → invite → billing → core work.
- **Security review pass** — auth, tenant isolation, permission checks, dependency audit.

> **Suggested order:** finish app → stand up prod infra (DNS / SSL / email / backups / alerts) → Razorpay live + paperwork wired in → security review → staging smoke test → cutover.

---

## Upcoming Features

### Cognito CustomMessage Lambda trigger (richer email templating)
**Status:** parked. Surfaced 2026-05-29 alongside the branded-email rollout.
**What's already done (v2):** branded HTML templates live in `frontend/content/emails/` for verify / forgot-password / MFA, pasted into the Cognito User Pool's built-in Message templates. Sender moves to SES with our verified domain (`no-reply@rai.novetum.com`). One-time AWS Console setup — no code in repo, no Lambda. Covers ~90% of branding needs.
**What this unlocks (v3):** variables the built-in templates can't reach. Examples we'll want eventually:
- Personalize verify emails with the user's display name ("Hi Diptanshu, ...") not just the email
- White-label per-org: send `Acme Co · Rai` branding when the user signed up via an Acme invite link
- Localize subject + body per user's selected language
- Embed a one-click magic-link instead of a code (where flow allows)
**How:** Cognito → Lambda triggers → **Custom message** → point at a Lambda that receives `{triggerSource, userAttributes, codeParameter, request}` and returns `{emailSubject, emailMessage}`. The HTML structure stays — only the variable substitution layer moves into code. Lambda reads the HTML from `frontend/content/emails/*.html` (bundled) and runs a small templating step (replace `{{name}}`, `{{org}}` tokens we control, plus Cognito's `{####}`).
**When to do it:** first time we genuinely need a variable the built-in template can't expand. Until then, the static HTML covers it.

### Global search: expand beyond tickets (projects + sprints + members + comments)
**Status:** parked for **v3**. Surfaced 2026-05-29 during search-scope review.
**Today (v2):** `GET /api/v1/search?q=` calls `searchTickets()` in `search.model.ts` — searches ticket title + description, scoped to the org + caller's visibility. Single result set, single endpoint.
**Gap:** users hitting Cmd+K expect a Linear/Notion-style spotlight that covers everything they can navigate to — not just tickets. Currently a teammate's name, a project key, or a comment body returns zero results unless it happens to match a ticket title.
**v3 scope:**
- **Projects** — match by name OR key, return `{id, name, key, projectColor}` with a project-icon prefix in results.
- **Sprints** — match by name, surface status pill (Active / Planned / Completed) so callers can spot the live one at a glance.
- **Members** — match by name OR email; return avatar + role chip. Always scoped to the caller's org.
- **Comments** — match by content with a snippet (~120 chars around the hit, bold the query). Link back to the parent ticket detail page with `?expand=comments&highlight=<commentId>`.
- **Unified response** — single `GET /api/v1/search?q=` returns `{ tickets, projects, sprints, members, comments }` with per-section limits (top 5 each). Keep the per-section model functions so future surfaces (e.g. a "Search projects only" filter) can reuse them in isolation.
- **Frontend SearchModal** — grouped sections with section headers, keyboard nav across all sections (Cmd+K spotlight UX). Empty state when zero hits across the board.
**Why it's a v3 line item, not a v2 add-on:** the comment search needs a PostgreSQL full-text index on `comments.content` for non-pathological performance — touching the schema means a migration + recompute on existing data. We don't want to introduce that during v2 cutover.

### Per-user starring for projects + sprints + tickets (pinning + filterable)
**Status:** ✓ **Partially shipped in v2** (projects + tickets pinning, incl. sidebar + dashboard re-ordering). Sprint pinning and the "Starred" filter toggle remain parked for **v3**.

**✓ Done in v2 (2026-06-08) — projects + My Work pinning:**
- **Was:** no pinning; projects page ordered by sort dropdown only, My Work by status/recency only.
- **Now:** per-user pins, **capped at 3 per type** (cap enforced server-side; the parked spec had no cap). Table is `user_pins` (polymorphic: nullable `project_id` / `ticket_id` FKs + a `num_nonnulls = 1` CHECK), not the proposed `user_stars`. Toggle endpoints are `PUT`/`DELETE /api/v1/me/pins/{projects|tickets}/:id`; the `isPinned` flag rides on the existing `/projects` list + `/me/tickets` responses. Projects page floats pinned to the top; My Work shows a dedicated **Pinned** section above the grouped list.

**✓ Done in v2 (2026-06-09) — sidebar + dashboard now honour pins:**
- **Was:** sidebar listed active projects newest-first only; dashboard project grid + "My open tickets" ignored pins entirely (pinned items were invisible there).
- **Now:** pinned projects float to the top of both the **global sidebar** project list and the **dashboard project grid**, each with a filled **Pin** indicator icon; pinned tickets float to the top of the dashboard **"My open tickets"** panel with the same icon (matching My Work). All read-only surfaces — the pin *toggle* still lives only on the `/projects` index + My Work rows. Stable partition preserves newest-first / priority order within each group.

- **Still parked:** sprint pinning, the cross-page "Starred" filter chip, ticket-detail/board/backlog star surfaces, and star-order preservation. The v2 cut is intentionally a small UX add scoped to the projects index, My Work, sidebar, and dashboard.

**Original v3 spec (remaining scope):**
**Problem:** Sidebar today shows the N newest active projects and N most-active sprints. Users with many projects can't keep a small "I'm working on these" set always visible — the sidebar is at the mercy of recency/creation order. We want explicit pinning. Tickets get the same treatment so My Work / Board / Backlog filters can include a "Starred" toggle.
**For us:**
- **Star scope:** per-user, not per-org (each teammate has their own pinned list). New `user_stars` table (`user_id`, `target_type` = `'project'` | `'sprint'` | `'ticket'`, `target_id`, `starred_at`). Composite primary key (`user_id`, `target_type`, `target_id`).
- **Endpoints:** `POST /me/stars` (toggle), `GET /me/stars` (returns set keyed by type). Star action surfaces on project list rows, sprint rows, ticket detail headers, board cards, backlog rows, and the My Work list.
- **Sidebar order — projects:** starred first (in star-order, oldest star at top), then unstarred sorted by `createdAt` DESC. New stars go to the END of the starred group, NOT the top — preserves the order the user pinned things in.
- **Sidebar order — sprints:** active first (current rule), then starred (in star-order), then remaining by `startDate` DESC. Active sprints can never be hidden; stars only matter for the non-active tier.
- **Tickets:** star icon on every ticket card (board, backlog, my-work). Filter chips on Board / Backlog / My Work get a `Starred` option alongside the existing Status / Assignee / Type / Priority filters. Star indicator shows on the ticket detail header so it's obvious which tickets the caller flagged.
- **Dedicated pages:** `/orgs/<slug>/projects` and project-level `/sprints` get a `Starred` filter chip alongside Active / Archived / All. Star action lives on each row.
- **Storage:** keep stars server-side (not localStorage) so the pinned set follows the user across devices and tabs. Auth-guarded — owner of the star is the only one who can read/mutate it.
- **Tests:** stress seed should include a few users with 10+ stars each (mix of projects, sprints, and tickets) so we catch ordering and filter bugs early.

### Project color hash: full-key sum + expanded palette
**Status:** parked for **next phase** (post-v2, before v3 polish). Surfaced 2026-05-29.
**Today:** `projectColor(key)` in `frontend/lib/project.utils.ts` hashes only the first character of the project key: `PALETTE[key.charCodeAt(0) % PALETTE.length]`. With a 6-color palette this means projects sharing a first letter (SEED01, SARC01, STRESS — all `S`) land on identical colors. The seed surfaces this as "a sea of pink" in the projects list.
**Fix:**
- Switch the hash to sum-all-chars, mirroring `orgColor(slug)` already in the same file: `for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i)) | 0`.
- Bump `PALETTE` from 6 → ~10 colors (add a couple of mid-tones — teal, indigo, deep-amber — that aren't already in the member palette so project and member chips remain distinguishable side-by-side).
- Drop-in change, no migrations, no schema. Existing projects re-color on next render — devlog should call this out so customers aren't surprised by "my project changed color".

### Default-to-me filter on ticket-listing pages
> ⚠ **REVERSED 2026-07-17 (convo-072) — do NOT build as specced below.** Live use flipped the verdict: defaulting the board to the logged-in user is **annoying**, and the board must default to **all tickets from all users**. The plan below is kept as history (per the keep-history rule) and for the parts that survive — the `Just my tickets` pill and the localStorage persistence are still good, only the **default flips from `'me'` to `'all'`**. Reports/My Work guidance below was already correct and is unaffected.
> **Was:** first visit defaults `assigneeFilter = [currentUser.id]`. **Now:** first visit defaults `assigneeFilter = []` (everyone); the user opts *into* my-tickets, and their explicit choice still persists per-project.

**Status:** ⚠ **superseded — see the reversal above.** (Originally: parked for **next phase**, post-v2 before v3 polish. Surfaced 2026-05-29 during stress-test walkthrough.)
**Problem (as originally argued):** Board, Backlog, Reports, sprint detail — they all default to showing every ticket in the project. With a 100-ticket sprint and 50 members, the page is overwhelming on first load; the caller has to manually click their own avatar in the assignee filter every time. Default-to-me brings the page to "what I need to look at" first, with an explicit "All members" toggle to widen.
**For us:**
- On Board / Backlog / sprint detail (`/projects/:id/sprints/:sprintId`), default `assigneeFilter = [currentUser.id]` instead of `[]`.
- Show a clear pill at the top of the filter row: `Just my tickets ✕` — clicking ✕ clears to all-members view. Switching back to my-tickets is one click on the user's avatar in the existing chip row.
- Persist the user's choice per-project in localStorage so the page remembers their last filter mode (`rai.ticketFilter.{projectId} = 'me' | 'all'`). Default = 'me' on first visit; their explicit choice wins after.
- Reports page stays project-wide by default (it's a project-health view, not a personal queue).
- My Work page already filters to self by definition — no change.

Apply this as a single PR alongside the upgrades.md `Type-specific ticket fields` work since both touch ticket-listing surfaces.

### Type-specific ticket fields (Jira parity)
**Status:** parked for **next phase** (post-v2, before v3 polish). Promoted out of v3+ on 2026-05-28 — user flagged this as core product parity, not polish.
**Problem:** Today every ticket type (task / bug / story / epic) shares the same form — title, description, priority, assignee, sprint, parent. Mature tools (Jira, Linear, ClickUp) customize fields per type, which makes each ticket carry the right information for its intent.
**What Jira does:**
- **Epic** — `Epic Name` (short label) + `Epic Color` (used to tint child stories in board views) + a children panel.
- **Story** — `Story Points` (T-shirt / Fibonacci estimate) + `Acceptance Criteria` (multiline, often a checklist).
- **Bug** — `Steps to Reproduce` + `Environment` (browser / OS / build).
- **Task** — stays plain.
Custom field schemes ("screens") are wired per issue type via an admin-facing Field Configuration page.
**For us:**
- Schema: nullable `epic_color`, `story_points`, `acceptance_criteria` (jsonb checklist), `steps_to_reproduce`, `environment` columns on `tickets` — or a `ticket_field_values` jsonb sidecar table if we want to keep `tickets` lean.
- UI: type-conditional sections in the ticket detail page + create-ticket modal. Same RichSelect treatment for any picker fields.
- Reports: story-point burnup chart per sprint is a natural next step once we have points.
- Defer the admin "screen configuration" UI — start with hard-coded type-to-fields mapping, that already covers 99% of real teams.

### Cookie consent banner (v3)
- **Status:** parked for **v3**. Decided 2026-06-09.
- **Why deferred:** v2 uses only **essential auth storage** (Cognito tokens in localStorage) — no analytics/marketing/tracking cookies — so under DPDP/GDPR an opt-in banner isn't required; Privacy Policy disclosure suffices (already present).
- **When to build:** the moment analytics or any third-party tracker is added. Then add a simple accept/dismiss banner (choice in localStorage), gate non-essential scripts on consent, + a "Cookie preferences" link.

### Attachments on tickets / comments (Jira parity)
- **Status:** ⭐ **PROMOTED to highest priority (2026-07-17, convo-072)** — was parked v3 as "not launch-critical"; the user has now named it one of the three must-ships alongside agent-ready access and the markdown revamp. Emphasis on **media, especially screenshots**. (Originally flagged 2026-06-09; v2 shipped text-only tickets + comments.)
- **Build together with:** the [[markdown/textbox revamp]] (same composer surface) and [[Custom DP / logo / avatar]] (same S3 + presigned-upload subsystem — do the storage work once, not three times).
- **What Jira does:** drag-drop / paste files onto a ticket or comment — images render inline, other files show as download chips; per-file size cap; thumbnails for images.
- **For us (when implemented):** S3 (or compatible) object storage + a presigned-upload flow (client uploads directly to S3, backend only mints the URL + records metadata); an `attachments` table (`id`, `org_id`, `ticket_id`/`comment_id`, `uploader_id`, `filename`, `mime`, `size_bytes`, `s3_key`, `created_at`); virus-scan hook + allowed-type/size limits; signed download URLs scoped to org membership. UI: dropzone on the ticket panel + comment composer, inline image previews, download chips.
- **Why v3:** needs object storage + presigned uploads + scanning — infra beyond the v2 EC2+Postgres footprint, and not launch-critical.

### Markdown/textbox revamp — full md support that actually looks good
- **Status:** ⭐ **highest priority (2026-07-17, convo-072)** — one of the three must-ships.
- **Problem:** markdown support nominally exists already, but **both ends look bad** — the input textboxes and the rendered result. "Doesn't look good at all" was the verdict across the board.
- **Scope:** every textbox — ticket description, comments, and any other free-text surface. Both halves need the pass:
  - **Input:** a real editor — toolbar and/or shortcuts, live preview, sane paste handling.
  - **Output:** properly styled rendered markdown — headings, lists, code blocks, links, tables — that matches the design language instead of falling back to unstyled defaults.
- **Build with:** [[Attachments on tickets / comments]] — pasting a screenshot lands in this same composer, so the two features share one surface. Doing them separately means building the composer twice.

### Filter board by ticket criticality / priority
- **Status:** queued (2026-07-17, convo-072). Below the three must-ships.
- **What:** add a criticality/priority filter to the board's existing filter row.
- **Ship with:** the board assignee-default reversal (see [[Default-to-me filter on ticket-listing pages]]) — same filter surface, one PR.

### Kanban empty state — prompt to create + start a sprint
- **Status:** queued (2026-07-17, convo-072). Small, self-contained.
- **Problem:** when no sprint is active the board offers only a "Go to backlog" button — it doesn't tell the user what they actually need to do next.
- **Fix:** add a short note explaining a sprint must be created and started, plus a button that opens the **Create Sprint modal directly from the board** (no detour through backlog).

### Customisable kanban columns / stages
- **Status:** queued (2026-07-17, convo-072). **Genuinely new — no prior entry in this doc.**
- **What:** let orgs/projects rename board columns (Todo, Done, …) and define **multiple custom stages**, rather than the fixed set.
- **Why it's bigger than it looks:** ticket status is a fixed enum today. This needs a per-project workflow/statuses table, a migration off the enum, and a follow-through pass on **every status-dependent surface** — board, backlog, reports, filters, and any status-keyed logic. Treat as a real workstream, not a polish item.
- **Needs a scoping pass before any code.**

### Org-level reports / visualisations across all projects
- **Status:** queued (2026-07-17, convo-072). **Genuinely new — no prior entry in this doc.** User's own framing: "big scope but definitely needed."
- **What:** today reporting is **per-sprint** on the main home dashboard. Wanted: **org-wide** reports and visualisations spanning every project.
- **Open questions (scope before building):** which metrics; what aggregation level (org → project → sprint); and query performance on large orgs — this is the part that will bite, since it's the first genuinely cross-project read path.

### Code-based org invites (Discord-style join codes alongside email invites)
- **Status:** parked. v2 ships email invites only (Q6).
- **Decided at:** Q1 + Q6 discussions in `v2-decisions.md`.
- **Spec when implemented:** 8-character alphanumeric, uppercase, exclude confusable chars (0/O, 1/l, I). Multi-use. **Auto-refreshes every 24 hours** (rotates server-side to limit blast radius if a code is leaked or screenshot-shared) — admin can also force-rotate manually. Rate-limited per IP (10 attempts/hr) and per account (5/hr). Every join attempt logged.
- **Single token across UX surfaces:** the same value powers both `rai.app/join/<code>` deep links and the manually-typed code in the join modal. One token row server-side, two presentation paths.
- **Pairs with:** existing email invite system as a parallel path. Code for fast/in-person sharing; email for formal invitations.
- **Rejected: 6-digit numeric** — only 1M combinations, brute-forceable in minutes (attacker just needs to land on *any* valid org's code, not a specific one).
- **Rejected: static 7-day TTL** — refined to 24-hour auto-refresh so leaked codes naturally die fast.

### Frontend E2E browser tests (Playwright)
- **Status:** parked. v2 ships backend integration tests (`tests/v2-api.test.ts`) + frontend `tsc` typecheck only.
- **Decided at:** CI/CD setup discussion (2026-06-08).
- **Why parked, not rejected:** real frontend testing = full browser flows (login → create project → create ticket). Needs a running app + Cognito test users + a headless browser in CodeBuild — heavier and flakier than the backend suite. Typecheck already guarantees the client compiles and wires up correctly, which covers the common breakage; E2E is additive confidence, not a prod blocker.
- **What it would cover:** critical happy-path flows — auth (login/register/logout, expired-token redirect), create org → project → ticket, sprint board drag-drop, org switch.
- **Trigger to revisit:** post-prod stabilization, or when a UI regression slips past typecheck + manual QA. Pairs with broadening the backend suite beyond critical-path.

### Row-Level Security (RLS) as defense-in-depth on top of middleware
- **Status:** parked. v2 ships middleware-only tenant isolation.
- **Decided at:** Q1 discussion (preview); Q3 (full debate).
- **Why parked, not rejected:** running both walls from day one makes debugging "query returns empty" harder — could be middleware filtering or RLS rejecting. Easier path: ship middleware → debug → trust → layer RLS on top within the same v2 cycle. Both walls active before anything ships to production.

### Vanity subdomains per org (`acme.rai.app`)
- **Status:** parked. v2 ships path-based tenancy (`rai.app/orgs/<slug>`).
- **Decided at:** Q2.
- **Migration path:** infra-only — no schema, JWT, or query changes. Wildcard SSL cert (`*.rai.app`), wildcard DNS, cookie scope change to `.rai.app`, CORS allowlist update, 301 redirects from old paths. Detailed checklist in `dev-deployment.md` under "Future: vanity subdomain migration".
- **Trigger to revisit:** real customer demand (e.g. enterprise SSO/SAML where vanity URL matters).

### Manage-devices UI (push notification device list per user)
- **Status:** UI parked for v3; the backend store is real in v2 — minimal columns (`token`, `platform`, `user_id`, `created_at`, `last_seen_at`) in the **`device_tokens`** table, written via `POST /api/v1/devices`. No UI surface yet.
- **Decided at:** notifications discussion (May 2026).
- **Trigger to revisit:** v3 mobile app lands → users have multiple devices → need to see "which of my devices receive push notifications" and revoke specific devices.
- **v3 shape when implemented:** Settings → "Devices" page lists all registered devices per user. Shows device name + platform + last seen + a revoke button per row. Revoke = `DELETE FROM device_tokens WHERE id = $1` + invalidates that FCM token. Schema additions to `device_tokens`: `device_name`, `model`, `os_version`, `app_version` — added in small ALTER TABLE migrations alongside the UI work.
- **Distinct from:** "Active sessions UI" (parked elsewhere) — that's about Cognito auth sessions (which devices are signed in). This is about push notification delivery targets. Two different concerns, possibly merged into one Settings page in v3 design.
- **Why parked for v2:** no mobile app + no push channel = no devices to manage. v2 stub endpoint exists only to let v3 mobile team wire up immediately.

### Split Settings into Account vs Organization pages
- **Status:** parked for v3. v2 keeps one `/orgs/<slug>/settings` page, now grouped into four labelled clusters (You / This organization / Your organizations / Danger & recovery) — see `convo-066`.
- **Trigger to revisit:** org-side settings grow (richer member/role management, billing detail, security, integrations) and the single page gets long again.
- **v3 shape:** dedicated **org settings** page (org identity, billing, members, danger zone) split from a personal **account settings** page (profile, password, appearance, notifications). The "You" group becomes account settings; the org groups become org settings.

### Pre-production email/sender hardening
- **Status:** parked. v2 development ships with `systems@novetum.com` as the SES sender (existing devops mailbox, no new setup needed). Three deliberate items to land before production cutover:
- **Decided at:** SES setup walkthrough (May 2026).
- **Item 1 — Swap sender to a Rai-specific mailbox.** Provision `rai@novetum.com` (or migrate to `noreply@rai.app` once that domain is owned). Verify the new identity in SES, attach `ses:SendEmail`/`ses:SendRawEmail` IAM permission, update `SES_FROM_EMAIL` env var in backend `.env`, restart backend. Zero code change — fully env-driven. Old sender stays verified or gets deleted. **Why parked:** `rai@novetum.com` mailbox doesn't exist yet; `systems@novetum.com` works identically for dev/staging traffic.
- **Item 2 — Cognito → SES integration.** Today Cognito's own emails (signup verification, password reset, MFA codes) come FROM the AWS default address `no-reply@verificationemail.com` — unbranded, looks like spam. The pre-prod task: AWS Console → Cognito user pool → **Messaging** → **Email** → switch from "Send email with Cognito" to "Send email with Amazon SES" → select the verified Rai sender. From then on, all Cognito-sent emails route through our SES with our branding. **Why parked:** zero code dependency; pure devops config change; only matters for end-user perception which only matters once real users land.
- **Item 3 — Per-category sender segmentation.** Split the single transactional mailbox into purpose-specific senders: `noreply@` (auth/security), `notifications@` (product activity), `support@` (real mailbox for replies), `billing@` (subscription/invoices). Each becomes a separate verified SES identity; backend `email.channel.ts` picks the FROM based on notification category. **Why parked:** only matters at scale where users complain about mixing transactional categories; single sender covers v2 fine. Cross-referenced in `dev-notifications.md` "v3+ segmentation".
- **Item 4 — Exit SES sandbox (production access request).** v2 development happens with the SES account in Sandbox mode, where every recipient must be pre-verified via an AWS click-link. Fine for dev/internal testing (verify a handful of tester inboxes). NOT okay for production — real customers receiving invites/notifications can't be expected to click an AWS link first. The fix: AWS Console → SES → Account dashboard → **Request production access** → fill the use-case form (app description, email categories, expected volume, bounce/complaint handling). AWS reviews ~24h. Once approved: recipient verification drops entirely, daily send cap jumps from 200 to 50k+. **Why parked:** zero code dependency; pure devops + AWS review wait. Doing it before real customers land is essential — otherwise their invite emails silently fail.
- **How to apply:** when the v2 pre-production cutover checklist is being assembled, these four items go on it. None block development; all are devops + env-var + AWS-review work. Item 4 (production access) has the longest lead time (~24h AWS review) so file the request at least 2 days before customer-facing launch.

### Deterministic-color assignment for projects / orgs / members (collision-free until palette exhausts)
- **Status:** parked for **v3**. v2 ships the existing hash-based assignment: 6-color palette in `frontend/lib/project.utils.ts`, indexed by `key.charCodeAt(0) % 6` for projects, by sum-of-slug-chars mod 6 for orgs, by parseInt(id)/charCodeAt mod 5 for members (the `memberColor` helper in `ProjectSubNav.tsx`).
- **Decided at:** May 2026 — surfaced when a user reported two projects in the same org rendering the same color.
- **Why parked for v2:** the bug is visible but cosmetic (no functional impact). The proper fix (`color_index` column on `projects` + `organizations` with create-time assignment) is a schema migration + write-path change + backfill + small frontend swap — out of scope for the pre-Phase-3 v1-fixes polish window. Bigger palette + better hash is a band-aid (birthday paradox guarantees visible collisions past ~5 items regardless of palette size, see math below) so we deliberately did NOT do that as a half-measure.
- **Current behavior + collision math (so this isn't re-discussed):**
  - Hash-based deterministic with N colors → birthday paradox applies. At ~50% collision probability after `√(N × π / 2)` items: **N=12 → ~5 items**, **N=16 → ~6 items**, **N=20 → ~6-7 items**. None of those meet the "10-20 items before any collision" intuition.
  - First-char-only hashing (today's project code) ALSO has a clustering failure: `'A'`/`'G'`/`'M'`/`'S'`/`'Y'` all collide (each maps to `65/71/77/83/89 % 6 = 5`). Full-key hashing (already used by `orgColor`) removes the clustering but doesn't change the birthday-paradox limit.
- **v3 shape when implemented:**
  - **Projects + orgs:** add `color_index SMALLINT NOT NULL` column. Assigned at create-time as `(SELECT COUNT(*) FROM projects WHERE org_id = $1) % PALETTE_SIZE` (or `% PALETTE_SIZE` from `organizations` count for the org row itself). Frontend reads `project.colorIndex` / `org.colorIndex` and looks up the palette by index. Guarantees zero collisions until the org has > PALETTE_SIZE projects (e.g. > 20); after wrap, collisions are predictable (project 21 shares with project 1). Pattern Linear and Notion use.
  - **Members:** can't easily store (users live across orgs, picking one canonical color per user globally is awkward), so members stay hash-based — expand to a **16-color palette** + full-name hash. Birthday paradox still applies but orgs with <8 members rarely hit collisions in practice.
  - **Palette expansion:** at the same time, grow `PALETTE` from 6 to **12–16 colors** in `lib/project.utils.ts`. Bigger ceiling for the wrap-around case + helps the hash-based member path.
  - **Migration:** additive — `ALTER TABLE projects ADD COLUMN color_index SMALLINT NOT NULL DEFAULT 0` then backfill with `UPDATE projects SET color_index = sub.rn - 1 FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at) AS rn FROM projects) sub WHERE projects.id = sub.id`. Same shape for `organizations` (no PARTITION needed; just `ROW_NUMBER() OVER (ORDER BY created_at)`). Then drop the DEFAULT.
- **Skipped: full call-site uniqueness** — having each renderer (sidebar / dashboard / sub-nav / ticket panel / breadcrumbs) compute color from the *current sibling list* would break the "same project = same color across every view" promise the moment a new project is created and shifts everyone's slot. Stored `color_index` gets the same uniqueness guarantee without the consistency tax.
- **Trigger to revisit:** v3 polish pass, OR earlier if customer feedback flags color ambiguity as a real usability issue at scale (e.g. an org with 8+ projects routinely hitting collisions).

### Custom DP / logo / avatar for orgs and projects (and member avatars)
- **Status:** **re-raised 2026-07-17 (convo-072)** — user asked again for org + user profile pics/customisation, but ranked it **below** the three must-ships (agent-ready, bug fixes, media+markdown). Stays queued, not cut. Its S3 subsystem is now shared with [[Attachments on tickets / comments]] — once attachments land, this becomes mostly UI work, so the old "too heavy a subsystem" objection largely dissolves.
- **Status (prior):** **back to v3 (2026-06-08)** — cut from the v2 go-to-market scope as not launch-important; the S3 + CloudFront + Lambda-resize subsystem is too heavy for the pre-prod push. (Was briefly next-phase/v2 from 2026-05-28.) v2 ships colored letter squares (1-letter project key) and colored `Building2` icon for orgs, all keyed by the [[deterministic-color hash above]].
- **Decided at:** UI round 3 (28 May 2026) — user surfaced during full-page-ticket revamp pass: "park in next phases that we need to add dp and custom icons for projects and orgs too". Promotion to next-phase confirmed later same day.
- **Why parked for v2:** image upload + storage (S3 + signed URLs) + serving + resize pipeline + per-org quota + moderation surface is a real subsystem, not a polish item. v2 launches with deterministic visual identity that's "good enough" — every org/project still has a stable, distinguishable look.
- **v3 shape when implemented:**
  - **Storage:** S3 bucket per environment (`rai-uploads-staging`, `rai-uploads-prod`) with prefix `orgs/<orgId>/logo.<ext>`, `projects/<projectId>/icon.<ext>`, `users/<userId>/avatar.<ext>`. CloudFront in front for caching.
  - **Upload flow:** frontend → backend signed PUT URL → direct S3 upload → backend records URL in `organizations.logo_url` / `projects.icon_url` / `users.avatar_url` columns (all nullable; null = use deterministic fallback).
  - **Resize:** Lambda triggered on S3 PUT → resizes to standard sizes (32, 64, 128, 256) → writes alongside original. Frontend picks the size it needs.
  - **Quota:** soft cap (e.g. 5MB per file, 50MB per org) enforced at signed-URL issue time. Hard cap on subscription tier.
  - **Fallback rendering:** every component already takes a `logoUrl?: string | null` prop and falls back to the colored letter square / Building2 icon. Migration is purely additive — no UI breakage if `logo_url` is null.
  - **Member avatars (optional v3 inclusion):** Cognito already supports `picture` attribute via federated sign-in (Google, Microsoft); for password sign-in, optional upload. Same S3 path / fallback pattern.
- **Trigger to revisit:** v3 polish pass; could ride alongside billing if subscription tiers gate logo upload (free = letter square; paid = custom logo).

### Password-reset: reject reusing the current password
- **Status:** parked for v3. v2 ships Cognito's default behaviour, which allows resetting to the same password as the current one (and to recently-used passwords as well).
- **Decided at:** auth phase wrap-up (May 2026) — caught during reset-flow testing.
- **Why parked for v2:** Cognito's `ConfirmForgotPassword` API doesn't expose the current password hash to compare against, so we'd need either a Pre-Auth Lambda trigger to track history or a separate `password_history` table maintained server-side. Both are scope creep on top of an already-completed auth phase.
- **v3 shape when implemented:** Pre-Token-Generation or Pre-Auth Lambda hooks `ConfirmForgotPassword` → derives SHA-256 of submitted new password → checks against a rolling `password_history(user_sub, password_hash, created_at)` table (last N=5 entries) → rejects with `InvalidPasswordException` if a match. Combined with Cognito password policy already enforcing complexity, this closes the "reuse current/recent password" gap.
- **Trigger to revisit:** v3 hardening pass OR a customer compliance requirement (SOC 2, ISO 27001 commonly require password history).

### Org slug rename with alias redirects
- **Status:** parked for **v3**. v2 settings allows renaming the org `name` (owner + admin); `slug` is locked at create time for the entire v2 lifecycle.
- **Decided at:** settings discussion (22 May 2026) — user explicitly confirmed v3 deferral.
- **Updated 2026-05-27 (convo-058):** path-based tenancy (`/orgs/<slug>/...`) now ships in v2 — pulled forward from the original v3 parking lot during the cross-tab/multi-org rework. Slug *rename + alias redirects* stays parked as a separate concern: routing the URL is one thing, handling rename-without-breaking-old-links is another.
- **Why parked:** Renaming the slug without alias redirects would invalidate every external bookmark, shared link, and integration URL the day a rename ships. The right pattern (Slack / Linear / GitHub / Notion) is rename + alias table + grace-period 301 redirects — meaningful infra, not worth bolting on before there's evidence orgs want to rename their slug.
- **Trigger to revisit:** first real customer ask for slug rename, OR before any externally-shared URL scheme (public dashboards, embedded widgets, integration URLs) goes live.
- **Spec when implemented:**
  - **Schema:** `org_slug_aliases (id, org_id FK, alias_slug, retired_at, created_at)`. Partial unique index on `(alias_slug)` where `retired_at IS NULL`.
  - **Tenancy middleware:** on every `/orgs/<slug>/*` request, first lookup current `organizations.slug`; on miss, lookup `org_slug_aliases.alias_slug` with `retired_at IS NULL` → 301 redirect to canonical slug path. Preserves query string + sub-path.
  - **Grace period:** 90 days default before alias is hard-retired (configurable; matches GitHub). Background job clears expired aliases.
  - **Settings UI:** Owner/admin only. Rename input → confirms with a modal listing "X external links may break — current slug becomes an alias and will redirect for 90 days." → submit → server moves current slug to alias + sets new slug atomically.
  - **API:** extends existing `PATCH /api/v1/orgs/:id` to accept `{ slug }` payload alongside `{ name }`. Slug validation reuses Q6 regex (`^[a-z][a-z0-9-]{1,49}$`). Conflict (slug currently used by another org OR matches a still-active alias of another org) → 409 with "slug already taken".
  - **Audit:** every rename writes to `audit_log` (Phase 4 surface) — slug renames are sensitive enough to warrant an explicit trail.
- **Adjacent option to consider:** allow only one outstanding alias per org (force-retire the previous one when renaming again). Prevents an org from accumulating dozens of aliases via repeated rename — keeps the alias lookup fast.
- **Industry precedent:** Slack (workspace URL rename, ~14-day redirect), Linear (workspace slug rename), GitHub (org rename, indefinite redirect), Notion (workspace domain change).

### Admin-invites-admin requires owner email approval (privilege escalation guard)
- **Status:** parked for v3. v2 ships Q6 + RF-12 invite flow as-is: any admin / PM / owner can directly invite a user with role = `admin` / `project_manager` / `user` without a second-factor approval step.
- **Decided at:** invite implementation walk-through (22 May 2026) — user flagged the gap during role-dropdown design.
- **Why this matters:** if a single admin account is compromised (phishing, leaked credentials), the attacker can silently invite their own throwaway addresses as admins and persist access even after the original admin rotates their password. Owner is the only one who can demote admins, so a malicious admin can lock out the rest of the org just by creating enough loyal admin accounts.
- **v3 shape when implemented:** when an `admin` or `PM` invites with role = `admin`, the invite enters a `pending_owner_approval` state instead of sending the email. Owner receives a separate email ("X wants to add Y as an admin in <org> — approve / deny") with a signed link. Approval flips the invite to normal pending state and sends the recipient email. Denial discards. Owner-initiated admin invites skip this (owner is the root of trust). PM/user invites also skip this — only admin role triggers it.
- **Adjacent option to consider:** TOTP / WebAuthn re-confirmation at invite time, instead of (or in addition to) owner approval. Lower friction, no async wait, but doesn't help if the admin's session itself is compromised — owner-out-of-band is the stronger guarantee.
- **Trigger to revisit:** first paying customer in a regulated vertical (SOC 2, HIPAA), OR any internal security incident involving lateral admin escalation, OR explicit customer request.
- **Industry precedent:** Linear (owner approval for admin invites in Enterprise tier), GitHub Enterprise (owner approval for owner-role invites), Notion (owner approval for workspace owner promotion). Pattern is well-trodden.

### Mobile push notifications via Firebase Cloud Messaging (FCM)
- **Status:** ✅ **Backend done in v2.** Was: parked for v3 with the native app. Now: the backend send path + device registry shipped — only the Firebase credential and the mobile client remain.
- **Decided at:** v1 fix item 19 walk-through (May 2026); built in v2 (notifications pass / 2026-06).
- **What shipped (backend):** `device_tokens` table (migration 018) · `push` module — `POST/DELETE /api/v1/devices` to register/unregister a token · real `notifications/channels/push.channel.ts` (looks up the user's tokens → `firebase-admin` multicast → prunes dead tokens) · `config/firebase.ts` lazy init from `FIREBASE_SERVICE_ACCOUNT` (no-op until set). Cross-platform — FCM bridges to APNs for iOS automatically.
- **Remaining (not backend code):** create the Firebase project + service-account key (`FIREBASE_SERVICE_ACCOUNT`); the mobile app (separate dev) registers tokens + renders push; web push is still v3 (FCM web push or native Web Push API).
- **Setup steps:** `dev-notifications.md` → "Firebase setup".
- **Pairs with:** Web push (still parked for v3).

### WebSocket-based in-app notifications (replace polling)
- **Status:** parked for v3.
- **Decided at:** v1 fix item 19 walk-through (May 2026).
- **Trigger to revisit:** in-app notifications need real-time push (currently v2 polls), OR feature parity with mobile push expected, OR collaborative features ship requiring real-time channel.
- **Implementation when needed:** Socket.IO or native WebSocket server on backend. Frontend opens WS connection on login, subscribes to `user:<userId>` channel. `channels/inapp.channel.ts` writes to DB + pushes via WS in parallel. Frontend updates bell icon in real-time.
- **Why parked for v2:** polling every 30-60s is fine at v2 scale. WS adds connection management complexity, scaling considerations, and infra overhead not needed yet.
- **Known cosmetic gap (v2, minor — not breaking):** when the `sprint-autostart` cron flips a sprint `planned → active`, the DB + notification are correct instantly, but the **sprint board UI** can lag up to ~60s before showing it active. Cause: no realtime channel + the project-detail react-query cache has `staleTime: 60_000` and `refetchOnWindowFocus: false` (`frontend/lib/queryClient.ts`), so the board serves the stale status until its next refetch trigger (remount / staleness; a hard reload shows it immediately). **Same root cause as this WS item** — a WS push (or, cheaper interim fix: invalidate the project-detail query when a sprint cron notification arrives) closes the gap. Self-heals today, so left for v3.

### SMS notifications (Twilio / AWS SNS)
- **Status:** parked. Adds when a customer or compliance need surfaces.
- **Decided at:** v1 fix item 19 walk-through (May 2026).
- **Implementation when needed:** new `channels/sms.channel.ts` adapter. Twilio is the industry default; AWS SNS is the AWS-native alternative if we stay all-AWS. Per-user phone-number opt-in collected at user-settings page.

### Slack / Microsoft Teams notification integrations
- **Status:** parked. Microsoft Teams plugin is already in Phase E / v3 plans.
- **Decided at:** v1 fix item 19 walk-through (May 2026).
- **Implementation when needed:** new `channels/slack.channel.ts` + `channels/teams.channel.ts` adapters. Outgoing webhook to user's configured Slack workspace / Teams channel. Per-user OAuth flow to authorize.

### AWS EventBridge + Lambda for distributed scheduled jobs
- **Status:** parked for v3. v2 ships scheduled jobs via `node-cron` inside the backend container (sprint auto-start per item 19, subscription pre-expiry emails per Q11, invite expiry cleanup per RF-12).
- **Decided at:** v1 fix item 19 walk-through (May 2026).
- **Trigger to revisit (any one):** backend container scaling becomes horizontal (multiple backend instances → cron jobs would fire on every instance simultaneously, double-processing rows; in-process cron only works with a single backend instance OR with a distributed lock). OR scheduled-job count exceeds ~10 distinct recurring jobs. OR scheduled-job latency tolerance drops below 1 minute (cron polls every 5 min today).
- **Implementation when needed:** EventBridge scheduled rule (cron expression) → Lambda function → existing backend API or direct DB. Move each existing `node-cron` job into an EventBridge schedule + Lambda; backend keeps the same DB-side action logic via internal endpoint. Mechanical migration; same query, same action, different trigger source.
- **Why parked for v2:** `node-cron` in a single backend container is fine while we're single-instance. The upgrade is straightforward when horizontal scaling lands.

### Strict private-project visibility (creator-admin + assigned PM only; owner always sees all)
- **Status:** parked for v3. v2 ships: admins see + modify all projects (admin override); PMs have full access to public projects regardless of membership + full access to private projects only when assigned (read-only-with-toast otherwise); users see own projects + public projects (read-only-with-toast on non-membership); users-not-in private projects = invisible.
- **Decided at:** RBAC pass (May 2026).
- **v3 shape when implemented:** private project visible only to (a) the admin who created it, (b) explicitly assigned PM(s), (c) project members, (d) **owner — always, regardless of strict mode**. Other admins / other PMs can't see it in lists, can't fetch via direct URL. Owner has ultimate visibility into everything in the org (standard "owner sees all" pattern). For sensitive HR / legal / M&A / executive-only projects.
- **Why parked for v2:** v2 customer base is small (internal team + initial customers) where admin/PM oversight of all projects is desired by default. v3 introduces granular need for "even other admins shouldn't see this" — common pattern in larger orgs with mixed-confidentiality work.
- **Migration when activated:** add `projects.visibility_scope` enum (`org_admins` default, `creator_only` opt-in). UI surface: project settings → "Restrict visibility to creator + assigned PMs only" toggle. Middleware visibility check extends the existing private/public branch with a third arm. Owner role explicitly bypasses the strict check.
- **Full v3 RBAC visibility discussion** to revisit alongside the broader v3 sensitivity/compliance work (audit logging, advanced security, MFA-everywhere, etc.) — not a standalone feature lock.

### OTP / 2FA verification for ownership transfer
- **Status:** ✅ **Delivered in v2** via a custom **email-OTP** (the `otp` module), *not* a Cognito MFA challenge. *Was:* single confirmation dialog. *Now:* the owner requests a 6-digit code (`POST /otp/request`, action `transfer_ownership`), enters it, and the transfer endpoint re-verifies it before the swap. What remains parked below is the stronger **Cognito-MFA second-factor** version (depends on enrolled MFA, "MFA-everywhere").
- **Decided at:** RBAC pass (May 2026) — user flagged ownership transfer specifically as needing OTP in v3 because it's the most destructive non-deletion action available (recipient gains org-delete rights immediately).
- **Implementation when needed:** trigger Cognito's MFA challenge (`AdminRespondToAuthChallenge` with `SOFTWARE_TOKEN_MFA` or `SMS_MFA`) before completing the transfer write. If user doesn't have MFA enrolled, the transfer flow first walks them through enrollment, then re-prompts for the OTP. Pairs naturally with the parked "MFA / 2FA" item below — owner-transfer + org-delete + sensitive billing actions all become MFA-gated together.
- **Why parked for v2:** ownership transfer is rare and tied to a single org's lifecycle; the v2 confirmation dialog plus the "owner can't leave without transferring first" guard catch the accidental-transfer case. Malicious-transfer risk requires a compromised admin session, which MFA-everywhere (parked separately below) addresses more comprehensively.

### OTP gate for all destructive actions (v3 expansion)
- **Status:** ✅ **Core delivered in v2** via the custom **email-OTP** (`otp` module): **org delete, project delete, ownership transfer** now require a single-use 6-digit emailed code (`POST /otp/request` → `otpCode` on the action endpoint), replacing the typed-name/typed-email guards for those three. *Still parked:* (a) extending the gate to **billing** actions (lands with Phase 4 — reuse the `otp` allowlist), and (b) upgrading the email code to a **Cognito-MFA second factor** (below). Original v3 scope notes kept for reference:
- **Decided at:** walkthrough (2026-05-27) — user explicitly called out that org delete + similar destructive flows should require OTP in v3, not just typed-name guards.
- **Scope when implemented — every flow that mutates persistent state irrecoverably:**
  - **Org delete** (current: typed org name; v3: typed name + OTP)
  - **Project delete** (current: typed project name; v3: typed name + OTP)
  - **Ownership transfer** (current: typed recipient email; v3: typed email + OTP — supersedes the earlier "Ownership transfer only" item above)
  - **Sensitive billing actions** when billing lands — cancel subscription, change billing email, refund triggers
  - **Account deletion / sign-out from all devices** if exposed
- **Why parked for v2:** typed-name guards catch accidental clicks (the dominant risk for internal customers); MFA-on-every-destructive-action targets compromised-session risk which becomes meaningful only once paid customers + external attackers enter the threat model. Coupled with the broader MFA enrollment story so the user only re-prompts a TOTP code, not a fresh password.
- **Pairs with:** MFA / 2FA item (next), which is the prerequisite for any OTP gate. Both should ship in the same v3 wave so users aren't asked to enroll MFA mid-destructive-flow.

### Org switch preserves current page (v3 smart redirect)
- **Status:** parked for v3. v2 always lands on `/orgs/<newSlug>/dashboard` after an org switch (Header switcher or Settings switcher).
- **Decided at:** walkthrough (2026-05-27) — user pointed out it's awkward that switching orgs while on Settings (or Team, or My Work) drops you back to Dashboard instead of the same page in the new org.
- **Desired behavior:**
  - **Generic per-user pages** (Settings / Team / My Work / Dashboard / Reports list etc.) — when switching orgs, stay on the same page slug in the new org. Settings stays Settings.
  - **Org-tied resource pages** (specific project / specific sprint / specific ticket / specific archive) — when switching orgs, the resource ID doesn't exist in the new org. Fall back to dashboard. NEVER attempt the resource URL in the new org and show 404.
  - **Conceptually:** `pageType in {generic, resource-scoped}`. Generic → preserve path suffix. Resource-scoped → fall back to `/orgs/<newSlug>/dashboard`.
- **Implementation when needed:** classify each route at switch time, transform the URL accordingly. Probably a small helper `nextUrlAfterSwitch(currentPathname, newSlug)` that:
  1. Parses the current path: extracts the segment after `/orgs/<oldSlug>/`.
  2. If suffix matches a generic path pattern (`/dashboard`, `/settings`, `/team`, `/my-work`), keep it: return `/orgs/<newSlug>/<suffix>`.
  3. Otherwise return `/orgs/<newSlug>/dashboard`.
  4. Header + Settings org switchers call this instead of hard-coding `/dashboard`.
- **Why parked for v2:** v2 ships full-reload-on-switch as the failsafe (per convo-058 follow-ups), and full reload + always-dashboard is simple to reason about. Smart page-preservation is a polish item once the routing model is proven stable.
- **Pairs with:** convo-058 URL-driven org context (already shipped) — this builds on that foundation by adding routing intelligence on top.

### MFA / 2FA (TOTP, SMS, push)
- **Status:** parked. v2 ships password + email verification only.
- **Implementation under Cognito:** **toggle on in user pool.** Cognito provides TOTP and SMS MFA out-of-the-box. Push (mobile) lands when the mobile app does. No engineering required beyond UI to enroll the second factor.

### Active sessions UI (Settings → "your active sessions")
- **Status:** parked.
- **Powered by:** Cognito's `AdminListUserAuthEvents` API (auth event history per user). UI renders device, last activity, IP, with "revoke this session" calling per-session revocation or `AdminUserGlobalSignOut`. The data is already captured by Cognito — only the UI is deferred.

### Suspicious activity detection (login from new IP/device prompts MFA or email confirmation)
- **Status:** parked.
- **Implementation under Cognito:** **Cognito Advanced Security tier** ($0.05/MAU). Built-in risk scoring, adaptive auth (challenge MFA on suspicious sign-ins), compromised-credential detection (haveibeenpwned-equivalent). Toggle on, configure thresholds. No engineering required.

### Disposable / temp-mail blocking at signup (anti-fake-account)
- **Status:** parked for v3.
- **v2 defense:** Cognito's email verification flow is the only gate — unverified accounts can't log in or call any API. Unconfirmed users auto-delete after ~7 days. This catches the "bot signs up with garbage email, never sees a code" case but does NOT catch "user signs up with `dip@10minutemail.com`, verifies via the temp inbox, gains access."
- **v3 scope:** Block disposable-domain emails at signup. Two implementation paths:
  1. **Pre-signup Lambda + maintained blocklist** — Lambda rejects signups against a list like [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (~3000 known temp providers, updated weekly). Free, runs in Cognito's signup flow before the user is created.
  2. **External API** (e.g. Kickbox, ZeroBounce, Verifalia) — paid per-check, also catches risky-but-not-listed domains (catch-all addresses, low-reputation SMTP). ~$0.005–0.01 per signup.
- **Recommendation when implemented:** start with (1) — covers 95% of obvious abuse for free; layer (2) only if abuse signals justify the cost.
- **Why parked:** v2's verification gate + 7-day cleanup is "good enough" for early customers. Spam wave or B2B abuse complaints would be the trigger to pull this forward.

### Comprehensive audit logging (app-wide, not just auth)
- **Status:** parked.
- **Decided at:** Q1 follow-up discussion.
- **Scope when implemented:** every state-changing action recorded in an `audit_logs` table — auth events (most available via Cognito event history), org events (member added/removed, role changed, settings changed), project/sprint/ticket CRUD, comment edits, billing events. Records actor, target entity, action, before/after values where applicable, IP, user-agent, timestamp.
- **Why parked:** v2 ships pino structured logging (covers debugging) but not a queryable audit table. Audit logs need their own table + retention policy + admin UI to browse — separate workstream from v2 multi-tenant core.
- **Why we'll need it:** SOC 2 / compliance, "who deleted this ticket" investigations, customer trust.

### Third-party SSO — Google + Microsoft in v2; GitHub in v3; SAML / OIDC remain parked *(RF-7)*
- **v2 scope (Phase B):** Google SSO + Microsoft SSO ship in v2 (Google for general consumers, Microsoft for B2B users on Office 365 — covers ~95% of business sign-ins between them).
- **v3 scope:** GitHub SSO. Same Cognito-toggle implementation, ~3–4 hours. Pulled into v3 explicitly (was previously "still parked indefinitely") because developer-tool integrations matter for our target audience once the v2 multi-tenant core ships.
- **Still parked indefinitely:** SAML (enterprise-tier per-org IdP federation), OIDC generic providers.
- **Implementation under Cognito:** **toggle on in user pool.** Cognito user pools support federated identity providers as configuration. Add identity provider in pool config, expose the provider button on the login UI via Amplify — no custom auth-flow code. ~3–4 hours per provider including UI work.
- **Move trigger for SAML / OIDC:** first enterprise customer with SSO mandate.
- **Email-as-identity behavior (locked at RF-7):** Cognito user pool runs with "Trust provider for email" ON, so federated sign-ins auto-link to existing native users when emails match AND both are verified. Single `users.id` per email regardless of auth method. Shadow-account hijack closed by Q7's email verification gate.

### Domain-based auto-org-join (`@acme.com` → Acme org) *(RF-7)*
- **Status:** parked for v3+.
- **Decided at:** RF-7 in `v2-decisions.md`.
- **Why parked:** v2 treats every email as an independent identity with no special handling for work-email domains. `dip@acme.com` and `dip@gmail.com` are two separate users with no implicit relationship to any "Acme" org. Q6 invites remain the only path to org membership.
- **Implementation sketch when needed:** per-org `allowed_email_domains` column (text array); admin verifies domain ownership via DNS TXT record (standard pattern, same as Google Workspace domain verification); new sign-ups with a matching verified email get a prompt "Acme is on Rai — join the workspace?" with one-click accept. Does NOT auto-add to org without user consent — too easy to weaponize otherwise (insiders accidentally landing in the wrong org).
- **Relationship to SAML/OIDC park:** domain-binding is the lightweight v3 version; SAML/OIDC per-org federation is the heavyweight enterprise version. Both can coexist later.
- **v2 soft-warning precursor (proposed 2026-05-27):** before full auto-join, ship a non-blocking "an org with this email domain already exists" hint on the create-org form. Cheap (~1 endpoint + 1 line of UI), skips public-email domains (gmail / outlook / yahoo / icloud / etc.), informational only. Helps prevent accidental duplicate workspaces inside the same company without committing to the full domain-verification flow. See "Workspace merge tool" below for what cleans up duplicates that slipped through.
- **Cross-admin peer-banner pin (v3 backend state):** v2 ships per-user dismissal of the domain-peer dashboard banner (localStorage). One admin dismissing doesn't affect what other admins see. When an admin wants to *force* the banner back for the whole org's admin team (e.g. "hey team, we've got a duplicate workspace, please consolidate"), they need backend-stored pin state. Sketch: `org_peer_pins (org_id, peer_org_id, pinned_by, pinned_at)`. When a row exists, banner re-fires for all admins regardless of their personal dismissal. Requires the peer-org admin to confirm before pinning, otherwise spammable.

### Workspace merge tool (clean up duplicate orgs)
- **Status:** parked for v4+.
- **Decided at:** walkthrough (2026-05-27) — user flagged the "two admins in same company unknowingly create two separate orgs" problem.
- **Why parked:** real infra. Needs UI for owner-initiated merge, conflict resolution for overlapping members (different roles in each), conflict resolution for duplicate project keys, data merge transaction across orgs/projects/sprints/tickets/comments/invites tables. Not worth before there's evidence the dupe problem is biting real customers.
- **Industry references:** Slack has workspace merge (paid plans only); Notion has "import workspace" semi-merge; Linear hasn't built it (relies on domain discovery to prevent dupes).
- **Realistic order:** v2 soft-warning at create (above) prevents most. v3 data-export (Phase 5 polish) lets users self-serve a manual migration: export from the smaller org, re-import into the bigger one. v4+ builds the proper merge tool only if customer demand justifies it.

### Card-at-signup for trial (anti-abuse mitigation)
- **Status:** parked. v2 ships trial as a free 30-day window per org with no payment commitment.
- **Decided at:** walkthrough (2026-05-27) — user asked about trial abuse + duplicate orgs from one person.
- **Trade-off:** card-at-signup cuts trial spam by ~80% (public data from Notion / Linear / Vercel Pro) at the cost of a higher signup-flow drop-off rate. Industry convention: free tools skip it (Slack free, Notion personal), paid-first tools require it (Linear Premium, Vercel Pro).
- **Implementation sketch when needed:** Razorpay/Stripe SetupIntent on create-org form — captures payment method but doesn't charge until trial ends. Backend stores customer + payment-method IDs; webhook handles trial-end → first charge.
- **Why parked for v2:** v2 ships `NoOpBillingProvider` (no real billing); the friction analysis lands properly only once we have real billing infra in Phase 4. Pair the decision (card-required: yes / no / configurable per plan) with the billing implementation, not before.
- **Alternative:** per-user trial credit instead of per-org. One human gets 30 free days TOTAL across all orgs they create. Limits trial farming without the friction of card-at-signup. Worth A/B testing in v3.

### Token refresh storm handling (high-concurrency refresh) *(RF-2)*
- **Status:** parked. v2 takes no special action.
- **Trigger to revisit:** logs show `TooManyRequestsException` on token refresh calls (Cognito `InitiateAuth` → `REFRESH_TOKEN_AUTH` flow).
- **Implementation ideas when needed:** stagger refresh timing client-side (refresh when token is at 80% of its lifetime, with ±10% jitter, instead of all at the same expiry boundary); server-side rate limit on the auth endpoint; pre-warmed token pool for known peak windows.
- **Why parked for v2:** Cognito's per-pool token refresh quota is thousands/sec — v2 scale (internal + handful of orgs) won't reach it. Single-pool decision (Q9) is unaffected.

### Multi-region Cognito user pools *(RF-2)*
- **Status:** parked. v2 uses one user pool in one AWS region.
- **Trigger to revisit:** customer base spans multiple continents at meaningful volume; or pool-level admin write quota becomes a hard ceiling even after AWS Service Quota increases.
- **Why parked for v2:** identity is pool-scoped — same email in two pools = two different `sub` UUIDs. Multi-region requires custom cross-pool sync infrastructure, regional signup routing, and a strategy for the user's "home" pool. Substantial project, weeks of engineering. Single-pool + AWS quota increase (free, 1–2 business days) covers v2 scale.
- **Migration sketch when needed:** introduce a `users.primary_region` column; new signups go to the regional pool nearest them; existing users stay in the original pool (no forced migration); login attempts hit a regional resolver that proxies to the right pool. Cognito itself doesn't natively federate across regions — this is custom application logic.

### Backend per-user serialization lock for org switching *(RF-6)*
- **Status:** parked. v2 relies on frontend full-disable + `AbortController` to prevent overlapping org-switch requests from the same user.
- **Decided at:** RF-6 in `v2-decisions.md`.
- **Trigger to revisit:** first non-browser client ships (mobile SDK, CLI, third-party API consumer) — any client that doesn't honor the frontend `isSwitching` guard. OR telemetry surfaces real-user races slipping past the frontend guard at meaningful rate.
- **Implementation when needed:** Redis lock (`SET orgswitch:lock:{user_id} 1 NX PX 5000`) acquired at the entry of `POST /api/v1/auth/switch-org`. Concurrent second request gets the lock denial → fast-fail with `409 Conflict` + retry-after hint. Lock released after Cognito write + token-claim flush settles, or on TTL expiry as deadlock safety. Alternative: Postgres advisory lock (`pg_advisory_xact_lock(hashtext('orgswitch:' || user_id))`) inside the switch transaction — no Redis dependency, but ties switch-throughput to one DB connection per user during the switch.
- **Why parked for v2:** v2 has exactly one client — our React frontend — and we own the guard. Adding Redis just to defend against a client that doesn't exist is infra for the sake of infra. Q3 middleware re-validation means even an unguarded race never produces a tenant-data leak; the only thing the lock would prevent is UI flicker that the frontend disable already prevents.

### Outbox pattern for cross-system writes (Cognito ↔ Postgres) *(RF-8)*
- **Status:** parked. v2 uses inline bounded retry + best-effort compensation per RF-8.
- **Decided at:** RF-8 in `v2-decisions.md`.
- **Trigger to revisit:** structured log markers (`event: "*_rollback_failed"`, `event: "*_mismatch"`) fire more than a handful of times per month at scale. OR cross-system write volume exceeds what inline retries can absorb without user-visible failure spikes.
- **Implementation when needed:** new `outbox` table in Postgres (`id, flow_name, payload jsonb, attempts int, last_attempt_at, completed_at`). Op1 + outbox row insert happen in the same DB transaction. Background worker process (separate Node container) polls outbox, drains pending rows by calling the matching Cognito endpoint with `withCognitoBackoff`, marks rows completed on success or increments `attempts` on failure. After N failed attempts (e.g. 10 over 24h), worker flags the row for manual review.
- **Why parked for v2:** outbox needs a worker process + monitoring + dead-letter handling — non-trivial infra. At v2 scale (internal team + handful of orgs), inline retry + compensation covers the same cases. Migration is straightforward when needed because the per-flow code shape (`withCognitoBackoff` / `withDbRetry` calls) stays nearly identical; outbox just relocates them to the worker.
- **Sibling patterns to consider alongside:** Saga with compensating actions (more complex per-flow code, no worker needed) and 2-phase commit (not supported by Cognito). Both rejected at RF-8 for v2.

### Redis cache for per-request membership lookups *(RF-14)*
- **Status:** parked. v2 ships per-request DB validation through the `MembershipResolver` interface with `DbMembershipResolver` as the only implementation.
- **Decided at:** RF-14 in `v2-decisions.md`.
- **Trigger to revisit (any one fires):** p99 auth middleware latency sustained >10ms over a 24h window, OR concurrent active users >500 sustained, OR DB connection pool saturation traceable to middleware queries.
- **Implementation when needed:** add `CachedMembershipResolver` implementing the same `MembershipResolver` interface as a decorator wrapping `DbMembershipResolver`. Redis lookup-then-fallback. Cache key `mem:{userId}:{orgId}` → serialized `MembershipContext`. TTL ~60s (calibrate at activation time). One DI registration change to swap; middleware code unchanged.
- **Why parked for v2:** middleware queries are sub-millisecond at v2 scale. Premature caching adds infra (Redis instance), invalidation complexity (RF-15), and failure modes (stampede, stale reads on role change) for zero measured benefit. The abstraction is in v2 so activation is mechanical when measured load crosses the trigger.
- **Pairs with:** RF-15 cache invalidation strategy (below) — activates together.

### Cache invalidation strategy for membership cache *(RF-15)*
- **Status:** parked. Bound to RF-14 — only relevant once Redis caching exists.
- **Decided at:** RF-15 in `v2-decisions.md`.
- **Trigger to revisit:** activates together with the RF-14 Redis work above.
- **Implementation when needed:** on writes that change membership state (role change, member removal, subscription status flip, org deletion), the writer explicitly `DEL`s the affected cache key(s). Pub/sub broadcasts the invalidation across all backend instances (Redis pub/sub or via the existing CloudWatch+SNS alert pipeline). Detailed shape (write-through vs. write-around, single Redis vs. cluster, TTL fallback as belt-and-suspenders) locked at the v3 activation moment, not pre-emptively — the right pattern depends on the concrete cache topology chosen at activation.

### Read replicas for the membership query *(RF-14)*
- **Status:** parked. v2 is single-Postgres.
- **Decided at:** RF-14 in `v2-decisions.md`.
- **Trigger to revisit:** considered alongside the RF-14 Redis work. Redis caching may make replicas unnecessary at v3 scale — evaluate both options at the activation moment, not pre-decided.
- **Implementation when needed:** RDS read replica(s). Route auth-chain reads (`loadUser` + the combined membership join) to the replica; route all writes to the primary. Read-your-writes consistency for the writer is preserved by routing the immediately-following read to the primary explicitly.

### CSRF tokens for cookie-based auth (beyond SameSite=Lax baseline)
- **Status:** parked. v2 relies on `SameSite=Lax` on Amplify-managed cookies, which mitigates the bulk of CSRF.
- **When to add:** if a future feature needs to accept cross-origin cookie-authenticated requests, OR if a security review demands defense-in-depth beyond SameSite. Implementation: double-submit token pattern — server issues a CSRF token in a non-HttpOnly cookie + JS reads it and includes in `X-CSRF-Token` header on state-changing requests. Server compares the two.

---

## v3 Billing Follow-ups

All parked at Q10/Q11 lock (convo-033). v2 ships `NoOpBillingProvider` and no real billing flows; everything below comes online with v3 when `RazorpayBillingProvider` (or `StripeBillingProvider`) is wired in.

### Real payment provider (Razorpay primary, Stripe alt)
- **Status:** parked. v2 = `NoOpBillingProvider` only.
- **Likely v3 lock:** Razorpay. Reasons: ~2% fees (vs Stripe ~3%), native UPI / netbanking / wallets (Indian customers expect these), GST invoicing built in, no Stripe India merchant-onboarding restrictions.
- **Alternative:** Stripe — if/when we expand beyond India or want Stripe Billing's tooling. Documented under Alternative Implementations below.
- **Schema already staged:** `subscriptions.razorpay_customer_id`, `subscriptions.razorpay_subscription_id`, `subscriptions.stripe_*` mirrors (all nullable from v2).
- **Wiring:** implement `RazorpayBillingProvider` against the `BillingProvider` interface. Single DI swap from `NoOpBillingProvider`. Webhook endpoint at `/api/v1/webhooks/razorpay` for async payment events.

### Card requirement at signup
- **Status:** parked. v2 = no card required.
- **When implemented:** card mandatory on org creation. Mid-trial v2 users grandfathered to end of current trial, then prompted for card at conversion to paid.
- **Same flow** as a fresh v3 signup once trial converts.

### GST invoicing (India-specific, mandatory)
- **Status:** parked. v2 has no real billing → no invoices → no GST.
- **When implemented:** Razorpay handles most of it (HSN/SAC code, CGST/SGST/IGST split by customer state, tax invoice format). We capture customer's **GSTIN** + **billing state** + **billing address** during paid-conversion flow.
- **Schema:** add `billing_profiles (org_id, gstin, billing_state, billing_address, contact_email, created_at, updated_at)` table — kept separate from `orgs` so a "billing not yet configured" state is clean.
- **Why parked:** GST only matters when money actually flows. v2 no card = no money = no GST.

### Dunning policy (failed-payment retries)
- **Status:** parked.
- **Standard implementation:** 3 retry attempts over ~7 days. Status transitions: `active` → `past_due` (during retries) → `read_only` (if all retries fail). Razorpay/Stripe handle the retry schedule natively; we handle the status transition via webhook.
- **Customer comms:** email on each failed attempt + email when org moves to `read_only`.

### Refund policy
- **Status:** parked. v2 = no refunds, cancel = end-of-period only.
- **v3 path:** no self-serve refunds. `internal_admin` panel gets a "issue partial refund" action — calls Razorpay refund API, computes the partial amount, audit-logged. Used for support-call edge cases (legitimate billing disputes, accidental long-trial-to-paid conversions, etc.).

### Chargeback handling
- **Status:** parked.
- **Standard implementation:** Razorpay webhook on chargeback → auto-suspend org to `read_only` until resolved. Internal admin notified. Resolution is manual.

### Annual billing interval (with discount)
- **Status:** parked. v2 = monthly only.
- **Implementation:** add `annual` value to `plans.billing_interval`. Typical SaaS discount: 2 months free (= ~17% off annual). Plan rows: one `monthly` and one `annual` of the same plan, customer picks at checkout.

### Multi-currency
- **Status:** parked. v2 = INR only.
- **Implementation:** pricing per currency on `plans` (or a `plan_prices(plan_id, currency, price_per_seat_cents)` lookup table). Stripe / Razorpay handle FX. Customer's currency is fixed at first paid conversion — no mid-subscription currency switches.

### Discount codes / coupons
- **Status:** parked.
- **Use cases:** beta-customer discount, referral discount, partnership pricing, accidental-refund-as-credit.
- **Implementation:** `coupons` table + Razorpay coupon API (handles discount application during checkout).

### Subscription pause (vs hard cancel)
- **Status:** parked.
- **Use case:** customer wants to take a 1-month break without losing their data or restarting their org.
- **Implementation:** new `paused` status on `subscriptions`. Behaves like read-only but explicitly user-initiated. Razorpay supports subscription pause natively.

### Mid-cycle proration (final lock)
- **Status:** ✓ **Done in v2 (2026-06-09)** — no longer parked. *Was:* count-at-cycle-end vs proration left for v3. *Now:* adopted the **Jira / Atlassian model (Maximum Quantity Billing)** — bill = `price × peak active seats during the cycle`; mid-cycle **adds prorate** for the remaining days, **removals get no credit**. Implemented via `subscriptions.peak_seats` (high-water mark) + live seat count. See `guide-billing.md` and `v2-decisions.md` Q11.
- **Why now:** real Razorpay shipped in v2, so there's actual money to prorate. The count-at-cycle-end loophole ("add the team on the 29th") is closed.

### Reactivation-after-cancel window
- **Status:** parked. Ties into Q14 (org deletion / retention).
- **Question to decide at v3:** if a canceled org wants to come back 6 months later, do they reactivate the existing org (data preserved through read-only retention period) or create a fresh org? Recommend: reactivate within 90 days post-cancel; after 90 days, data per Q14 retention policy → may require new org.

### Invoice receipts to billing contact
- **Status:** schema staged in v2 (`subscriptions.billing_email`), but no invoices generated until v3.
- **Behavior at v3:** owner + `billing_email` (if set; defaults to owner.email) receive invoice receipts. `billing_email` typically a CFO / accounts email separate from the owner's personal email.

### Webhook idempotency
- **Status:** parked.
- **Implementation needed at v3:** every Razorpay webhook delivery includes a unique event ID. Store processed event IDs in a `processed_webhook_events` table. Reject duplicates. Standard pattern — prevents double-charging or double-status-transition on at-least-once delivery.

---

## Data Retention & Portability Follow-ups (Q14)

### Org-level data import (counterpart to export)
- **Status:** parked for **v3** (re-confirmed 2026-06-08). v2 ships **export only** — ✅ built 2026-06-08: `GET /orgs/:id/export?format=json|xlsx` (owner/admin) + Settings "Export your data". Import stays parked.
- **Decided at:** Q14; v3 deferral re-confirmed 2026-06-08.
- **Use case:** org admin uploads a previously-exported JSON / CSV bundle to populate a new org (e.g. moving from a different tool, restoring after self-serve hard delete, populating a fresh org from a backup outside our system).
- **Why parked:** complex schema mapping (FK resolution, user ID remapping, conflict handling), and the use case is uncommon for early customers. Export-only covers GDPR data portability + "let me leave with my data" UX.
- **When to implement:** v3+, driven by actual customer demand.

### User-facing restore ("recycle bin")
- **Status:** parked for **v3** (confirmed 2026-06-08 — not launch-important). This is **entity-level** restore (tasks/sprints/projects); v2 has no soft-delete on those tables. The separate **org-level** recycle bin (restore a whole deleted org) DID ship in v2 — see § Go-to-market batch + migration 012. Don't conflate the two.
- **Decided at:** Q14; v3 deferral re-confirmed 2026-06-08.
- **Use case:** org admin recovers an accidentally-deleted task / sprint within an active org. Distinct from org-level retention (which covers "I want my whole org back after cancellation").
- **Why parked:** needs `deleted_at` columns on every tenant-scoped entity, per-entity retention policy, restore UI per entity, and bulk-restore workflow. Substantial workstream.
- **When to implement:** v3+, after we see what the most accidentally-destructive UX paths actually are.

### Internal Admin Panel (v3)
- **Status:** parked. Moved from v2 → v3 late in the Q10/Q11/Q14 session — direct DB + shared inbox handle v2 support volume.
- **Decided at:** Q10/Q11 lock + late-session scope adjustment (convo-035).
- **Spec when implemented:**
  - Single `internal_admin` role login (no admin-vs-user split inside the panel).
  - **2FA mandatory from day one — TOTP only** (no SMS — SIM-swap + cost). Implemented via Cognito MFA toggle on a separate `internal_admin` group / pool.
  - Three screens: (1) org list (search by org name / owner email; columns: name, status, `trial_ends_at`, member count); (2) org detail (members, subscription state, full subscription history); (3) actions — "Extend trial by N days" + "Set subscription status" buttons, both audit-logged with actor + timestamp + required free-text "why".
  - No revenue dashboard (Razorpay's dashboard covers this).
  - No ticketing system (continues with `support@…` shared inbox until volume justifies Zendesk/Intercom).
- **Why parked at v3 vs built in v2:** v2 customer base = internal team + handful of initial orgs. Direct DB queries handle the support volume. Build the panel when card-on-file lands in v3 and real CS volume materializes.
- **Move trigger:** v3 ship, OR earlier if support volume exceeds what one engineer can handle via direct DB.

### Internal product analytics layer (v3)
- **Status:** parked. Pulled out of mid-build discussion (27 May 2026) — full conversation captured here so the thinking isn't lost when v3 planning starts.
- **Why parked:** v2 scope is multi-tenant + auth + RBAC + basic PM features. Analytics infrastructure is its own architectural layer and shouldn't compete for attention until the v2 core is stable in production.
- **What to track when this lands:**
  - **Feature usage** — which pages / actions are hit, by org and by role.
  - **Active projects** — count + trend per org.
  - **Task completion time** — created → done timing, breakdown by type / priority / project.
  - **Notification engagement** — sent vs opened vs acted-on for in-app / email / future push.
  - **Workspace growth** — members added over time, invites sent vs accepted ratio.
  - **Search queries** — what users look for (informs missing features / bad navigation).
  - **Workflow bottlenecks** — tickets stuck in a status for >N days, sprints with low velocity, comment chains with no resolution.
- **Guardrails (never cross):**
  - No personal data beyond what's already in the product (no off-platform tracking, no third-party SDK harvesting).
  - No "creepy" analytics — mouse-movement heatmaps, scroll-depth on every page, dwell-time on every modal. These destroy trust in B2B.
  - No engagement-bait events optimized for "session length" — utility, not dopamine.
- **Architecture sketch:**
  - Layer 1 — **events** (immutable append-only): `TaskCreated`, `TaskCompleted`, `InviteSent`, `InviteAccepted`, `CommentAdded`, `SprintStarted`, `SprintCompleted`, `ProjectCreated`, `MemberJoined`, `SearchPerformed`, `LoginSucceeded`, `RoleChanged`. Each event carries `{ org_id, actor_user_id, timestamp, payload }`.
  - Layer 2 — **metrics** (rollups): hourly / daily / weekly aggregations of event counts + p50/p95 latencies for action-to-completion timings.
  - Layer 3 — **aggregations** (cross-metric joins): "% of tickets completed within 7 days," "invite acceptance rate per role," "search-to-result-click rate."
  - Layer 4 — **trends** (deltas over time): "active members +12% WoW," "ticket completion time -8% this sprint."
- **Storage TBD:** likely a separate `analytics_events` table in Postgres for v3 simplicity, with a clear migration path to a columnar store (Timescale extension, Redshift, BigQuery) when scale demands. Decide at v3 design time.
- **UI surface (when shipped):** internal dashboard for product team first (org list with usage signals); customer-facing dashboards (per-org analytics for admins) come AFTER internal use validates the metric definitions.
- **Strategic framing locked in this discussion:**
  - "Good UX increases retention → retention increases data → data improves product." Flywheel justifies investing here, but only after v2 utility is solid.
  - For B2B: utility > addiction. Users stay because the workflow is smooth, collaboration works, and switching cost is high — not because the UI is dopamine-heavy. Don't borrow engagement patterns from social media.
- **Trigger to revisit:** v3 planning kickoff, after v2 hits production and we have real usage signal to inform what events are worth capturing first.
- **Related parked items:** Comprehensive audit logging (this doc) — analytics is read-only event firehose; audit logging is the security-event subset with stricter retention.

### Feature backlog — discussion notes for v3 planning (NOTHING FINALISED)
- **Status:** discussion notes only. Captured 27 May 2026 from an Odoo-ad-prompted brainstorm of "what else could a PM tool have." User explicitly directed: park all of this for v3, no v4 buckets right now, revisit and pick the actual v3 scope during v3 planning. Nothing here is committed — it's a menu for that future conversation.
- **Why these notes exist here:** without saving them, the brainstorm evaporates. With them saved, v3 planning starts with a real list of options + the reasoning that led to each tier, instead of starting from scratch.
- **Where we are today (v2 in flight, baseline for comparison):** projects, sprints, tickets (4 types × 5 priorities × 4 statuses), comments, basic search, my-work view, role-based access, archive, invites, org switching. Solid Jira-lite core. Multi-tenant + RBAC + URL-driven org context (convo-058) under the hood.

#### Tier 1 — Jira parity gaps (industry standard for B2B PM tools)

| Feature | What it adds | Effort |
|---|---|---|
| Time tracking / work logs | Per-ticket time estimates + logged hours; rollup per sprint / project | Medium |
| Custom fields on tickets | Orgs define their own fields (text / select / date / multi-select) | Medium-large |
| Workflow rules / automation | "When ticket moves to Done → assign to QA" — even simple if-this-then-that | Medium |
| Saved filters / custom views | User saves a filter on Backlog/Board with shareable URL | Small-medium |
| Versions / releases | Group tickets into release X; release notes auto-generated | Medium |
| Components | Tag tickets with `frontend` / `backend` / `infra` sub-areas inside a project | Small |
| Public REST API + webhooks | Customers can integrate (Zapier, n8n, scripts) | Medium-large |

#### Tier 2 — Modern PM features (Linear / ClickUp / Notion-class)

| Feature | What it adds | Effort |
|---|---|---|
| Gantt / Timeline view | Visual schedule with dependencies | Medium-large |
| Roadmap view | Quarter-level "what's shipping when" board | Medium |
| Calendar view for sprints / due-dates | See work by date instead of by board | Small-medium |
| Task dependencies (blocks / blocked-by) | Graph of which tickets gate others | Medium |
| Workload / capacity view | Per-assignee load, spot the overloaded person | Small-medium |
| Recurring tickets | "Every Monday create 'Weekly review'" — cron-style | Small |
| Linked docs / wiki (Notion-style) | Markdown docs scoped to project; mention tickets in docs | Large |
| Goals / OKRs linked to tickets | "Q3 goal X tracks tickets A, B, C; progress = % done" | Medium |
| Embedded chat / threads | Slack-style threading inside ticket comments | Already partial |

#### Tier 3 — Beyond Jira (Odoo / ClickUp / Monday differentiators)

| Feature | What it adds | Effort |
|---|---|---|
| Forms / intake | Public form URL → submission becomes a ticket | Medium |
| Email-to-ticket | `support@yourorg.rai.app` → email body becomes ticket | Medium-large |
| Customer portal | External users see a stripped-down view of "their" tickets | Large |
| SLA tracking with escalation | "P0 must respond in 1h or escalate to manager" | Medium |
| Slack / Teams / GitHub integrations | Bidirectional sync — comment in Slack updates Rai | Medium-large each |
| AI assist (LLM-powered) | Auto-summarize long tickets, suggest assignee, draft replies, smart triage | Medium |
| Public roadmap | Customer-facing "here's what we're building" page | Small-medium |
| Mobile apps (or PWA) | iOS/Android — even a thin wrapper helps adoption | Large |

#### Tier 4 — Explicit "don't build" list (B2B trust killers)

These work for consumer apps. In B2B they erode trust and get killed by IT. Keep this list around as a guardrail when product ideas surface in v3 planning:

- Streaks, "you've been productive 5 days in a row" badges
- Daily activity emails optimized for click-through
- Heatmaps / dwell-time tracking
- Anything that feels like a Duolingo notification on a work tool

#### Preliminary take from the original brainstorm (input for v3 discussion, not a commitment)

**Highest-leverage if v3 wants quick wins** (small effort, big perceived completeness):
1. **Saved filters** — small, used constantly.
2. **Components** — small, every Jira-trained team expects them.
3. **Recurring tickets** — small, eliminates a whole class of manual work.
4. **Calendar view** — small-medium, opens up date-based thinking.

**If v3 has bandwidth beyond the quick wins:**
5. **Time tracking** — one of the most-requested PM features when teams move off spreadsheets.
6. **Roadmap view** — sells the product in demos.
7. **AI assist** — table stakes by 2026; even basic "summarize this ticket" is competitive.

**Probably defer further** (real platforms within the platform — commit only after v3 lands and we have real user signal):
- Custom fields, workflow automation, Gantt, full bidirectional integrations.

**Probably NOT at all unless real customer demand surfaces:**
- Customer portal, email-to-ticket — different product surface entirely.

#### Strategic framing (carried over from the analytics-layer discussion, same session)

- "Good UX increases retention → retention increases data → data improves product." Flywheel justifies investing in solid PM features, but only after v2 utility is solid in production.
- For B2B: **utility > addiction**. Users stay because the workflow is smooth, collaboration works, and switching cost is high — not because the UI is dopamine-heavy. Don't borrow engagement patterns from social media.
- This matters for *every* v3 feature choice — the question "does this make work go faster?" beats "does this make the app sticky?"

#### Trigger to revisit

v3 planning kickoff. By then we should have:
- Real production usage data (from the analytics layer if it's been built, or anecdotal feedback otherwise).
- Customer asks accumulated through support / feedback channels.
- A clearer sense of which Tier-2 features the actual user base wants vs. which were assumed.

Walk this list at that point, pick the v3 scope, and any survivors that don't make v3 either stay on this list for v4 or move to their own dedicated upgrades.md entry with full spec.

### Org name reclamation / "domain auction" (v4–v5+)
- **Status:** parked. Far future.
- **Decided at:** Q14.
- **Use case:** the rare case where a hard-deleted org's name has business value (well-known brand, recognizable customer name) and a different party wants to claim it. Customer-support escalation is the v3 fallback; this is the longer-term structured mechanism.
- **Possible patterns:** name-reclamation request flow + manual review; "premium name" tier requiring higher payment; auction mechanism similar to domain registrars.
- **Why not designed yet:** speculative — depends on whether name-conflict disputes actually surface at scale. Placeholder so v3 doesn't accidentally block the option.

---

## Alternative Implementations

### Backend hosting: ALB + multi-EC2 (instead of single EC2 with Nginx)
- **Currently:** v2 ships single EC2 + Nginx + certbot on host for TLS (carries v1's pattern). Saves ~$16/mo while staging traffic and prod day-1 load are well within one box.
- **Alternative:** ALB in front of EC2 + ACM cert on ALB. Adds health checks, multi-instance support, and clean ACM-managed TLS.
- **Why we'd swap:** sustained CPU/memory > 70% on the single EC2 over a multi-hour window, OR response-time degradation, OR first prod incident where a second EC2 would have absorbed the spike.
- **Why we didn't pick it for v2 day-1:** ~$16/mo for nothing while we're single-instance; ALB adds complexity (target groups, listener rules, health check tuning) we don't need until horizontal scale matters.
- **Migration when activated:** issue ACM cert in `ap-south-1`; create ALB with HTTPS listener pointing at the existing EC2 in a target group; flip the GoDaddy CNAME from EC2 public IP to ALB DNS; remove Nginx + certbot from the EC2 host (backend serves plain HTTP behind ALB now). Same backend code, same Docker image — only infra changes.
- **Pairs with:** vertical scale (try first — t3.medium → t3.large is one click and covers most spikes); horizontal scale (second EC2 added to target group after ALB lands).

### Backend hosting: ECS / Fargate (instead of EC2 + Docker)
- **Currently:** v2 ships EC2 + Docker single-container. Devops manages one box per env.
- **Alternative:** ECS (or Fargate for serverless containers) for proper container orchestration, auto-scaling policies, rolling deploys.
- **Why we'd swap:** when scale-out crosses 3-4 EC2 instances and the manual "add to target group" dance becomes painful, OR when a real CI/CD pipeline lands (parked for v3 / post-prod-stabilization) and deploy automation needs orchestration primitives.
- **Why we didn't pick it for v2:** premature for one EC2 + one staging EC2. ECS adds task definitions, service definitions, capacity providers — complexity not justified until horizontal scaling is live.

### Database: Aurora PostgreSQL (instead of RDS PostgreSQL)
- **Currently:** v2 ships RDS PostgreSQL 16. Multi-AZ for prod, single-AZ for staging.
- **Alternative:** Aurora PostgreSQL — AWS's drop-in-compatible managed offering with faster failover, read-replica fan-out up to 15 replicas, and shared storage layer.
- **Why we'd swap:** sustained traffic where RDS Multi-AZ failover latency matters; or read-heavy load that wants > 5 read replicas; or storage growth beyond comfortable single-instance limits.
- **Why we didn't pick it for v2:** Aurora is ~3× the cost of RDS for features we don't measurably need at v2 scale. RDS PostgreSQL covers v2 with room to grow.
- **Migration when activated:** snapshot RDS → restore as Aurora cluster → cut connection string over → ~30 min downtime, zero app code changes (Aurora speaks the same wire protocol). Backend reads + writes are transparent.

### DNS: Route 53 (instead of GoDaddy)
- **Currently:** v2 keeps GoDaddy as DNS (carries over from v1; no migration cost).
- **Alternative:** Route 53 — AWS-native DNS with tighter integration into ACM, CloudFront, ALB, and AWS health checks.
- **Why we'd swap:** if we need health-check-based DNS failover, latency-based routing, or geo-routing (multi-region — also parked under RF-2 in this doc); or if managing certificates and DNS across AWS feels cleaner than two consoles.
- **Why we didn't pick it for v2:** GoDaddy works and avoids a DNS migration (always a slightly risky operation, slightly downtime-prone). Saves a few dollars / month, but the real win is one fewer thing to migrate at v2 launch.

### Rate-limiter store: Redis (instead of Postgres)
- **Currently:** v2 ships `rate-limit-postgresql` PostgresStore from day one. Shared counter via existing RDS — no new infra.
- **Alternative:** Redis-backed store (e.g. `rate-limit-redis`). Lower latency than Postgres for the per-request counter increment.
- **Why we'd swap:** if Redis lands for other reasons (membership cache per RF-14, distributed locks per RF-6, queue, etc.), consolidate the rate-limiter onto it too.
- **Why we didn't pick it for v2:** Postgres is already there; adding Redis just for rate limiting is infra for the sake of infra.

### Auth: Self-built JWT (instead of AWS Cognito)
- **Currently:** AWS Cognito user pool, managed via `aws-amplify` (frontend) + `aws-jwt-verify` (backend). Locked at Q1.
- **Alternative:** self-built JWT auth — our own `refresh_tokens` table, rotation, family tracking, replay detection, password reset flow, email verification flow, account lockout, password strength enforcement.
- **Why we'd swap:** if we ever leave AWS (unlikely — AWS is our preferred long-term host); if Cognito's pricing changes drastically at scale; if a customer demands extreme UX customization Cognito's hosted UI / email templates can't accommodate.
- **Why we didn't pick it for v2:** ~300 lines of auth code we'd own + maintain (auth bugs are the worst class — intermittent + security-relevant); we'd build password-reset / email-verify / account-lockout / password-strength ourselves; deferred features (MFA, SSO, suspicious activity, sessions UI) become engineering work instead of config toggles.
- **Migration path (if we ever swap):** the `AuthService` interface is the abstraction. Implement `JwtAuthService` (~300 lines) + a parallel `JwtAuthClient` on frontend; add migration to create the `refresh_tokens` table; change one DI line on backend, one on frontend. Existing Cognito users would need a one-time password reset (Cognito user passwords don't extract).
- **Schema if implemented:** `refresh_tokens(jti, user_id, family_id, parent_jti, created_at, expires_at, revoked_at, user_agent, last_used_at)` with `(jti)` PK and `(family_id)` index.

### `current_org_id` injection: Pre-Token-Generation Lambda (instead of custom user attribute)
- **Currently:** `current_org_id` lives as `custom:current_org_id` on the Cognito user. Org switch = backend calls `AdminUpdateUserAttributes` + frontend triggers `Auth.currentSession()` refresh.
- **Alternative:** Pre-Token-Generation Lambda — runs on every Cognito token issuance; reads our app DB for the user's current org and injects into the token claims directly.
- **Why we'd swap:** higher freshness on org switch (no `AdminUpdateUserAttributes` round-trip needed); cleaner separation (org membership stays in our DB and never leaks into Cognito user attributes); easier "instant force token refresh" semantics if needed; richer per-token context possible (team membership, feature flags, role per org).
- **Why we didn't pick it for v2:** extra moving part — Lambda function to author + maintain + monitor + IAM permissions; Cognito custom attributes are sufficient for low-frequency org switches.
- **When to swap:** if org switching becomes very frequent (heavy multi-context users); if we want richer per-token context without storing it in Cognito; if we hit Cognito's custom attribute limits (50 attributes per pool).

### Cross-tab session sync: BroadcastChannel (instead of `storage` event)
- **Currently:** `storage` event listener on Amplify's auth keys in localStorage. Covers login / logout / org-switch propagation across tabs.
- **Alternative:** `BroadcastChannel` API for explicit pub/sub between same-origin tabs.
- **Why we'd swap:** when richer cross-tab messages are needed — real-time collaboration features, targeted query refetches (e.g. "user X just commented on ticket Y, refetch only that ticket"), custom event types beyond auth-state-change. `storage` event only fires on localStorage changes, so it's a coarse signal.
- **Migration path:** drop-in at the listener layer. Same handlers, different event source.

### Web token storage: cookie via Amplify config (instead of localStorage default)
- **Currently:** Amplify SDK stores Cognito tokens in localStorage by default.
- **Alternative:** configure Amplify's `cookieStorage` option to put tokens in cookies (with `Secure`, `SameSite=Lax`, `Path=/`).
- **Why we'd swap:** stronger XSS protection if rich-text rendering or other XSS-risky features land. localStorage is JS-readable — XSS-injected script can lift tokens. HttpOnly cookies cannot be read by JS.
- **Why we didn't pick it for v2:** Amplify's localStorage default is fine for our threat model (no rich-text user-generated HTML in v2); cookie config requires CORS adjustments for the auth flow; debugging is slightly harder with cookies.
- **Migration path:** Amplify config change in `frontend/lib/auth/amplify-config.ts`. Backend already accepts tokens from header or cookie (`aws-jwt-verify` works either way). Mobile unaffected (uses Bearer header from secure storage).
- **Companion change:** `storage` event won't fire on cookie changes. Add a non-sensitive `auth-state-version` flag in localStorage that bumps on auth changes — tabs listen for the flag, then re-validate via `Auth.currentSession()`.

---

## ⚠ Needs Discussion (surfaced 2026-06-08 cross-check)

Items found in an external notes file that aren't yet specced in this doc. **These need to be discussed** before they get a full entry above.

### Email deliverability hardening — SPF / DKIM / DMARC + domain warmup
- **✓ Promoted to v2 (2026-06-08)** → see § Production go-live plan (checklist B). Now launch-critical, no longer open.
- **Gap:** the *Pre-production email/sender hardening* section covers sender-swap, Cognito→SES, per-category segmentation, and SES sandbox-exit — but not DNS-level email authentication (SPF, DKIM, DMARC records) or a sender-reputation warmup ramp.
- **Why it matters:** without SPF/DKIM/DMARC, customer invites + notifications land in spam regardless of SES being out of sandbox. Warmup avoids reputation damage on a cold domain.
- **To discuss:** fold into the existing email-hardening section as Item 5, or stand it up as its own pre-prod checklist line.

### Org-level soft-delete / trash-bin (before Billing ships)
- **✓ Promoted to v2 (2026-06-08)** → see § Production go-live plan (checklist B). Now launch-critical, tied to Billing.
- **Gap:** today org delete is a hard `DELETE FROM organizations` with CASCADE — wipes everything instantly, no recovery. The existing *User-facing restore (recycle bin)* item is **entity-level only** (tasks/sprints) and explicitly notes org-level has no soft-delete.
- **Proposal from notes:** add `deleted_at` column on `organizations` + a 30-day purge cron so accidental/paid-customer org deletes are recoverable. Two-line schema change + one cron. Tie to the **Billing phase** (paid customers must not lose data on an accidental delete).
- **To discuss:** confirm scope (org-only vs. all tenant entities), retention window, and whether it blocks Billing.

### "Bought subscription, then deleted org" edge case
- **Gap:** only partially implied by *Refund policy* + *Subscription pause*. The scenario itself isn't written down.
- **Notes take:** org-scoped billing means the subscription dies with the org (no orphan charges); support-route refund of the unused remainder is reasonable; v3 polish = subscription pause/suspend instead of cancel-on-delete if volume justifies.
- **To discuss:** confirm cancel-on-delete behavior + support refund SOP; pairs with the org-soft-delete item above.

### R&D / non-IT use of the PM tool
- **Gap:** not captured anywhere. Idea is positioning Rai for non-software R&D / general project workflows (not just IT/Jira-style).
- **To discuss:** too vague to spec — needs a product conversation on whether this is a real direction or a passing thought.

### ⚠ Raw notes to explore (added 2026-06-08) — **need to discuss**
- **Can Rai replace Excel feeding?** e.g. supply-chain (SC) / spreadsheet-driven workflows — explore where teams currently live in Excel and whether Rai's tables/tickets can absorb that.
- **What else does Jira have for Story / Epic / Bug tickets?** audit Jira's per-type fields + behaviors beyond what we have, feed into the *Type-specific ticket fields* item above.
- **What can we add vs Odoo?** an Odoo ad showed extras Jira (and our product) don't have — Rai is lean by comparison. List what Odoo/Monday/ClickUp carry that we're missing, feed into the *PM-feature backlog* Tier 1-3 menu.

---

## ⚠ Needs Discussion (surfaced 2026-07-17, convo-072 cross-check)

Open points raised while setting the [[priority stack]]. **All parked for a dedicated discussion — nothing decided, nothing built.** Grouped by what kind of question each one actually is.

### 1. Agent-ready PATs — design decisions still open
The shape is settled (standalone `rai_pat_…`, sha256-stored, org-scoped v1 — see the ⭐ block at the top). **What isn't:**
- **Confirm the composite is dead.** The pitched "Cognito access token + random key" is superseded. Worth saying out loud once so it doesn't resurface — the pitch already contradicted this doc's own pinned block, which means the decision was written down but not visible at the moment of thinking.
- **Org scoping:** per-org keys (v1, simplest) vs an `X-Org-Id` header (stateless, right long-term). Driver: `currentOrgId` is server-side session state today, so concurrent agents stomp each other.
- **Scopes in v1, or all-or-nothing?** Read-only vs write lets a user hand an agent a *safe* key. Cheap now, retrofit-painful later — a key issued without scopes can't gain them without reissue.
- **Discovery order:** ship `/openapi.json` first, or go straight to the MCP server? OpenAPI is days and unlocks *any* agent; MCP is the endgame and nicer for Claude specifically. Not mutually exclusive — the question is sequencing.
- **Per-key rate limiting + audit log:** `rateLimiter.ts` is IP-based today. Both are wanted the first time a key leaks; neither blocks v1. Decide if they ship with it or after.

### 2. Default-to-me reversal — confirm the flip
- **Gap:** the parked *Default-to-me filter* entry (2026-05-29) and the 2026-07-17 instruction are **direct opposites**. Entry now marked ⚠ REVERSED, but the reversal deserves a conscious sign-off, not a silent doc edit.
- **Why it matters:** the original had a real argument behind it — 100-ticket sprint, 50 members, overwhelming first load. Live use produced the opposite verdict ("annoying"). **Both can be true at different org sizes** — that's the actual thing to discuss, because it suggests the right answer may be *neither* a hardcoded default but a per-user preference, which is roughly what the surviving localStorage persistence already implies.
- **To discuss:** confirm all-by-default, and decide whether the org-size case ever gets a smarter default.

### 3. Attachments + profile pics — sequencing the shared S3 subsystem
- **Gap:** both entries were independently specced and independently parked as "too heavy / not launch-critical" — but **they're the same subsystem** (S3 + presigned upload + signed download). Neither entry noticed the other.
- **Why it matters:** the "too heavy" objection was priced per-feature. Once attachments ship the storage layer, profile pics become mostly UI — so the original reason for cutting them largely evaporates. Sequencing them together may be materially cheaper than the roadmap assumes.
- **To discuss:** build the storage layer once, explicitly, with both consumers in mind? And does profile pics ride along or stay queued?

### 4. Customisable kanban columns — scope reality check
- **Gap:** filed as a feature, but **status is a fixed enum today**. Real cost: a per-project workflow/statuses table, a migration off the enum, and a follow-through pass on every status-dependent surface (board, backlog, reports, filters, any status-keyed logic).
- **Why it matters:** it's sized like a settings screen and priced like a schema migration. Also interacts with **org-level reports** (#5) — reports that aggregate across projects get harder when each project defines its own stages.
- **To discuss:** scope it properly before committing; decide whether it lands before or after org-level reports, since the order changes the cost of both.

### 5. Org-level reports — needs a scoping pass
- **Gap:** "big scope but definitely needed" (user's own framing) is all we have. No metrics list, no aggregation model.
- **Why it matters:** this is the **first genuinely cross-project read path** in the product. Query performance on large orgs is the part that bites, and it's an architecture question, not a UI one.
- **To discuss:** which metrics; aggregation level (org → project → sprint); performance strategy (live query vs rollup table). Pairs with #4.

### 6. Mobile responsiveness — scope is ambiguous
- **Gap:** "mobile res in android is the worst, especially in iPhone" — but we now have **two** mobile surfaces: the responsive web app and the React Native app at `rai/mobile`. The complaint doesn't say which.
- **Why it matters:** completely different work. Web-responsive = breakpoints + iOS Safari quirks (safe-area insets, 100vh, tap targets). Native = an RN codebase built by a separate dev.
- **To discuss:** confirm which surface before anyone starts.

### 7. Housekeeping — `rai/mobile` clone
- **`mobile/` is not in `rai/.gitignore`.** It's a nested git repo; the parent sees it as untracked. A `git add` from the `rai` root would record a gitlink. Decide: ignore it, or make it a proper submodule?
- **Deps not installed** — no `npm install` run in `rai/mobile` yet.

---

## Tech debt — address pre-production (highest priority)

Code workarounds that work today but should be cleaned up before go-live.

### Razorpay SDK type cast (`payload as any`) in `razorpay.provider.ts`

- **What:** `subscriptions.create(payload as any)` casts away the SDK's parameter type. The Razorpay SDK types a field as `0 | 1 | boolean`, but the live API only honours the string value — so the typed call is bypassed with `as any` (comment-flagged in code).
- **Why it's debt:** the `as any` disables type-checking on the entire subscription-create payload, so a typo or wrong field would compile silently.
- **Fix:** pin/upgrade the Razorpay SDK to a version with correct types, or define a narrow local interface for the payload and cast to that (not `any`) so the rest of the object stays type-checked.
- **Source:** backend commit `2fc563e1` (Razorpay billing integration), reviewed 2026-06-13.
- **Priority:** pre-prod, high.

---

## How to use this doc

- When a feature gets deferred during a discussion, add a bullet under **Upcoming Features** with: status, where it was decided, spec when implemented, migration / trigger to revisit.
- When we pick implementation A knowing implementation B is a viable swap target, add a bullet under **Alternative Implementations** with: what we have, what the swap is, why we'd swap, why we didn't pick it now, migration path.
- This doc is the source of truth — `v2-plans.md`, `v2-decisions.md`, and `dev-standards.md` reference it instead of duplicating.
- Items rejected outright (e.g. 6-digit org-join codes, one-pool-per-org Cognito) do **not** belong here — they're noted in the originating discussion only.
