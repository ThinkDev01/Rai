# Rai v2 — Important Questions to Decide Before Starting

**Purpose:** Decision log for v2's 16 load-bearing architecture questions. Each question has options, tradeoffs, the locked decision (with reason), and discussion notes that reproduce the chat that led to the decision. Intent: this doc is **self-sufficient** — re-opening it cold should reproduce the conversation, not just the conclusion.

**Companion to:** `v2-plans.md` (roadmap; the rapid-fire short-answer summaries now live there as appendix **A3 · v2 Rapid-Fire Decisions**), `upgrades.md` (parked features and swap targets), `dev-standards.md` (cross-cutting standards). The full rapid-fire reasoning (RF-1 … RF-16) is in this doc's own "Edge-case decisions" section below.
**Status:** Open. Work through questions one by one. Capture decisions and discussion notes inline.

These all need answers **before** the first migration runs. Most lock in schema, JWT shape, or URL routing — expensive to change after data exists.

## Contents

**Load-bearing questions (Q1–Q16)**

- [1. One user → many orgs?](#1-one-user--many-orgs)
- [2. URL strategy for tenancy](#2-url-strategy-for-tenancy)
- [3. Tenant isolation — middleware, RLS, or both?](#3-tenant-isolation--middleware-rls-or-both)
- [4. Existing v1 staging data — what happens?](#4-existing-v1-staging-data--what-happens)
- [5. Org admin vs project admin](#5-org-admin-vs-project-admin)
- [6. Invite flow for non-existing users](#6-invite-flow-for-non-existing-users)
- [7. Email verification — when?](#7-email-verification--when)
- [8. RDS migration timing](#8-rds-migration-timing)
- [9. Cognito — single pool or one per org?](#9-cognito--single-pool-or-one-per-org)
- [10. Free trial — card on file or not?](#10-free-trial--card-on-file-or-not)
- [11. Subscription expiry behavior](#11-subscription-expiry-behavior)
- [12. Service layer decomposition](#12-service-layer-decomposition)
- [13. Migration order for adding `org_id` to existing tables](#13-migration-order-for-adding-org_id-to-existing-tables)
- [14. Org deletion — hard delete or soft + retention?](#14-org-deletion--hard-delete-or-soft--retention)
- [15. Last admin leaves — what happens?](#15-last-admin-leaves--what-happens)
- [16. Index audit on `org_id`](#16-index-audit-on-org_id)

**Edge-case rapid-fire round** — [overview](#edge-case-decisions-post-q16-rapid-fire-round)

- [RF-1. Multi-device and multi-tab session sync](#rf-1-multi-device-and-multi-tab-session-sync)
- [RF-2. Cognito API rate limits and retry/backoff strategy](#rf-2-cognito-api-rate-limits-and-retrybackoff-strategy)
- [RF-3. Auth and security audit logging](#rf-3-auth-and-security-audit-logging)
- [RF-4. No-org post-signup UX](#rf-4-no-org-post-signup-ux)
- [RF-5. Many-orgs UX (org switcher scaling)](#rf-5-many-orgs-ux-org-switcher-scaling)
- [RF-6. Rapid org-switch race conditions](#rf-6-rapid-org-switch-race-conditions)
- [RF-7. SSO providers → user_orgs mapping](#rf-7-sso-providers--user_orgs-mapping)
- [RF-8. DB ↔ Cognito sync failure reconciliation](#rf-8-db--cognito-sync-failure-reconciliation)
- [RF-9. Session and permission consistency mid-flight](#rf-9-session-and-permission-consistency-mid-flight)
- [RF-10. Subscription expiry session behavior](#rf-10-subscription-expiry-session-behavior)
- [RF-11. Active-org deleted while user is logged in](#rf-11-active-org-deleted-while-user-is-logged-in)
- [RF-12. Invite edge cases beyond Q6 happy path](#rf-12-invite-edge-cases-beyond-q6-happy-path)
- [RF-13. Token refresh stale window during org switch](#rf-13-token-refresh-stale-window-during-org-switch)
- [RF-14. Per-request membership validation scaling](#rf-14-per-request-membership-validation-scaling)
- [RF-15. Cache invalidation strategy (future Redis)](#rf-15-cache-invalidation-strategy-future-redis)
- [RF-16. Cognito swap future-proofing (preserving `users.id` mapping)](#rf-16-cognito-swap-future-proofing-preserving-usersid-mapping)

- [How to use this doc](#how-to-use-this-doc)

---

## 1. One user → many orgs?

**Why it matters:** Decides the user ↔ org schema and changes JWT shape, route prefix, and the UI org-switcher. The most load-bearing question on this list.

**Options:**
- **A. One user, one org** — `users.org_id` column. Simplest. Switching orgs = log out, log in with a different account.
- **B. One user, many orgs** — `user_orgs` join table with `(user_id, org_id, role)`. JWT carries current `org_id`. UI has an org switcher (like Jira, Slack, GitHub).

**Tradeoffs:** B is what real customers expect (consultants, contractors, multi-team employees). A is faster to ship but is a one-way door — converting later means rewriting auth, JWT, and every query.

**Decision: B — one user, many orgs.** Reason: industry standard (Jira, Slack, GitHub, Notion, Linear, Asana all use this); first-principles user flows (pre-existing accounts, consultants in multiple customer orgs, personal-then-work) all break under A; A→B migration later costs ~5x what B costs upfront (schema, JWT shape, every controller, frontend switcher, force-logout). B costs ~1–2 days more in v2 and removes the future migration entirely.

**Sub-decisions locked together with Q1:**

- **Auth provider: AWS Cognito (locked).** v2 ships with a managed Cognito user pool. AWS owns refresh-token rotation, family tracking, replay detection, multi-device, concurrent-refresh dedup, global sign-out, password reset, email verification, account lockout, and password strength. We don't build any of that. Cognito tokens are verified on the backend via `aws-jwt-verify` against the user pool's JWKS endpoint. Frontend uses `aws-amplify` for sign-in / sign-out / refresh.
- **Session model:** `current_org_id` lives in a Cognito custom user attribute (`custom:current_org_id`). Org switcher calls `POST /api/v1/auth/switch-org` → backend `AdminUpdateUserAttributes` to set the new value → frontend triggers `Auth.currentSession()` refresh → new ID token reflects the attribute. UX is a click + dashboard refetch — not a logout/login form.
- **Middleware re-checks membership on every request:** auth chain re-validates `user_orgs(user_id, current_org_id)` per request. The token's `custom:current_org_id` claim is *not* trusted blindly. Handles mid-session removal (admin kicks user → next request 403s, doesn't wait for token expiry).
- **Subscription tied to the org, not the user:** all members inherit `organizations.subscription_status`. Middleware checks org subscription per request. Admin sees billing redirect on expiry; non-admin sees "contact your admin to renew." Read-only-grace vs. hard-lock specifics → Q11.
- **Cross-tab auth sync:** `storage` event listener on Amplify's auth-related localStorage keys. When one tab signs in / signs out / switches org, all tabs receive the event, clear React Query cache, and refetch. `BroadcastChannel` is the upgrade path if richer cross-tab messages are needed (e.g. real-time collab features).
- **No `refresh_tokens` table** — Cognito handles all refresh-token state internally on AWS. Our DB stores `users` (profile only — no password column, keyed by Cognito's `sub` UUID), `organizations`, `user_orgs`, etc.
- **`current_org_id` injection: custom attribute (not Pre-Token-Generation Lambda).** Simpler — no Lambda function to maintain. Pre-Token-Generation Lambda is captured in `upgrades.md` as the "industrial strength" upgrade for high-frequency org switches or stricter freshness requirements.
- **Middleware structure:** auth chain split into small single-purpose functions (`verifyCognitoJwt`, `loadUser`, `checkOrgMembership`, `checkSubscription`) in a dedicated `src/middleware/auth/` folder. Each ~10–30 lines, unit-testable in isolation. Composed and mounted on every tenant-scoped router. This is the most security-critical code in the app — gets integration tests for every gate (invalid token → 401, non-member → 403, expired sub → 402, removed mid-session → 403).
- **Plug-and-play swap target preserved:** all auth logic behind `AuthService` interface (`dev-standards.md` §8). v2 ships `CognitoAuthService`. Self-built JWT (`JwtAuthService`) is documented in `upgrades.md` as the alternative implementation if we ever leave AWS.

**Cognito session model details:**

| | |
|---|---|
| User pool | One pool, shared across all orgs (custom attribute distinguishes orgs) |
| Custom attributes on users | `custom:current_org_id` (mutable; set on first org join, updated on every org switch) |
| Access token TTL | 60 min (Cognito default; lowerable per app client) |
| ID token TTL | 60 min (carries `custom:current_org_id` claim) |
| Refresh token TTL | 30 days (Cognito default; matches our absolute-expiry intent) |
| Rotation, replay detection, family tracking, multi-device | Cognito-managed |
| Web token storage | Amplify SDK manages: tokens in localStorage by default (configurable to cookie — see `upgrades.md`) |
| Mobile token storage | Amplify SDK manages: secure storage (iOS Keychain / Android Keystore) |
| Backend verify | `aws-jwt-verify` validates token signature against Cognito JWKS — same code path for header or cookie source |
| Login | `Auth.signIn(email, password)` (Amplify) — Cognito issues access + ID + refresh tokens |
| Logout (this device) | `Auth.signOut()` clears local + revokes refresh server-side |
| Logout from all devices | `Auth.signOut({ global: true })` revokes every session for the user — built-in, sub-second |
| Org switch | `POST /api/v1/auth/switch-org` → backend `AdminUpdateUserAttributes` → frontend `Auth.currentSession()` refresh |
| Password reset | `Auth.forgotPassword(email)` → Cognito sends email with code → `Auth.forgotPasswordSubmit(email, code, newPassword)` |
| Email verification | Cognito-built (toggle: required-on-signup, blocks org create until verified) |
| Account lockout | Cognito-configurable in pool policy (failed-attempts threshold + lockout duration) |
| Password strength | Cognito-configurable in pool policy (min length, character classes) |
| Login rate limit | Cognito basic built-in; Cognito Advanced Security tier ($0.05/MAU) for risk-based rate limiting |
| MFA / SSO (later) | Cognito built-in toggles — no code work, captured in `upgrades.md` |
| Suspicious activity (later) | Cognito Advanced Security tier — captured in `upgrades.md` |
| Active sessions UI (later) | Powered by Cognito's `AdminListUserAuthEvents` API — captured in `upgrades.md` |
| Local dev | Shared `rai-dev` Cognito pool (devs point local backend at it via `.env.local`) |
| Unit tests | `MockAuthService` implementing the same `AuthService` interface (bcrypt + local Postgres) — fast, offline, deterministic |
| CI integration tests | Dedicated `rai-ci` Cognito pool that resets between runs |
| Plug-and-play swap | All auth behind `AuthService` interface (`dev-standards.md` §8). v2 = `CognitoAuthService`. Fallback = `JwtAuthService` documented in `upgrades.md`. |

**Rejected (in earlier discussion before Cognito was chosen):**
- **Self-built JWT with `refresh_tokens` table, rotation, family tracking, replay detection** (~300 lines of auth code we'd own + maintain). Captured in `upgrades.md` as the alternative implementation if we ever leave AWS. Earlier-locked details (15-min access TTL, 7-day sliding + 30-day absolute refresh, rotation + replay, cookie + Bearer dual storage, axios interceptor dedup, `SELECT FOR UPDATE` row lock, etc.) are preserved there.
- `users.token_version` column-bump-per-request — irrelevant under Cognito (no JWT we sign).
- Redis blacklist for sub-15-min revocation — irrelevant under Cognito (`Auth.signOut({ global: true })` is sub-second).

**Q1 fully closed. ✅**

**Switcher UX:** right-side profile dropdown listing the user's orgs, "show more" if >10. Click → JWT swap → cache clear → dashboard refetches with the new org's data. No login form. Slack/GitHub-style.

**Discussion notes:**
- Industry survey: every B2B SaaS at scale (Jira/Atlassian, Slack, GitHub, Notion, Linear, Asana) is one user → many orgs. Nobody at scale picks one-user-one-org for B2B.
- One-user-one-org breaks for: existing-account-then-invited users (sandbox account collides with company invite), consultants serving multiple customers, personal-then-work account paths. Each requires ugly workarounds (delete account, `+alias` emails, abandoned orgs).
- A→B migration later: new `user_orgs` table + backfill, JWT shape change, every endpoint reading `req.user.org_id` rewritten to `req.context.org_id`, frontend switcher added, force-logout-everyone for token reissue. ~1–2 weeks of work + coordination on a live system. B in v2 is ~1–2 days extra. Roughly 5:1 cost ratio.
- "Leave org" UX (under B): just remove the `user_orgs` row. Account survives. Dashboard shows next org, or empty state ("Create org or wait for invite") if user belongs to none. Same screen new users see post-signup.
- Email verification before org create / invite / accept — confirmed conceptually here; finalize at Q7.
- Stale-membership / expired-subscription middleware checks are ~3ms per request with proper indexes (`user_orgs(user_id, org_id)` PK, `organizations(id)` PK). Negligible.
- **Code-based join (Discord-style)** — **deferred to a later release**, parked in `v2-plans.md` under "Deferred Features (un-scoped)". When implemented: 8-character alphanumeric (NOT 6-digit numeric — only ~1M combinations, brute-forceable since attacker just needs to land on any valid org's code), uppercase, exclude confusables (0/O, 1/l, I), multi-use, admin-rotatable, 7-day TTL, rate-limited per IP and per account, paired with email invites as a parallel path.
- **RLS as defense-in-depth** — user leans toward middleware + RLS together. Full debate at Q3. Current lean: middleware-first, RLS once middleware is proven solid in staging. Reason: with both layers active from day one, debugging "query returns empty" is harder (could be middleware filtering or RLS rejecting). Easier to ship middleware → debug → trust → layer on RLS.

---

## 2. URL strategy for tenancy

**Why it matters:** Affects DNS, cookies, CORS, JWT contents, and how customers perceive the product.

**Options:**
- **A. Subdomain per org** — `acme.rai.app`. Looks professional. Wildcard SSL cert needed. Cookies scoped per subdomain (or `.rai.app` parent). DNS provisioning per org.
- **B. Path prefix** — `rai.app/orgs/acme/...`. No DNS work. Single SSL cert. Slightly less polished UX.
- **C. Org in JWT only, no URL distinction** — `rai.app/dashboard` and the JWT decides which org. Simplest. Doesn't communicate tenancy in the URL — bookmarks across orgs all look identical.

**Tradeoffs:** A is the "enterprise" choice but adds infra. C is simplest, B is the middle ground. Combining B + storing current org in JWT is common.

**Decision:** **B — path-based, `rai.app/orgs/<slug>`.** Reason: zero DNS/SSL work for v2, no reserved-slug collision with system routes (`/login`, `/api`, etc.), and subdomain (`acme.rai.app`) stays open as a future infra-only migration because `org_id` is sourced from the JWT — the URL slug is decorative. Combining B's path with C's "tenancy in JWT" gives us safety today and the subdomain door for tomorrow.

**Discussion notes:**
- Industry survey: Jira/Slack/Notion/Linear/Asana use subdomain. GitHub/GitLab/Vercel/Figma use path. Both are valid B2B patterns — subdomain reads "enterprise/branded", path reads "collaboration-friendly".
- Considered a third path form `rai.app/<slug>` (no `/orgs/` prefix, GitHub-style). **Rejected** — system routes (`/login`, `/signup`, `/api`, `/dashboard`, `/settings`, `/.well-known/...`) live at the same path level, forcing a reserved-slug blocklist that grows every time a new system route is added (GitHub maintains ~100 reserved org names for this reason). The `/orgs/` prefix puts a permanent wall between system land and tenant land.
- Subdomain (option A) deferred to Phase E because it adds wildcard SSL, wildcard DNS, cookie scope changes, and CORS work for zero v2 functionality. Real customer demand (e.g. enterprise SAML, vanity URL ask) will be the trigger to flip the switch.
- **Companion rule (codified in `dev-standards.md`):** `org_id` is read from the JWT, never from `req.params` or the URL slug. URL slug is display-only and must match the JWT's `org_id` or 403. This is the single design choice that keeps the path → subdomain migration as an infra-only change, not a rewrite.
- **Migration path** (path → subdomain) checklist captured in `dev-deployment.md` under "Future: vanity subdomain migration".

---

## 3. Tenant isolation — middleware, RLS, or both?

**Why it matters:** This is the wall between Org A and Org B's data. A leak here is catastrophic.

**Options:**
- **A. Middleware-only** — auth middleware extracts `org_id` from JWT, attaches to `req.context`, every query helper enforces `WHERE org_id = $orgId`. Easier to debug. Risk: a hand-written query without `WHERE org_id` = leak.
- **B. RLS-only** — Postgres `SET app.current_org_id` per request, RLS policies enforce. Strong guarantee. Risk: forgot to set the var → queries return nothing, hard to diagnose.
- **C. Both** — middleware as primary, RLS as defense-in-depth.

**Tradeoffs:** Middleware is debuggable but trusts every dev to use the helper. RLS is bulletproof but operationally heavier. C is the safest, but adds setup overhead for v2.

**Decision: A — middleware-only for v2.** Reason: ship and validate one wall first to keep debugging clean (a query returning empty has one possible source, not two). RLS is parked in `upgrades.md` as defense-in-depth to layer on within the same v2 cycle once middleware is proven solid in staging. Both walls active before anything ships to production.

**Discussion notes:**
- The risk middleware-only carries: a hand-written query missing `WHERE org_id = $1` = leak. Mitigations: (a) shared query helpers / repository pattern that always inject `org_id`, (b) integration tests that try cross-org access on every endpoint, (c) code review discipline.
- RLS later is straightforward: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + per-table policy + `SET app.current_org_id = $1` from middleware on every request. ~50 lines of SQL across the tenant tables. One-time setup once schema is stable.
- Locked at Q1 preview; confirmed here.

---

## 4. Existing v1 staging data — what happens?

**Why it matters:** Once `org_id` becomes NOT NULL on every table, current rows break.

**Options:**
- **A. Drop and reseed** — wipe staging DB, fresh schema, new seed. Cleanest. Loses any test data you wanted to keep.
- **B. Migrate into "default org"** — create org_id=1 'Default Org', backfill all existing rows. Preserves test data. Adds a one-time migration.

**Tradeoffs:** A is faster, B preserves continuity. Since this is staging only, A is usually fine.

**Decision: A — drop and reseed.** Internal staging only ~10 fake test users; nothing of value to migrate. v1 EC2 instance stays running on the side as a legacy reference for 30 days (internal team grabs anything they care about); after 30 days the instance + Docker volumes + EBS are wiped.

**Discussion notes:**
- Fresh v2 schema from scratch — no nullable-then-NOT-NULL backfill needed for `org_id`. Simplifies Q13 (migration style).
- Fresh Cognito `rai-staging` user pool stands up at the same time.
- Fresh RDS instance at staging cutover (Q8).
- v1 instance kept on EC2 for 30 days = ~$15 of EC2 + EBS for the legacy hedge. Negligible.

---

## 5. Org admin vs project admin

**Why it matters:** Decides whether the existing project-level RBAC stays meaningful or becomes redundant.

**Options:**
- **A. Two tiers** — org admin (manages org, billing, members) sits above project admin (manages project content). Org admins can do everything project admins can. Project admin still meaningful for delegation within an org.
- **B. Org admin subsumes project admin** — only one admin role. Simpler but every project decision goes to org admins.

**Tradeoffs:** A matches Jira/GitHub. B is simpler but doesn't scale to orgs with 50+ projects.

**Decision: A — two tiers (org admin + project admin).** Existing v1 role names carry over (`admin`, `project_manager`, `user`); semantics expand in v2 to be org-aware.

**Role map (v2):**
- **`admin`** (org admin) — full control over the org: settings, billing, members, role changes, override permissions on all projects within the org. Maps to Jira's "Site Admin." **Only `admin` can change anyone's `role_type`.**
- **`project_manager`** — project-level admin: project settings, project member management, sprint lifecycle, ticket bulk actions within projects they're a member of. Cannot change org-level roles or affect projects they're not in.
- **`user`** — regular member: works on tickets in projects they're members of. Read access governed by project visibility (existing v1 carry-over).

**Org admins can:** override anything a project_manager does in any project within the org.
**Project managers can NOT:** add/remove someone from the org, change someone's `role_type`, or affect projects they're not members of.
**Users can NOT:** modify project settings or membership.

**Discussion notes:**
- Industry survey: Jira (Site Admin / Project Admin), GitHub (Owner / Admin / Member), Slack (Workspace Owner / Admin / Member), Notion (Workspace Owner / Admin / Member). All two-tier (or three if you count Owner separately).
- Option B (org admin subsumes project admin) rejected — doesn't scale to orgs with 50+ projects where every decision routes through one role.
- v1 role names preserved for continuity. The semantics expand: `admin` now means org-level admin (was just "app admin" in v1's single-tenant world).

---

## 6. Invite flow for non-existing users

**Why it matters:** Invite has to work for both "already has account" and "no account yet". Token design has to cover both.

**Options:**
- **A. Single token, two paths** — invite token in URL. If user is logged in → join org immediately. If not → redirect to signup with token preserved → after signup, auto-join the org. Token has expiry (e.g. 7 days), single-use.
- **B. Pre-create user on invite** — create a user record with status `pending` on invite. Invitee sets password to activate. Cleaner state model but creates ghost users if invites are never accepted.

**Tradeoffs:** A is more conventional. B is cleaner but adds cleanup burden.

**Decision: A — single token, two paths.** Email invite in v2; code-based join deferred to a later release (parked in `upgrades.md`).

**v2 invite flow:**
1. `admin` or `project_manager` (member-management UI) → "Invite by email" → enters email + role → backend creates row in `invites` table: `(token, org_id, role, invited_email, invited_by, expires_at, used_at)` with **7-day TTL, single-use**.
2. Backend sends email with link `https://rai.app/invite/<token>`.
3. Invitee clicks the link:
   - **Already signed in:** backend validates token → inserts `user_orgs` row → redirects to org dashboard with toast "You've joined [Org Name]."
   - **Has account but signed out:** redirects to login → after sign-in validates token → joins → dashboard.
   - **No account:** redirects to signup with `?invite=<token>` preserved → after signup + Cognito email verify → auto-joins org → toast.
4. Token marked `used_at = NOW()` after success. Single-use.
5. Expired or used tokens (`expires_at < NOW()` or `used_at IS NOT NULL`) → friendly "this invite has expired/been used — ask for a new one" page.

**Code-based join (deferred to later release):** captured in `upgrades.md`. Refinement from this discussion — **24-hour auto-refreshing code** (auto-rotates every 24 hours to limit blast radius if leaked, vs. the static 7-day code earlier discussed). Pair with email invites as parallel paths when implemented.

**Discussion notes:**
- Token shape stays the same regardless of whether invitee has an account — server decides the path based on whether the email is a known Cognito user.
- Email-verification gate (Q7) applies before invite acceptance can complete on the no-account path.
- Pre-creating ghost users on invite (option B) rejected — adds cleanup burden if invites are never accepted; ghost users clutter the user pool.

---

## 7. Email verification — when?

**Why it matters:** Decides whether spam orgs are possible.

**Options:**
- **A. Verify before org creation** — signup → verification email → click link → can now create org. Blocks spam orgs at the source.
- **B. Verify after org creation, soft enforcement** — create org immediately, show banner until verified, lock writes after N days unverified.

**Tradeoffs:** A is safer. B is friendlier onboarding but allows spam. A is the standard for SaaS.

**Decision: A — verify email before any org action.** Sign-in itself is blocked until the email is verified.

**Implementation under Cognito:** "Email verification required" toggle on the user pool. Cognito's `email_verified` attribute starts `false` and becomes `true` after the user clicks the link. Cognito blocks `Auth.signIn()` until verified — no code we write, just pool config.

**Discussion notes:**
- Spam prevention happens at the source: unverified emails can't sign in, so they can't create orgs or accept invites.
- Cognito sends the verification email via SES (template + sender configurable). UX is whatever Cognito provides — B2B-acceptable.
- Aligns with invite flow (Q6): no-account invitees must verify email before joining org completes.

---

## 8. RDS migration timing

**Why it matters:** Combining a schema overhaul with an infra migration compounds risk.

**Options:**
- **A. RDS now, before v2 schema work** — get infra stable first.
- **B. Stay on Docker Postgres for v2 schema, migrate to RDS after** — change one variable at a time.
- **C. Skip RDS for v2 launch** — Docker Postgres on EC2 for prod-launch v1 of v2; RDS later when scale demands.

**Tradeoffs:** B is the safest sequencing. C is fine for low scale but eventually needs RDS for backups + HA.

**Decision: B (refined) — Docker Postgres for v2 dev → fresh RDS at staging deploy → drop Docker DB at cutover.**

**Sequence:**
1. Develop v2 schema + features in local Docker Postgres (current setup).
2. Local testing.
3. Deploy v2 to staging EC2: stand up fresh RDS Postgres 16 instance, run migrations, stand up fresh Cognito `rai-staging` pool, deploy backend + frontend.
4. Internal team uses v2 staging.
5. v1 EC2 instance + Docker stack stays running on the side for 30 days as legacy reference.
6. After 30 days: wipe v1 instance — Docker volumes, EBS snapshots, all gone.

**Discussion notes:**
- Same Postgres major version (16) across local Docker and RDS — plain SQL migrations port without changes.
- Combining schema overhaul + RDS migration into one cutover is OK because the schema is fresh (Q4 drop and reseed): there's no data migration step, just running migrations against an empty RDS instance.
- Avoids two infra changes spread over time (would have been Docker → schema-update → RDS, two cutovers).
- Production RDS migration (when prod launches) will be its own deploy: fresh RDS instance + Cognito pool, no v1 to migrate.

---

## 9. Cognito — single pool or one per org?

**Why it matters:** Decides identity architecture for all future SSO/federation work.

**Options:**
- **A. Single pool, `org_id` as custom attribute** — all users in one pool, JWT custom claim carries org. Group claims for org admin role.
- **B. One pool per org** — strong isolation but doesn't scale, makes "user in many orgs" nearly impossible, complicates federation.

**Tradeoffs:** A is the standard answer. B is rejected by industry consensus for SaaS.

**Decision: A — single pool, `custom:current_org_id` as user attribute.** Locked together with Q1 when AWS Cognito was chosen as the auth provider. See Q1 for the full Cognito session model and the `project_v2_cognito.md` memory.

**Discussion notes:**
- One pool per org rejected industry-wide for SaaS: doesn't scale, makes "user in many orgs" nearly impossible, complicates federation.
- One pool with `custom:current_org_id` matches our many-orgs-per-user model. Membership lives in our DB (`user_orgs`), not in Cognito.

---

## 10. Free trial — card on file or not?

**Why it matters:** Affects conversion rate, fraud rate, and how the `subscriptions` / `payment_methods` tables are shaped.

**Options:**
- **A. No card on signup, 30-day trial** — friendlier onboarding, higher trial signups, lower conversion to paid.
- **B. Card required on signup** — fewer trial signups, much higher conversion, blocks fraud.
- **C. Hybrid** — no card for trial, but card required to keep using past day 30.

**Tradeoffs:** A or C for early-stage product (you want trial volume to learn). B once you have product-market fit.

**Decision: A — no card, 30-day free trial.** v2 customer base is internal teams + initial customers; friction-free signup beats fraud protection at this stage. Card requirement moves to v3 — v2 → v3 mid-trial users grandfathered to end of current trial, card prompted at conversion to paid. ✅

**Companion locks under Q10:**
- **Email verification required pre-org-creation.** Cognito-managed toggle. Persistent banner on app pages until verified. Unverified Cognito users can exist but `orgs.create` is blocked.
- **Trial duration: 30 days** (not "1 month" — calendar months drift).
- **No self-serve trial extension.** Internal admin panel handles extensions (audit-logged button with required "why" field).
- **`payment_methods` table skipped in v2** — additive in v3, no migration on `subscriptions` needed (nullable provider `*_customer_id` / `*_subscription_id` columns staged from v2).

**Discussion notes:**
- Industry norm split: early-stage B2B → A (Linear, Notion early days); post-PMF B2B → B (Datadog, Stripe themselves). C (hybrid) is what Slack does. For Rai's v2 internal-team focus, A wins on volume-of-learning.
- Trial abuse mitigation under "no card": email verification + one-email-one-org policy (informal — same email reusing for multiple trials is a v3 concern when Razorpay does customer dedup).
- Schema decision: build `subscriptions` from day one with nullable provider columns. Don't build `payment_methods` until v3. `billing_profiles` (GSTIN, state, address) also v3.
- v3 deferred billing details (GST handling, dunning, refunds, chargebacks, annual interval, multi-currency, discount codes, subscription pause, mid-cycle proration choice) → all captured in `upgrades.md` under "v3 Billing Follow-ups".

---

## 11. Subscription expiry behavior

**Why it matters:** Decides what a customer sees when their trial / subscription ends.

**Options:**
- **A. Read-only grace period (e.g. 14 days)** — login works, dashboard works, export works, but create/edit blocked with "renew" prompt. After grace: full lock.
- **B. Hard lock immediately on expiry** — write actions blocked, dashboard shows "renew" page only.
- **C. Soft warning, no lock** — banner only, full access continues.

**Tradeoffs:** A is the conventional SaaS pattern. B is harsh but pushes conversions. C is risky for revenue.

**Decision: A modified — indefinite read-only on expiry.** No grace-then-hard-lock cliff in v2. Read-only persists until either (a) the org pays, or (b) v3 retention policy kicks in (Q14 closes that loop). ✅

**Companion locks under Q11:**
- **Pre-expiry comms:** email at T-7d, T-1d, T-1h.
- **Blocked under read-only:** create/edit/delete tasks, create/edit/close sprints, change task status, assign tasks, invite members, change org settings.
- **Still works under read-only:** login, view dashboards / tasks / sprints / members, export data, renew/add payment, cancel subscription, change own profile.
- **Reactivation:** instant on payment, no ops intervention.
- **Cancellation:** end-of-period. Cancel mid-cycle → full access through end of billing period. Standard B2B SaaS.
- **Long-term retention after indefinite read-only:** deferred to Q14.

**Pricing structure locked alongside Q10/Q11:**
- **Per-seat per member.** Seat = `org_members.status = 'active'`. Pending invites don't count. Removed users don't count. Same user removed + re-added = 1 seat.
- **Single plan, fully unlocked.** No Free/Pro/Enterprise tiers in v2.
- **Monthly only** (annual → v3). **INR only** (multi-currency → v3).
- **Org pays one combined invoice** (`active_seats × price_per_seat`). Individual members never have a payment method. Per-seat is pricing math, not invoicing structure.
- **Mid-cycle seat add:** ✓ **Revised in v2 (2026-06-09).** *Was:* "v2 irrelevant (no money); proration deferred to v3." *Now:* with real Razorpay shipping in v2, we adopt the **Jira / Atlassian model — Maximum Quantity Billing**: bill = `price × peak active seats during the cycle`; mid-cycle **adds prorate** for the remaining days, **removals get no credit**. Seat count is derived live; `subscriptions.peak_seats` tracks the cycle high-water mark. See `guide-billing.md`.

**Payment provider abstraction locked:**
- **`BillingProvider` interface** with pluggable implementations.
- v2 ships **`NoOpBillingProvider`** (writes to DB, no real billing).
- v3 swap target: **`RazorpayBillingProvider`** (India + INR + UPI + GST). `StripeBillingProvider` documented as alternative.
- Interface methods: `createCustomer`, `createSubscription`, `updateSeatCount`, `cancelSubscription`, `handleWebhook`.
- Codified in `dev-standards.md` design-patterns section and `v2-plans.md` Architecture Notes.

**Internal admin panel — moved to v3** (late-session scope adjustment):
- Initially locked as v2 scope alongside Q10/Q11 with TOTP 2FA and a 3-screen layout. Re-evaluated at end of session.
- For v2 customer base (internal team + a few initial orgs), direct DB queries + `support@…` shared inbox handle support volume. Building the panel now is premature.
- **Move trigger:** v3, when card-on-file lands and real CS volume materializes.
- Full spec preserved in `upgrades.md` under "Internal Admin Panel (v3)".

**Owner-leaves policy (companion lock):**
- Last owner cannot leave without ownership transfer.
- Owner transfer = explicit action; current owner picks new owner from existing members.
- Stuck cases (fired/ghosted): `internal_admin` force-reassigns.
- Billing contact defaults to `owner.email`; overridable via `subscriptions.billing_email`.

**Discussion notes:**
- "Indefinite read-only" is unusual — most SaaS does X days read-only then full lock. v2 punts the "what happens after Y months" question to Q14 because retention policy interacts with GDPR + storage cost + data-deletion semantics, none of which are urgent for v2.
- Access state is **org-level, not per-user.** A new member added mid-cycle does not have different access from existing members. Expiry puts the **whole org** read-only.
- Why proration is the v3 recommendation: native to Razorpay/Stripe (no math to write), fairer to customers, avoids "add 10 people on the 29th" gaming. Final v3 call deferred — it's a provider-config choice, not a schema choice.
- Why Razorpay over Stripe for India: ~2% fees vs ~3%, native UPI/netbanking, GST invoicing built-in, no Stripe India merchant onboarding restrictions. Locked as the *likely* v3 choice; final lock deferred to v3.
- Why no SMS pre-expiry warnings: cost + the only SMS surface we use is Cognito SMS MFA; adding billing SMS would mean a second SMS path. Email is sufficient.
- Why TOTP-only for internal admin 2FA: SIM-swap risk on SMS, per-message cost, internal users will install authenticator app (low friction for internal use).
- Full session details + schema reference in `devlog/convo-033-v2-decisions-q10-q11-billing.md`.

---

## 12. Service layer decomposition

**Why it matters:** Decides how cleanly future features (billing, audit logs, federation) plug in — and how painful a future microservice split would be.

**Options considered:**
- **A. Top-level `backend/services/` folder** holding `tenantService.ts`, `authService.ts`, `billingService.ts` — cross-cutting concerns in one place.
- **B. Each service lives inside its owning module** (`modules/auth/auth.service.ts`, `modules/orgs/orgs.service.ts`, `modules/billing/billing.service.ts`); other modules import only the `*.service.ts` file. No top-level `services/` folder.
- **C. Inline the logic in existing modules** — fastest, but tenant/billing/auth concerns get smeared across the codebase. Rejected on day one.

**Decision: B — modular monolith. Each concern is a module; the module's `*.service.ts` is its public API.**

**Layout for v2:**
```
backend/modules/
  auth/         ← existing; add auth.service.ts (CognitoAuthService impl)
  orgs/         ← NEW; owns org CRUD + membership + role lookups (this is "TenantService")
  billing/      ← NEW; owns subscriptions + seat enforcement + read-only checks
  tickets/, projects/, sprints/, ...  ← consume the above via *.service.ts only
```

**Rules locked:**

1. **Service-file-only imports across modules.** Module A imports from `modules/B/B.service.ts` only — never from `B.model.ts`, `B.controller.ts`, or `B.routes.ts`. The service file is the module's public API; everything else is internal.
2. **Service file is opt-in per module.** Only required when (a) another module consumes the logic, or (b) the controller is doing real business logic (multiple model calls, validation chains, cross-table rules). Modules like `health`, `me`, `comments`, `reports`, `search`, `backlog` keep controller → model — no service file needed today.
3. **No top-level `services/` folder.** Every service has a home module that owns its routes + tables + logic. No orphan files.
4. **Interface-first for swappable services.** `AuthService` already follows this (`dev-standards.md` §8 — `CognitoAuthService` + `JwtAuthService` + `MockAuthService`). `BillingService` follows the same pattern from day one: `BillingService` interface + `LocalBillingService` implementation. `TenantService` (= `orgs.service.ts`) can ship as a concrete class — no swap target identified yet.

**Microservice future-readiness:**
- `billing` is the natural first peel-out (own schema, payment-provider integration, background jobs). Designed for it: replace `LocalBillingService` with `HttpBillingService` implementing the same interface; controllers stay unchanged.
- `auth` is already external (Cognito); the in-repo `auth.service.ts` is already a thin client.
- `orgs` is the *worst* microservice candidate — every request needs "is user in org?", and turning that into a network call would add latency to every endpoint. Stays in-process indefinitely.

**Required reading for the v2 build:**
- Services that are consumed by other modules MUST export only via `*.service.ts`. Direct model imports across modules will be rejected at PR review.
- Codify in `dev-standards.md` (new section: "Service layer + cross-module imports").

**Discussion notes:**
- Initial proposal was a top-level `services/` folder. Revised mid-discussion when user pointed out the existing `modules/auth/` would create a split-brain ("where does auth live?"). Modular monolith resolves it cleanly — auth service stays in the auth module.
- Industry references named: Domain-Driven Design bounded contexts, NestJS module/provider system (framework-enforced version of this rule), Spring Boot `@Service` classes, Kamil Grzybek's "Modular Monolith" series, Simon Brown's C4 model.
- Rule of thumb captured: don't pre-create empty service files. Add them when consumed by another module or when the controller crosses ~20 lines of real logic.
- Full session details in `devlog/convo-036-v2-decisions-q12-service-layer.md`.

---

## 13. Migration order for adding `org_id` to existing tables

**Why it matters:** Tables have FK relationships. Adding NOT NULL to non-empty staging data needs a strategy.

**Options:**
- **A. Add column nullable → backfill → set NOT NULL** — three-step migration per table. Safe.
- **B. Drop staging data, recreate schema with `org_id` NOT NULL from the start** — only viable if Q4 = "drop and reseed".

**Tradeoffs:** B is simpler if you're wiping anyway. A is the only option for prod-style migrations.

**Decision (migration order): B — drop staging data, recreate schema with `org_id NOT NULL` from the start.** Locked because Q4 = drop and reseed.

**Decision (ID format): LOCKED — mixed (UUID for identity/billing roots, BIGSERIAL for tenant-scoped tables).** ✅

**Per-table format:**

| Table | PK | Type | Other identifier columns | Notes |
|---|---|---|---|---|
| `users` | `id` | **UUID v7** | `email` (unique), `external_auth_id VARCHAR` (unique) | **Revised by RF-16.** Originally Q13 locked `id = Cognito sub (UUID v4)`. RF-16 decoupled internal ID from external auth ID for swap-portability: `id` is now a v7 we generate (matches the orgs/subs pattern); `external_auth_id` stores the Cognito `sub` today (or whatever the active provider's user_id is). `loadUser` queries by `external_auth_id`. |
| `organizations` | `id` | **UUID v7** | `slug VARCHAR(63)` unique | UUID v7 generated app-side (see below). Slug is the URL handle (e.g. `acme` → `/orgs/acme/...`). |
| `subscriptions` | `id` | **UUID v7** | — | One row per org (`org_id` UNIQUE). v7 app-side. |
| `user_orgs` | **composite PK** `(user_id, org_id)` | both UUID | `role` enum | No surrogate `id` — composite is the natural fit. |
| `projects` | `id` | **BIGSERIAL** | `key VARCHAR(10)`, unique per org | `UNIQUE (org_id, key)` — was global in v1, now scoped. |
| `sprints` | `id` | **BIGSERIAL** | — | |
| `tickets` | `id` | **BIGSERIAL** | `key VARCHAR(20)`, unique per project | `UNIQUE (project_id, key)` — sufficient because `project_id` already encodes the org; adding `org_id` to the constraint would be redundant. |
| `comments` | `id` | **BIGSERIAL** | — | |
| `project_members` | **composite PK** `(project_id, user_id)` | int + UUID | `role` enum | Drop v1's surrogate `id` — never used in queries. |
| `ticket_status_history` | `id` | **BIGSERIAL** | — | Internal audit only. |

**UUID v7 generation — app-side, not DB extension:**

UUID v7 (time-ordered) is preferred over v4 for tables we control because it inserts cluster better in B-tree indexes. Postgres 16 (current) doesn't have native `uuidv7()` — that's PG 18+. Options were:
- **DB extension (`pg_uuidv7`)** — works on RDS PG 16+, but requires `CREATE EXTENSION` per DB, parameter-group changes on RDS, and remembering to enable it on every new env. Real infra burden.
- **App-side generation via `uuidv7` npm package** — generate UUID in the service before INSERT, pass as parameterized arg. Zero DB dependency, works across any Postgres version, identical storage and performance, trivial to mock in tests.

**Decision: app-side, npm `uuidv7` package**, pinned to an exact version, imported only in `orgs.service.ts` and `billing.service.ts`. Unit test asserts generated IDs are valid v7. Authored by LiosK (UUID v7 RFC co-author), ~250k weekly downloads, zero dependencies, frozen spec — low maintenance risk.

**BIGINT handling in Node (`pg` driver):**

`BIGSERIAL` is 8-byte; JavaScript `Number` is safe to `2^53 - 1`. The `pg` driver returns BIGINT as a string by default to avoid silent precision loss. Override at startup:

```ts
// backend/db/pool.ts
import pg from 'pg';
pg.types.setTypeParser(20, (val) => parseInt(val, 10));  // OID 20 = BIGINT → number
```

**Decision: cast to JS `number`.** Risk is theoretical (would require ~10^15 rows in one table); convenience is real (controllers, URLs, React keys, sorting all treat IDs as numbers consistently). Standard practice across Postgres + Node shops.

**Companion uniqueness changes from v1:**
- `projects.key` was `UNIQUE (key)` globally → becomes `UNIQUE (org_id, key)`. Two orgs can both have a `"PROJ"`.
- `tickets.key` stays `UNIQUE (project_id, key)` (same as v1). Two orgs both having `"PROJ-1"` is fine because each ticket's `project_id` differs.

**Discussion notes:**
- User proposed composite `acme-{uuid}` for org IDs. Rejected: PKs must be opaque and stable; if "acme" rebrands or sells, the ID shouldn't change. Industry pattern (Linear, Notion, Slack, GitHub orgs, Stripe) = opaque UUID PK + separate mutable `slug` column. One column, one job.
- BIGSERIAL leaks count info ("we have 47 orgs") and enables URL enumeration. Acceptable for tenant-scoped tables (`projects`, `tickets`, etc.) because they're never exposed cross-org and middleware enforces `org_id` on every query (Q3). Not acceptable for `organizations.id` itself, which is why orgs get UUID.
- UUID v7 app-side approach revisits naturally when we upgrade to Postgres 18 — at that point switch to native `gen_uuidv7()` if desired, but no rush. App-side keeps working forever.
- **Revised by RF-16 (May 2026):** the original `users.id = Cognito sub (UUID v4)` decision was reversed. RF-16 added `users.external_auth_id` as a separate column for the provider sub, and `users.id` became a UUID v7 we generate (matching the orgs/subs pattern). Reason: the original coupling would have made any future Cognito swap a months-long FK rewrite. See RF-16 for the full decouple shape + touch-point migration map.
- Full session details in `devlog/convo-037-v2-decisions-q13-id-format.md` (original lock) and `devlog/convo-048-v2-rapid-fire-rf16.md` (RF-16 revision).

---

## 14. Org deletion — hard delete or soft + retention?

**Why it matters:** Decides what happens to canceled / expired orgs over time. Affects storage cost, GDPR compliance, customer "we want to come back" UX, and slug reclamation.

**Options:**
- **A. Hard delete on cancel** — immediate cascade-delete of everything keyed by `org_id`.
- **B. Soft delete + retention period** — status flag, keep data, eventually hard-delete after a window.
- **C. Indefinite retention** — never auto-delete; manual cleanup only.

**Tradeoffs:** A is GDPR-friendly but kills "let me come back next quarter" UX. B is the industry norm (90–180 days typical). C avoids data-loss risk but accumulates storage cost forever.

**Decision: C in v2 → B in v3.** ✅

- **v2:** indefinite retention. Canceled / expired orgs sit in `read_only` forever. No auto-deletion. Acceptable because v2 customer base is small (internal + initial customers) — storage cost is negligible.
- **v3:** 1-year retention from cancellation / expiry → then hard delete (cascade everything keyed by `org_id`).

**Companion locks under Q14:**

- **Slug locked during retention.** Org "acme" cancels → enters retention → slug `acme` remains taken. Another customer trying to create "acme" sees "name taken — try another." Slug becomes available only after the 1-year hard delete fires. Protects the original customer's URLs / links / shared paths.
- **Reactivation window = retention window.** Within the 1-year retention, **any user who was an admin or owner at the time of cancellation** can reactivate. `internal_admin` can override (e.g. owner email changed, no admin available). Same org row, same data, same slug — just status flips back to `active` after payment.
- **Pre-deletion warnings.** Emails at T-30d, T-7d, T-1d before the hard delete fires. To owner + `billing_email`. Format: "Your canceled org Acme will be permanently deleted on [date]. Reactivate now to keep your data."
- **Self-serve hard delete always available** — settings page button, **gated behind 2FA confirmation**. Cascade-deletes immediately, no retention period applied. Satisfies **GDPR right to be forgotten** (immediate deletion on request, overrides the 1-year retention). Also the "start from scratch" path for users who want to fully wipe and re-create.

**Backup posture (locked alongside Q14):**

- Backups handled **at the infrastructure layer**, not the application layer. No app-level backup feature in v2.
- **v2 (EC2 + Docker Postgres):** EBS volume snapshots cover the Postgres volume. Already part of the hosting plan.
- **Post-Q8 (RDS migration at staging cutover):** RDS automated snapshots replace EBS for the DB — daily snapshots + point-in-time recovery up to 35 days. Toggle on at RDS provisioning. No engineering work.
- **Restore from backup:** engineering operation, used for incidents or accidental destruction. Not a user-facing feature.
- **User-facing data portability:** export already planned in `v2-plans.md` Phase E (org-scoped data download). Import (org admin uploads JSON to populate a new org) and user-facing restore ("recycle bin" within an active org) → v3+, parked in `upgrades.md`.

**Deferred to v3+ / parked in `upgrades.md`:**

- Org name reclamation / "domain auction" UX (v4–v5+) — for the rare case where a hard-deleted org's name has business value and a different party wants to claim it. Not blocking v3.
- User-facing restore ("recycle bin" for deleted tasks / sprints within an active org) — separate from org-level retention.
- Org-level data import — counterpart to export; v3+.

**Discussion notes:**
- 1 year is generous vs industry norms (typical SaaS = 90–180 days). Justified by B2B customer-acquisition cost — generous return window for canceled customers.
- "Same email + same org" reactivation is brittle if the owner's email changes between cancel and reactivation. Hence the broader rule: any admin/owner at time of cancellation, with `internal_admin` override.
- GDPR right-to-be-forgotten satisfied via the self-serve 2FA-gated hard delete. Required for EU jurisdiction compliance.
- Slug collision UX is intentionally "name already taken — try another or contact support." Customer support handles disputes. Future "domain auction" mechanism is the longer-term resolution for high-value name collisions.
- Backup vs export got mixed up mid-conversation: backup = infra-level data protection (EBS / RDS snapshots, restored by engineering); export = user-facing portability (org admin downloads JSON / CSV). Different features at different layers. Backup is already in the hosting plan; export is in Phase E.
- Full session details in `devlog/convo-034-v2-decisions-q14-retention.md`.

---

## 15. Last admin leaves — what happens?

**Why it matters:** Org without an admin can't manage members or billing. Easy to overlook.

**Options:**
- **A. Block last admin from leaving** — UI/API rejects "leave org" if you're the only admin. Force them to promote someone else first.
- **B. Auto-promote oldest member to admin** — silent promotion. Surprise to that user.
- **C. Org enters "ownerless" state** — admin can be claimed by support intervention.

**Tradeoffs:** A is the cleanest. B is surprising. C requires support tooling that doesn't exist yet.

**Decision: A — block last admin from leaving. UI shows "contact support" message.**

**Implementation:**
- Backend `DELETE /api/v1/orgs/:id/members/me` checks: if requester is the only `admin` of this org, return 409 with reason `last_admin_cannot_leave`.
- Frontend renders modal: "You're the only admin of [Org Name]. To leave, please contact support — we'll either help you transfer ownership or delete the org."

**Discussion notes:**
- Auto-promote oldest member (option B) rejected — surprising for the auto-promoted user, no consent.
- Ownerless state (option C) rejected — requires support tooling that doesn't exist yet.
- **Possible UX enhancement (parked for future product consideration):** dual-path UI offering "promote another member, then leave" as a self-service alternative. Cleaner than support intervention but requires the promote flow to be accessible from the leave-confirmation modal. Not blocking for v2.

---

## 16. Index audit on `org_id`

**Why it matters:** Every tenant-scoped query filters on `org_id`. Missing indexes = full table scans at scale.

**Action:** After schema migration, audit every tenant table to confirm:
- `org_id` is indexed (single column)
- Composite indexes for common query paths (e.g. `(org_id, status)`, `(org_id, project_id)`, `(org_id, assignee_id)`)
- Existing indexes are reviewed — some may now be redundant under `org_id`-prefixed composites

**Decision: action item — audit `org_id` indexes after every tenant-table migration.**

**Required indexes per tenant table:**
- Single-column index on `org_id` (always).
- Composite indexes for common query paths — e.g. `(org_id, status)`, `(org_id, project_id)`, `(org_id, assignee_id)`, `(org_id, created_at DESC)`. Defined per table based on actual access patterns.

**Process:**
- Every migration that adds `org_id` to a tenant table includes the relevant composite indexes for that table's query patterns.
- After v2 schema lands in staging, run `EXPLAIN ANALYZE` against the slow-query log for ~1 week to identify any missed composites.
- Some pre-existing v1 indexes may become redundant under `org_id`-prefixed composites — drop them in a follow-up migration.

**Discussion notes:**
- Action item, not a strategic decision — captured here so it doesn't get lost when migration work begins.
- Performance-critical: every tenant-scoped query filters on `org_id`. Missing indexes = full table scans at scale, the kind of thing that's invisible until 10x growth.

---

## Edge-case decisions (post-Q16 rapid-fire round)

These were raised by the team after the original Q1–Q16 strategic round and locked in dedicated rapid-fire discussions. Same format as Q1–Q16. Short-answer summaries live in `v2-plans.md` appendix **A3** for team sharing; full reasoning + tradeoffs + discussion notes are below.

---

## RF-1. Multi-device and multi-tab session sync

**Why it matters:** Decides whether session state (logout, org switch, role change) propagates between concurrent contexts in real time or waits for the next API call to discover the change. Affects perceived UX, security latency, and how much push-channel infrastructure v2 needs.

**Options:**
- **A. Lazy detection only (v1 default).** Each tab and device discovers state changes via its own next API call hitting a 401/403. No active sync. Zero code.
- **B. Same-browser tab sync via `storage` event.** Listen to `storage` event on Amplify's localStorage auth keys; when one tab logs out / switches org, others detect and react immediately. ~10 lines of frontend code. Same-browser only.
- **C. Same-browser tab sync via `BroadcastChannel`.** Richer pub/sub between same-origin tabs. Same scope as B but supports custom event types beyond auth-state-change.
- **D. Cross-device active push via WebSocket / SSE.** Server pushes session events to every connected device. Needs persistent-connection infrastructure (gateway, scaling, auth on the socket, reconnect logic). Substantial project.

**Tradeoffs:** A is free but leaves stale UI for minutes between API calls. B is ~free (event already fires on Amplify's localStorage writes) and covers the common case (one person, multiple tabs). C is overkill for v2 — same effective coverage as B with more code. D is the only true cross-device sync but is heavyweight infrastructure unjustified at v2 scale.

**Decision: B for same-browser; A for cross-device.** ✅

- **Same browser, multiple tabs:** `storage` event listener on Amplify's auth keys. Logout / org-switch / role-change in one tab triggers cleanup + redirect in all other tabs immediately.
- **Cross-device (web ↔ mobile, web ↔ different browser):** lazy detection. Each device discovers the change on its next API call via the existing 401/403 interceptor.
- **Mobile vs web tokens are fully separate** — each device authenticates independently with Cognito; logout on web does not affect mobile session (and vice versa) in v2.

**Companion locks under RF-1:**
- D (WebSocket/SSE active push) deferred to v3, paired with an "Active sessions" UI that lists logged-in devices and supports force-logout per device. Cognito's `AdminListUserAuthEvents` + per-session revocation / `AdminUserGlobalSignOut` provides the data model. Already parked in `upgrades.md` → "Active sessions UI."
- C (BroadcastChannel) is the parked alternative implementation if we ever outgrow `storage` event signal granularity. Already in `upgrades.md` → "Cross-tab session sync: BroadcastChannel (instead of `storage` event)."

**Discussion notes:**
- v1 already does the right thing for token expiry (caught in convo-009): axios 401 interceptor + `/me` mount check. v1 does NOT have tab sync — grep for `BroadcastChannel`, `storage` event listeners, `visibilitychange` returns zero. v2 adds the storage event listener; that's the delta.
- Mobile-specific auth UX (token storage, biometric prompts, refresh handling differences) is out of scope for v2 — locked policy: mobile is its own independent session with lazy detection. Revisit when mobile actually enters scope.
- Industry pattern: same-browser tab sync via `storage` event or `BroadcastChannel` is the standard for B2B SaaS (Linear, Notion, Stripe Dashboard). Cross-device active sync via WebSocket is a "scale features" tier — Slack, Discord have it because real-time collaboration is the product. For a tool like Rai (project management), lazy cross-device is industry-standard and acceptable.
- Full session details in `devlog/` (this session's rapid-fire convo).

---

## RF-2. Cognito API rate limits and retry/backoff strategy

**Why it matters:** Cognito's admin write APIs have soft rate limits per pool (default 25/sec for `AdminUpdateUserAttributes`). Single-pool design (Q9) means all orgs share that quota. Without retry logic, a momentary throttle returns errors directly to users. Decides how the backend handles transient throttling without bleeding into user-facing failures, and what scaling lever we pull when we outgrow the default.

**Options:**
- **A. No retry — bubble errors directly.** Simplest. Any `TooManyRequestsException` returns 503 to the user immediately. Fragile but trivial.
- **B. Exponential backoff with jitter, retry on throttle errors only.** Wrap Cognito write SDK calls in a helper that retries up to 3 times (100ms → 300ms → 1s, ±20% jitter) only on `TooManyRequestsException` / `ThrottlingException`. Normal calls have zero overhead.
- **C. Backoff + multi-region pool sharding.** B plus splitting users across regional Cognito pools to multiply the per-pool quota. Substantial infrastructure (cross-pool identity sync, regional signup routing, pool-resolver layer).
- **D. Backoff + AWS Service Quota increase.** B plus filing an AWS support ticket to raise the per-pool limit (25/sec → 250/sec or higher, free, 1–2 business days). No code change beyond B.

**Tradeoffs:** A is fragile and will throw 503s on transient blips even at low scale. B is the minimum-viable correct answer. C is genuine geo-scale architecture but pays cost we don't need at v2. D pulls the lever AWS actually expects production workloads to use — the 25/sec default is intentionally conservative.

**Decision: B + D.** ✅

1. **Backend retry helper** — `withCognitoBackoff(fn)` wraps every Cognito write SDK call.
   - Triggers **only** on `TooManyRequestsException` / `ThrottlingException`. Other errors bubble immediately. **Zero overhead on normal calls.**
   - Exponential backoff with jitter: 100ms → 300ms → 1s, ±20% random jitter.
   - Max 3 retries. After exhausted, return HTTP **503 with "try again in a moment."**
   - Lives in `backend/modules/auth/auth.service.ts` (or a shared util if reused).
2. **Frontend debounce on org switcher** — disable the switcher button ~500ms after click. ~5 lines.
3. **Log throttle errors.** If observed at any meaningful rate, file an AWS Service Quotas ticket to raise the per-pool limit. Standard production practice.

**Companion locks under RF-2:**
- **C (multi-region pools) deferred to v3.** Parked in `upgrades.md` → "Multi-region Cognito user pools." Trigger to revisit: customer base spans multiple continents at meaningful volume, or per-pool quota becomes a hard ceiling even after Service Quotas increases.
- **Refresh storm handling deferred to v3.** Cognito's per-pool refresh quota is high (thousands/sec) — v2 scale won't reach it. Parked in `upgrades.md` → "Token refresh storm handling."

**Discussion notes:**
- A Cognito user pool is region-locked. The 25/sec limit is per pool, not "per region within a pool" — there's no internal regional subdivision. To distribute load across regions you need multiple pools (option C), which is a v3+ project.
- Identity is pool-scoped: same email in two pools = two different `sub` UUIDs. Multi-region therefore requires custom cross-pool sync infrastructure. Not a config flag.
- AWS Service Quota increases are a *ticket* — free, 1–2 business days, routinely granted for production workloads. This is the actual mechanism AWS expects you to use when you outgrow the conservative default. Single-pool + quota increase covers v2 scale comfortably.
- Industry pattern: exponential backoff + jitter is the canonical retry strategy for AWS APIs (documented in the AWS SDK docs); jitter prevents retry-thundering-herd when multiple clients hit the same throttle.
- Full session details in `devlog/` (this session's rapid-fire convo).

---

## RF-3. Auth and security audit logging

**Why it matters:** Enterprise customers eventually ask for an audit trail — who switched orgs, who changed whose role, who logged in from where. Building it as a dedicated `audit_log` table from day one is significant work (schema, write-path instrumentation across every action, retention policy, query UI). Deferring it is fine if the v2 baseline answers the actual operational need: debugging incidents and responding to support tickets.

**Options:**
- **A. Dedicated `audit_log` table in v2.** Immutable structured event log with `actor_user_id`, `org_id`, `event_type`, `target_resource`, `payload`, `created_at`, indexed for compliance queries. Retention policy (e.g. 1y / 7y). Compliance-ready from day one.
- **B. Rely on the v2 baseline (request logger + Cognito built-in events + DB timestamps) + manual support.** Standard request logger (per `dev-standards.md` §6) captures every API call including org switches and role changes; Cognito's `AdminListUserAuthEvents` tracks failed logins, MFA challenges, and sign-in IP/device for ~30 days free; DB `created_at` / `updated_at` show when rows changed. Operational issues surfaced via the support inbox and resolved manually.
- **C. Cognito Advanced Security tier** ($0.05/MAU) for adaptive auth + suspicious-activity detection. Independent of A vs B — answers a different question (proactive risk scoring) rather than retrospective audit trail.

**Tradeoffs:** A is the correct long-term answer for enterprise compliance but is real engineering effort (~1–2 weeks of careful instrumentation + retention infra) — premature at v2 scale (internal + handful of orgs, no compliance contracts signed yet). B gives operationally-sufficient observability for free with material already in place. C addresses a different vertical (suspicious-activity proactive detection); answer is independent.

**Decision: B for v2.** ✅ A is deferred to v3 as full audit infrastructure. C is parked separately and remains a one-toggle add when relevant.

**v2 baseline (what we have for free without new code):**
1. Standard request logger (`dev-standards.md` §6) — every API call logged with user, endpoint, status, timestamp. Org switches, role changes, project/ticket writes all captured as request log entries.
2. Cognito `AdminListUserAuthEvents` — auth event history per user (login attempts, failures, MFA, IP/device) retained ~30 days, accessible via Cognito console or SDK.
3. DB `created_at` / `updated_at` on key tables — shows when rows last changed (already standard per Postgres migration patterns).
4. Centralized error handler (`dev-standards.md` §2) — failures get logged, not silently swallowed.
5. Support inbox + manual DB queries for incident response. Acceptable at v2 customer base (internal team + handful of initial orgs).

**Companion locks under RF-3:**
- **A (dedicated `audit_log` table) parked in `upgrades.md`** under "Comprehensive audit logging (app-wide, not just auth)." Trigger to build: first enterprise contract with audit-log requirements, or customer base outgrows the manual-via-support model.
- **C (Cognito Advanced Security)** already parked in `upgrades.md` under "Suspicious activity detection." Independent of the audit-trail decision.

**Discussion notes:**
- User correctly framed RF-3 as "v3 work" once it was clear the operational need (debugging, support-driven incident response) is fully covered by the v2 baseline.
- The danger of building A in v2 is partial-coverage: instrumenting half the write paths gives a false sense of audit completeness. Either build it everywhere with rigor (v3 project) or build none of it and rely on the baseline (v2). No middle path.
- For internal customers, manual DB queries + the support inbox is the actual incident-response flow; a structured audit log adds zero value over `SELECT * FROM tickets WHERE updated_at > … ORDER BY updated_at`.
- Industry pattern: B2B SaaS startups typically defer dedicated audit logging until a customer contract explicitly requires it. Stripe, Linear, Notion all shipped without it in their early years.
- Full session details in `devlog/` (this session's rapid-fire convo).

---

## RF-4. No-org post-signup UX

**Why it matters:** A user can land in the app with zero org memberships in three situations — (a) brand-new signup, no invite, (b) existing user who left or got removed from their last org, (c) existing user whose only org got hard-deleted. The screen they see in this state determines whether they're guided forward or get stuck. Decides the empty-state UX, what affordances exist (create vs join), and what's deliberately excluded (browse-and-request-to-join).

**Options:**
- **A. Forced create-org wizard.** New users immediately see a "create your org" form with no option to wait for an invite. Friction for users who actually just need to wait for their team's invite to arrive.
- **B. Empty-state screen with two paths — "Create organization" or "Wait for invite."** User chooses. No browse / discover affordance.
- **C. Empty-state plus a public org directory** (browse / request-to-join). Open-signup B2B SaaS pattern (Discord-style).

**Tradeoffs:** A is hostile to invited users who hit "verify email" before their invite link arrives. C is a spam and abuse vector at our scale (anyone signing up could DM/spam every org owner with join requests) and adds significant UX surface (search, listing, request workflow, owner approval inbox). B is the standard B2B SaaS pattern (Linear, Notion, Slack) — invite-only or self-create, no public discovery.

**Decision: B — empty-state screen with two paths.** ✅ Same screen serves new users post-signup AND existing users who lost their last membership.

**Consolidated flow (the locked sequence):**

1. **Signup** — Cognito creates user with `email_verified: false`. Cognito sends verification email automatically.
2. **Email verification** — user clicks link → `email_verified: true` on the Cognito user record. Per Q7, sign-in is blocked until this fires.
3. **First sign-in** — backend `loadUser` middleware checks `user_orgs` count for the resolved user. Zero → route to empty-state screen. Non-zero → route to user's last-active org (or first-available if no `current_org_id`).
4. **Empty-state screen** — exactly two CTAs:
   - **Create organization** — form (name, slug). On submit: backend creates `organizations` row, creates `user_orgs` row with `role = owner` for the current user, creates `subscriptions` row in trial state (per Q10), returns the new `org_id`. Frontend redirects to `/orgs/<slug>/dashboard`.
   - **Wait for invite** — informational affordance ("Ask your team admin to send an invite to <verified email>"). Not a button — copy + maybe a "Resend invite" instruction. Could include a one-time poll/refresh button if the team wants it.
5. **Invite arrival** — if user gets an invite email while in the empty state, clicking the link → token validated → `user_orgs` row created → redirect to that org's dashboard. Bypasses the empty state entirely; same flow as Q6 logged-in path.
6. **Returning to empty state** — if a user later leaves their last org or has their last membership removed, they land back on the same empty-state screen on next request. Same screen, same two paths.

**Companion locks under RF-4:**
- **No browse-and-request-to-join.** Joining requires either creating your own org or being invited. Closes the spam-DM-every-org-owner vector.
- **No "default org" or system-created sandbox org for new users.** Empty state is a real state; the app handles it explicitly.
- **Verified email is non-negotiable to reach the empty state.** Per Q7, sign-in is blocked pre-verification — there's no path to the empty state for an unverified account.

**Discussion notes:**
- This is largely a consolidation of pieces already locked under Q1 (line 79: "empty state if user belongs to none"), Q6 (signup-with-invite path), and Q7 (email verify before any org action). RF-4 just makes the full sequence explicit so the frontend has a single canonical flow to implement.
- The "Wait for invite" affordance is intentionally not a button or input — there's nothing to click. It's a hint pointing at how the invite flow works. A "browse orgs" or "request to join by email domain" feature is a v3+ topic and would change the spam model significantly.
- Same-screen reuse (new user + existing user with zero orgs) means one component, one route, one set of tests. No bifurcation.
- Industry pattern: Linear, Notion, Slack all use the invite-or-self-create empty state. GitHub allows public org discovery but personal accounts ≠ orgs there; for true B2B workspace tools, invite-only is the norm.
- Full session details in `devlog/` (this session's rapid-fire convo).

---

## RF-5. Many-orgs UX (org switcher scaling)

**Why it matters:** Most users will be in 1–3 orgs, but consultants, agency workers, and platform support staff can accumulate dozens. Decides what the top-right org switcher looks like at small N (most users) AND at large N (edge cases), plus what defensive limits prevent pathological cases (bot accepting thousands of invites).

**Options:**
- **A. Show all orgs in a scrollable dropdown, no pagination, no search.** Simplest. Works fine at N ≤ 10. Becomes unusable at N ≥ 30.
- **B. Paginated "Show more" + recency-ordered + search at threshold.** Show 8 most recent in the dropdown by default; "Show more" loads 8 more per click; search input appears at 20+ orgs. Recency tracked via a `last_accessed_at` column on `user_orgs`.
- **C. Full advanced UX from v2** — server-side pagination, fuzzy search backend, pinning/favorites, weighted recency, sidebar workspace switcher (Slack-style). Real engineering effort.
- **D. No hard limit on orgs per user.** Trust the invite flow to keep numbers sane. Vulnerable to invite-bombing or test/abuse accounts accumulating thousands of memberships.
- **E. Hard cap on orgs per user with env override.** Defensive limit (100 default) enforced at accept-invite and create-org paths, env-configurable so `internal_admin` can lift it for genuine power-user cases.

**Tradeoffs:** A is too thin past 10 orgs and we'd have to revisit immediately. C is over-engineering for v2 scale (internal team + handful of orgs). B is the right amount — graceful degradation as N grows, free recency ordering, search only when actually useful. D leaves a small pathology vector open (low-effort scripted invite-bombing); E closes it for free.

**Decision: B + E.** ✅ Org switcher uses paginated "Show more" + recency-ordered + search-at-threshold; per-user hard cap of 100 orgs (env-configurable).

**Concrete v2 shape:**

1. **Top-right org switcher.** Renders the **8 most recently accessed orgs** by default, sorted by `user_orgs.last_accessed_at DESC`.
2. **"Show more" button** at the bottom of the dropdown when the user has more than 8 orgs. Each click reveals 8 additional rows (16, 24, 32, …). No server round-trip — the user's full org list returns in one query at sign-in time and is cached on the frontend.
3. **Search input appears at 20+ orgs.** Renders at the top of the dropdown. Client-side filter over the full org list (no server pagination needed at v2 scale — even 100 orgs is one query).
4. **Recency tracking.** Add `user_orgs.last_accessed_at TIMESTAMPTZ` column. Updated to `NOW()` on the org-switch endpoint. One-line update. Provides "most recent first" ordering for free.
5. **Hard cap of 100 orgs per user** enforced at:
   - **Accept invite** — when a user clicks an invite link, if their current `COUNT(user_orgs WHERE user_id = $1) >= MAX_ORGS_PER_USER`, reject with "You've reached the maximum number of organizations." The inviter doesn't see this in advance; the check surfaces at acceptance time.
   - **Create org** — same check on the create-org path; user can't create a new org if at the cap.
   - **Env-configurable** via `MAX_ORGS_PER_USER` (default 100). `internal_admin` can lift it via env update + service restart for legitimate edge cases.

**Companion locks under RF-5:**
- **Server-side pagination, fuzzy-match backend, pinning/favorites, weighted recency, sidebar workspace switcher** all deferred to v3+. None are warranted at v2 scale.
- **Recency tracking is a real DB column, not just a cookie/localStorage value.** Persists across devices — the user's "most recent orgs" stays consistent on every device they log in from.

**Discussion notes:**
- The 8-per-batch figure is a UI tweak, not a load-bearing decision. Could be 10. Picked 8 because a typical dropdown menu fits ~8 rows without scrolling. Adjust during build if it looks wrong.
- The 20-orgs search threshold is similar — could be 15 or 25. The principle is "search appears when the user can no longer eyeball the list," and 20 is a clean number.
- 100-org cap is genuinely high for v2 scale; the actual user base will never reach it. The cap exists to prevent scripted/automated invite-bombing and to bound the size of the user's org-list query response (worst case: 100 rows × a few hundred bytes per row = trivial).
- Industry pattern: most B2B SaaS (Linear, Notion, Slack workspace switcher) shows a simple scrollable list without explicit pagination — but those tools assume most users are in <10 workspaces. The "Show more" + search pattern is closer to GitHub's org switcher.
- Full session details in `devlog/` (this session's rapid-fire convo).

---

## RF-6. Rapid org-switch race conditions

**Why it matters:** Org switch is a multi-step flow — backend `AdminUpdateUserAttributes` on Cognito + frontend `Auth.currentSession()` token refresh + dashboard refetch keyed to the new org. If two switches overlap (user clicks Acme, then clicks Globex before Acme's flow finishes), the steps can interleave in ways that leave Cognito, the in-storage token, the UI, and React Query's cache pointing at different orgs. RF-2 already added a 500ms debounce on the switcher button to absorb fast-double-click, but debounce alone doesn't prevent two switches being in flight at once when the user spaces clicks just past 500ms on a slow network. Decides what additional guard (if any) closes the overlap window.

**Options:**
- **A. RF-2 debounce alone, accept rare races.** Cheapest. Bets that 500ms covers virtually all real-user clicks. Loses on slow networks where one switch takes 2–3 seconds; second click well after the debounce window can still overlap an in-flight first switch.
- **B. Frontend full-disable until in-flight switch resolves + `AbortController` safety net.** Switcher button greyed out and non-interactive from click until the entire flow (Cognito write → token refresh → dashboard refetch) settles. If anything ever bypasses the disabled state, `AbortController` cancels the previous switch request before firing the new one. ~15–20 lines, frontend-only, no backend changes.
- **C. Backend per-user serialization lock (Redis or DB advisory lock on `user_id`).** Switch endpoint takes a per-user lock at request entry; second concurrent request blocks until first completes (or fast-fails with 409). Defends against any client — browser, SDK, CLI, automation. Adds infra dependency (Redis) and ~50 lines of lock-acquire/release code with deadlock-safety considerations.
- **D. Backend last-write-wins with monotonic version stamp.** Each switch request includes a client-generated timestamp; backend ignores writes older than the most recent it has seen for that user. Doesn't prevent overlapping work, just discards stale results.

**Tradeoffs:** A leaves a real (if narrow) race window open — failure modes are UX-visible (wrong-org data flash, dropdown showing wrong "most recent," other tabs flickering) rather than security issues, since Q3 middleware re-validates membership every request. C is the strongest guarantee but overkill for v2 — the only client that exists is our own React frontend, and the lock infrastructure becomes another moving part to operate. D adds backend complexity without actually fixing the user-visible flicker problems. B closes the race for every client we actually have in v2, costs almost nothing, and the upgrade path to C is clean if non-browser clients ever appear.

**Decision: B.** ✅ Frontend full-disable + `AbortController`. Switcher button is greyed out and non-clickable for the full duration of an in-flight switch. RF-2's 500ms debounce stays as the fast-double-click guard layered underneath.

**Concrete v2 shape:**

1. **`isSwitching` state in the org switcher component.** Set `true` the moment the user clicks an org. Cleared to `false` only after all three legs land: backend `POST /api/v1/auth/switch-org` returns, `Auth.currentSession()` resolves with the refreshed token, and the dashboard's React Query refetch for the new org completes (or errors out — in either case the user gets feedback).
2. **Greyed-out, non-interactive switcher while `isSwitching` is true.** Visual cue (dimmed dropdown + small spinner inline on the switcher) so the user understands the click registered and a switch is happening. No clicks accepted on any org row, not even the currently-active one.
3. **`AbortController` safety net.** Every switch fires under a fresh `AbortController`. If a new switch is somehow initiated before the previous one resolves (e.g. a programmatic trigger, browser extension, or future code that forgets to honor `isSwitching`), the previous controller's `abort()` is called — its fetch, its `Auth.currentSession()`, and its refetch all bail.
4. **Failure path:** if the switch endpoint or token refresh fails, `isSwitching` clears, switcher re-enables, and a toast surfaces the error. User can retry. No partial state — UI stays on the previous org until a full successful flow lands.
5. **Cross-cuts with RF-2:** debounce stays. The 500ms button-debounce handles fast-double-click on the same row (e.g. double-clicking "Acme"); the full-disable handles the longer overlap window where the user moves on to a different row before the first switch lands.

**Companion locks under RF-6:**
- **Q3 middleware re-validates `user_orgs(user_id, current_org_id)` every request** — this is what guarantees no race can ever serve cross-tenant data. RF-6 is purely about UX coherence (UI labelled Globex showing Acme data for a second), not security.
- **All React Query keys include `orgId` as the first cache-key segment.** Standardized so a stale in-flight refetch from before the switch can't pollute the new org's view. Codified in `dev-standards.md`'s React Query conventions section.
- **Backend serialization lock (Redis or DB advisory)** parked in `upgrades.md`. Revisit trigger: first non-browser client (mobile SDK, CLI, third-party API consumer) ships, OR if telemetry ever shows real-user races slipping past the frontend guard.

**Discussion notes:**
- The five concrete failure modes that motivate the disable (presented to user in scenario form):
  1. **Cognito attribute lands on the wrong org.** Acme write slow, Globex write fast — Globex completes first, Acme completes second, Cognito ends up = Acme even though user wanted Globex.
  2. **Token-in-storage and UI display diverge.** Two parallel `Auth.currentSession()` refreshes, last writer to localStorage wins. UI says Globex, token says Acme, next API call returns Acme's data.
  3. **Dashboard data flash.** Acme's in-flight queries return after the switch; without org-keyed query keys, the new Globex dashboard briefly renders Acme's rows.
  4. **`last_accessed_at` ordering glitch.** Two `UPDATE user_orgs` land out of order; dropdown shows Acme on top for a moment even after switching to Globex. Cosmetic.
  5. **Other tabs flicker.** `storage` event from RF-1 fires per transition; second tab catches the mid-race sequence and visibly flips Acme → Globex → Acme → Globex.
- No security issue from any of these. Q3 middleware enforces membership server-side every request — worst-case the user sees data they're already authorized to see in another org of theirs, briefly, with the wrong header label.
- Considered backend Redis lock — rejected as overkill. Only justified when a client we don't control could bypass the frontend guard. v2 has no such client.
- Considered "last-write-wins with version stamp" — doesn't actually solve the flash problems, only deduplicates Cognito writes. Not worth the complexity for v2.
- Industry pattern: most B2B switchers (Slack workspace, Linear, Notion) take the same approach — disable interaction during the transition, let it resolve. Race-condition defenses past that are vanishingly rare in real apps.
- React Query `orgId`-prefixed key rule from this lock is codified in `dev-standards.md` §3 Frontend Standards.
- Full session details in `devlog/convo-039-v2-rapid-fire-rf6.md`.

---

## RF-7. SSO providers → user_orgs mapping

**Why it matters:** Decides how federated identities (Google, Microsoft, GitHub, SAML/OIDC) flow into Rai's user model, whether SSO grants any implicit org membership, whether SSO users skip our email-verification gate (Q7), and how to handle the everyday case where the same email is reachable via both password and SSO. Gets the auth surface right before we wire the providers in.

**Options for identity mapping:**
- **A. Email is the identity, single `users` row regardless of auth method.** Cognito's "Trust provider for email" auto-links a federated sign-in to an existing native user when emails match AND both are verified. One `users.id` per email; same `user_orgs` rows regardless of which method authenticated. Industry default — Notion, Linear, Slack, Vercel, Figma all use this shape.
- **B. Provider-scoped identities (Cognito default if Trust setting is off).** A Google sign-in for `alice@example.com` produces a different `sub` than the password account at the same email. Two `users` rows. Forces the user to pick one method per email and remember which one. User-hostile.
- **C. Manual link-on-conflict flow.** First SSO sign-in for an existing-email user prompts "this email already has an account, sign in with password to confirm linking." Extra friction, but avoids any auto-link logic. Standard fallback when verification can't be trusted (we *can* trust it — Q7 ensures both sides are verified).

**Options for org membership grant:**
- **D. SSO authenticates only — never grants org membership.** Membership stays gated by Q6's invite flow and RF-4's empty-state self-create. SSO sign-in for a user with zero memberships lands them on the empty-state screen exactly like a fresh password user.
- **E. Domain-based auto-org-join.** `@acme.com` SSO sign-ins auto-join the Acme org if it exists. Requires per-org domain claims, admin verification of domain ownership, and a "trust @acme.com" toggle in org settings.
- **F. SAML/OIDC per-org federation.** Each enterprise org runs its own IdP; users authenticate against the customer's IdP and land in their org. Standard enterprise SSO pattern (Okta, Azure AD, OneLogin). Substantial infrastructure — per-org IdP config, SAML/OIDC handshake handling, domain-ownership verification.

**Options for v2 provider list:**
- **G. Google + Microsoft only in v2; GitHub + SAML + OIDC in v3.** Matches existing lock in `upgrades.md`. Covers ~95% of B2B sign-ins between Google Workspace and Microsoft 365.
- **H. Google + Microsoft + GitHub in v2; SAML + OIDC in v3.** Pulls GitHub forward. Three providers ≈ a half-day of work total at ~3–4 hours per provider per Cognito + Amplify.

**Tradeoffs:** A is the only sane choice for v2 — B confuses users with duplicate accounts, C adds friction we don't need given Q7 already enforces verification on both sides. D matches the rest of the v2 model (invites are the only path to org access); E and F are enterprise features that aren't warranted at v2 scale. G keeps the v2 surface tight at two providers; H pulls in GitHub but adds another ~3–4 hours of work, and GitHub's audience (developer-tool users) is a smaller slice of our target than Google/Microsoft.

**Decision: A + D + G.** ✅ Email is the identity, auto-link on verified-email match, no implicit org grant from SSO, v2 providers = Google + Microsoft, GitHub deferred to v3.

**Concrete v2 shape:**

1. **Cognito user-pool setting: "Trust provider for email" → ON.** When a federated sign-in (Google, Microsoft) returns a verified email that matches an existing native user, Cognito auto-links the federated identity to the existing `sub`. Single `users.id` per email across all auth methods.
2. **Google + Microsoft enabled as Cognito federated IdPs.** ~3–4 hours each: configure the IdP in the pool (OAuth client ID/secret from Google Cloud Console / Azure AD), add the provider button on the login UI via Amplify's `Auth.federatedSignIn()`. No custom auth-flow code.
3. **No email verification step for SSO users.** Google/Microsoft return `email_verified=true` in their ID token claims, Cognito carries that through, our backend's Q7 gate (`email_verified` claim must be true before any org action) passes immediately. SSO users go straight from sign-in to the empty-state screen (if zero orgs) or their last-active org dashboard.
4. **SSO users can set a password later via Settings.** A "Set a password to enable password sign-in" option in `/settings/security` calls `AdminSetUserPassword`. After that, both methods work for the same account. No UI prompt to set one — it's discoverable but not pushed.
5. **Invites still gate org membership.** Q6's flow unchanged: invite link or self-create org are the only paths to `user_orgs` rows. SSO sign-in by itself never adds an org.
6. **No domain-based auto-org-join.** `dip@acme.com` and `dip@gmail.com` are two different users with no implicit relationship to any "Acme" org. v2 has no `@acme.com → Acme org` plumbing.
7. **GitHub deferred to v3** alongside SAML/OIDC. Cognito supports all three as identity providers; same toggle pattern, same ~3–4 hours each. Deferred for scope, not capability.

**Companion locks under RF-7:**
- **Shadow-account hijack is closed by Q7.** The "Trust provider for email" setting only auto-links when *both* the native account and the federated email are verified. An attacker registering an unverified `victim@gmail.com` ahead of the real victim cannot claim the victim's Google identity — the unverified native account never matches.
- **Account-deletion safety unchanged.** Q14's hard-delete flow removes the user from Cognito (which severs federated links automatically) along with `users` + `user_orgs` rows.
- **Domain → org binding** parked in `upgrades.md` as a new entry (was implicit before; now explicit).
- **SAML / OIDC per-org federation** stays parked. Move trigger unchanged: first enterprise customer with SSO mandate.
- **GitHub SSO** moved from "parked indefinitely" → "v3 scope" in `upgrades.md`. Same Cognito-toggle implementation as Google/Microsoft.

**Discussion notes:**
- User recalled the prior SSO discussion ("you said it's the same as our password/username") — correct: SSO and password share the same `users` table, the same `user_orgs` join, and the same invite flow. Only the front door differs.
- User asked: "can a user signed up via password later sign in with Google on the same email, and vice versa?" — yes, this is Option A, native Cognito behavior with the Trust setting on. No custom code.
- User asked: "how do other companies handle email collision between password and SSO?" — three patterns: (1) auto-link on verified-email match (Notion, Linear, Slack — Option A), (2) provider-scoped identities (legacy SAP-style auth, terrible UX — Option B), (3) manual link-on-conflict prompt (some banks, GitHub — Option C). A wins on UX and is what mature SaaS converges on.
- User initially wanted Google + Microsoft + GitHub in v2; revised to Google + Microsoft in v2, GitHub in v3 to keep v2 scope tight. The GitHub-in-v3 reposition is captured in `upgrades.md` (moved from "still parked" → explicit v3 target).
- Considered linking the "Set a password" flow into a forced onboarding step for SSO users — rejected. SSO-only users who never want password access shouldn't be nagged. Discoverable in Settings is enough.
- Industry pattern: every major B2B SaaS uses email-as-identity with auto-link. Slack, Linear, Notion, Vercel, Figma, Asana, Monday. The few that don't (some banks, some HR platforms) have regulatory reasons we don't share.
- Full session details in `devlog/convo-040-v2-rapid-fire-rf7.md`.

---

## RF-8. DB ↔ Cognito sync failure reconciliation

**Why it matters:** Several v2 flows write to both Cognito and Postgres in the same logical operation (signup, org switch, email change, account delete). Postgres transactions don't extend across Cognito's REST API, and Cognito doesn't support 2-phase commit. Without a strategy, either side failing leaves the other inconsistent — orphaned Cognito users, orphaned DB rows, JWTs that point at deleted orgs. Decides the universal pattern for keeping the two systems consistent without introducing a worker/queue/saga framework.

**Options for the cross-system write strategy:**
- **A. Saga with compensating actions.** Try op1, try op2. If op2 fails, run a compensating action to undo op1. Full pattern adds rollback code per flow plus a recursive failure question ("what if the compensation also fails?"). Industry-standard but heavyweight for our scale.
- **B. Outbox pattern.** Op1 + an "outbox" row in the same DB transaction. A background worker drains the outbox to Cognito with retries. Bulletproof eventual consistency. Requires a worker process and queue infra (Redis/SQS/RabbitMQ).
- **C. Bounded retry then fail.** Do the two ops in a safe order with retries on each. If either fails after retries, abort and return an error. No rollback code, no half-state, user retries the whole action. Pragmatic.
- **D. Bounded retry then fail + best-effort compensation.** Like C, but if op2 fails after retries, attempt a single bounded revert of op1. If the revert succeeds, both sides clean, user retries. If the revert also fails (very rare), structured log + alert + manual cleanup. About 10 extra lines per flow.

**Options for write ordering:**
- **E. Cognito-first, DB-second.** Cognito owns identity and authentication state. DB rows are mirrors/extensions. Writing Cognito first means the side that controls user-perceived state ("am I logged in," "what's my current org") commits first.
- **F. DB-first, Cognito-second.** Inverts the rule. Only viable for flows where DB is the authoritative source (none of our cross-system flows fit this — every cross-system write involves identity state that Cognito owns).

**Options for failure handling:**
- **G. Silent auto-heal on next read.** Middleware detects state mismatches and self-repairs (e.g., insert missing `users` row from JWT claims). Self-healing but hides bugs and ships silent partial state.
- **H. Fail loud + manual ops fix.** Middleware-detected mismatches return `500 "Account state inconsistent"` + structured log + alert. Ops fixes manually via SQL or Cognito admin call. No silent inserts.

**Options for write classification:**
- **I. Critical-vs-cosmetic split.** Mark some writes (`last_accessed_at`, telemetry) as cosmetic and fire them as background after sending the response. Cosmetic failures don't block the user but introduce a second flavor of failure to monitor.
- **J. All writes critical, no background category.** Every cross-system write runs in the critical path. Failures are visible to the user. One rule, one failure model.

**Tradeoffs:** A is the textbook answer but the recursive failure question is real overhead. B is the gold standard but parks behind an infra requirement we don't have at v2 scale. C alone leaves partial state on the Cognito side when DB fails — user has to know to retry. D is the right level for v2: small per-flow cost, near-transactional behavior for the cases that matter, manual cleanup only for the rare case where compensation itself also fails. E is forced by the architecture — Cognito owns identity. G is dangerous (hides bugs, masks signup races, silent partial state). H is harder on ops but keeps state observable. I creates a two-flavor failure model where "everything looks fine but a background write quietly failed" bugs eventually appear. J keeps the model uniform — if it failed, you know.

**Decision: C + D + E + H + J.** ✅ Cognito-first universal rule + bounded retry on both sides + best-effort compensation where viable + no silent auto-heal + all writes critical.

**Concrete v2 shape:**

1. **Cognito-first universal rule.** Every cross-system write does Cognito then DB. No exceptions across signup, org switch, email change, account delete. Reason: Cognito is the source of truth for "does this account exist, what's its identity, what claim does its JWT carry." DB rows mirror that. Mirrors are written after the source.
2. **Retry helpers in `backend/lib/retry.ts`:**
   - `withCognitoBackoff` — 100ms → 300ms → 1s with ±20% jitter, max 3 retries, retry only on `TooManyRequestsException` / `ThrottlingException`. Already locked at RF-2.
   - `withDbRetry` — same shape, retry only on transient pg errors (`08006` connection failure, `40001` serialization, `40P01` deadlock). Other errors fail-fast (constraint violations, syntax errors, etc.).
3. **Best-effort compensation when DB side fails after retries.** Per-flow compensation viability:

   | Flow | Cognito side | Compensation if DB fails | Viable? |
   |------|-------------|--------------------------|---------|
   | Signup | `signUp` | `AdminDeleteUser(sub)` | ✅ |
   | Org switch | Set `custom:current_org_id` | Set attribute back to previous value (capture before write) | ✅ |
   | Email change | Update email attribute | Set attribute back to previous value | ✅ |
   | Account delete | `AdminDeleteUser` | ❌ Destructive — can't re-create same `sub` | ❌ |
   | Member add / remove / role change | (DB-only) | N/A | N/A |

4. **Account delete path (the only flow without compensation):** Cognito `AdminDeleteUser` first; if it succeeds, DB cascade delete with retries; if DB exhausts retries, structured log + alert + manual SQL cleanup. User is already locked out at Cognito after step 1, so the "orphaned DB row" window has no security exposure — it's just cleanup work.
5. **All writes critical.** No background-write category, no fire-and-forget telemetry. `last_accessed_at` update on org switch runs in the critical path; failure (after retries + revert attempt) errors the switch and the user retries. Cost: rare "please retry" prompts. Benefit: one failure model, no silent inconsistency surface.
6. **No silent auto-heal in middleware.** If a valid Cognito JWT arrives but the expected DB state is missing (e.g., `users` row gone), middleware returns `500 "Account state inconsistent, contact support"` + structured log + alert. Ops fixes manually. No silent inserts that mask bugs.
7. **Ops alert pipeline:** pino structured logs (`event: "*_mismatch"`, `event: "*_rollback_failed"`, `severity: "critical"`) → CloudWatch on the EC2 instance → CloudWatch alarm on the marker patterns → SNS topic → email notification. One-time setup, ~1 hour, lands during v2 infra setup phase per `dev-deployment.md` § "v2 Infra Handoff."
8. **Memberships are DB-only.** `user_orgs` inserts / updates / deletes touch one system. No reconciliation logic. Middleware already re-validates `user_orgs(user_id, current_org_id)` per request (Q3), so changes are visible immediately without any Cognito write.

**Code shape (signup as the reference flow):**

```ts
async function signup(email, password) {
  const { sub } = await withCognitoBackoff(() => cognito.signUp(email, password));
  try {
    await withDbRetry(() => db.insertUser({ id: sub, email }));
    return { success: true };
  } catch (dbError) {
    try {
      await withCognitoBackoff(() => cognito.adminDeleteUser(sub));
      throw new BadRequestError("Signup failed, please try again.");
    } catch (rollbackError) {
      logger.error({ event: "signup_rollback_failed", sub, dbError, rollbackError });
      throw new InternalServerError("Signup failed, please contact support.");
    }
  }
}
```

Same shape for `switchOrg` and `changeEmail` with their flow-specific compensation. `accountDelete` skips the compensation try/catch and goes straight to log + alert on DB failure.

**Companion locks under RF-8:**
- **`backend/lib/retry.ts`** — new shared library module exporting `withCognitoBackoff` (already needed for RF-2) and `withDbRetry`. Both helpers ~30 lines each.
- **Structured log markers:** `event: "<flow>_rollback_failed"` and `event: "<flow>_mismatch"` are reserved names that the alert pipeline watches for. Land them in `dev-standards.md` §6 (logging) as reserved event names.
- **Action item — v2 infra setup phase:** wire the CloudWatch + SNS + email alert pipeline as part of `dev-deployment.md` v2 infra handoff. Captured as a new section in `dev-deployment.md`. Flagged in `convo-041` resume context.
- **Saga / outbox / 2PC parked.** New entry in `upgrades.md` consolidating them: revisit if cross-system mismatches exceed a handful per month at any point.

**Discussion notes:**
- User pushed back on the original critical-vs-cosmetic split — "if we treat cosmetic things as background thing and show users other things first it still results in bugs somewhere isn't it." Correct. Background writes that fail silently are a top source of "why is this data wrong" bugs. Dropped the split.
- User pushed back on silent auto-heal — "autoheal on next read seems dangerous." Correct. Hides bugs, ships silent partial state. Dropped, replaced with fail-loud + manual ops fix.
- User pushed back on the original "log and continue" for org-switch DB failure — "this is not good if we ignore." Correct. Folded into the all-critical rule.
- User questioned account-delete ordering ("in case of account delete its better to do it in Cognito first only nah?"). Reversed from earlier draft (DB-soft-delete-first) to Cognito-first to match the universal rule. Reason: Cognito-first guarantees the user is locked out immediately, so the orphaned-DB window has no security surface.
- User added the compensation question explicitly: "also if anything is done halfway we should rollback nah?" That landed as option D (best-effort compensation). The "compensation itself can fail" case is what the ops alert covers.
- Retries live in our code, not Cognito's. Cognito doesn't retry on our behalf. Our helpers are the only retry layer.
- Failure response is just a normal error response via the centralized error handler from `dev-standards.md` §2. No rollback bookkeeping in the response path.
- "Manual fix" examples: signup mismatch → either insert the missing `users` row from JWT `sub`, or `AdminDeleteUser(sub)` and tell user to retry. Account-delete mismatch → SQL cascade delete of orphaned rows. Org-switch mismatch → trivial SQL update or user's next switch click heals it (idempotent).
- Outbox is the natural v3 upgrade: same `withCognitoBackoff`/`withDbRetry` helpers move into a worker that drains an `outbox` table, drop the inline compensation entirely, accept eventual consistency. Migration cost is small because the per-flow code shape stays similar.
- Full session details in `devlog/convo-041-v2-rapid-fire-rf8.md`.

---

## RF-9. Session and permission consistency mid-flight

**Why it matters:** Two scenarios produce session/permission drift while a user is actively using the app: (1) an admin removes the user from the active org, (2) an admin changes the user's role within the active org. Backend behavior is already locked in Q3 (middleware re-validates `user_orgs` + reads role fresh every request). Decides what the frontend does when those 403s land — does the user get yanked mid-action, see a banner, lose their place, get force-logged-out? Defines the UX contract for permission churn that happens while the app is open.

**Options for the membership-revoked reaction:**
- **A. Force logout.** User is signed out entirely on first 403. Heavy — user has other orgs they're still in, so logging them out completely is overkill.
- **B. Force immediate redirect to org switcher / empty-state.** User is yanked mid-action; whatever they were reading / editing disappears. Aggressive.
- **C. Banner + stay on current page + redirect on next navigation.** First 403 shows a sticky banner; current page stays loaded with already-fetched data; user can finish reading; next nav click redirects to org-switcher / empty-state. Soft, user-driven recovery.
- **D. Silent failure / inline error per request.** No banner, no redirect, each failed request shows its own error. User left to figure out what's happening.

**Options for the role-changed reaction:**
- **E. Force token refresh on every action.** Heavy — every click triggers `Auth.currentSession()` to pull fresh claims. Adds latency and token-refresh-storm risk per RF-2.
- **F. Banner + reactive on action.** Banner notifies that role changed; UI stays as-is (no permission-aware rewrites). When user clicks into a route their new role can't access, standard access-denied page renders from backend's `403 INSUFFICIENT_ROLE`.
- **G. Permission-aware UI rewrites.** Frontend listens for role changes and rewrites the menu (hide admin links, swap CTAs). Complex; requires every component to be permission-aware.
- **H. Wait for next reload.** No banner, no immediate reaction. User discovers the change next time they reload the page. Silent partial state.

**Options for cross-tab and cross-device propagation:**
- **I. Lazy detection per device** (next API call on each device hits the 403 → triggers that device's banner). Matches RF-1's existing cross-device pattern.
- **J. WebSocket / SSE active push** to all devices/tabs simultaneously. Already parked in RF-1 for v3.
- **K. `storage` event listener for same-browser tabs** (already locked in RF-1). Propagates the banner across tabs in the same browser instantly.

**Tradeoffs:** A is too aggressive — punishes the user for losing one org when they're still in others. B is jarring — destroys context mid-action. D is confusing — user sees errors but doesn't know what's happening. C is the right balance: clear notification, lets them finish reading, drives recovery on natural navigation. E creates a token-refresh storm and adds latency to every action — overkill. G is complex with no real upside (the access-denied page on click is good enough). H is silent partial state — same anti-pattern as auto-heal from RF-8. F matches the rest of v2's "middleware enforces, UI informs" philosophy. K + I together is exactly RF-1's pattern — no new infra, just reuse what's already locked.

**Decision: C + F + I + K.** ✅ Banner-first for both cases + redirect on natural navigation for revoked membership + access-denied on admin-route click for demoted role + RF-1's cross-tab/cross-device propagation reused.

**Concrete v2 shape:**

1. **Backend error-code expansion.** Standard 403 response shape adds two new error codes:
   - `code: "MEMBERSHIP_REVOKED"` — fired by middleware when `user_orgs(user_id, current_org_id)` returns no row.
   - `code: "INSUFFICIENT_ROLE"` — fired by role-checking middleware/guard when the user's current role doesn't satisfy the route's required role.
   Both codes live alongside the existing standard error envelope (per `dev-standards.md` §2 centralized error handler).
2. **Frontend axios response interceptor** catches 403s with these codes. Routing logic split per code.
3. **Membership-revoked flow:**
   - First 403 with `MEMBERSHIP_REVOKED` → mounts a global sticky top banner: "You no longer have access to [Org Name]. Switch to another organization." with a "Switch org" button.
   - Current page stays mounted; already-fetched data is visible; new fetches return 403 but are silent (banner is already up — no toast spam).
   - Any client-side route change (Next.js `router.push`) post-banner → interceptor middleware redirects to the **org list / switcher page** where the user explicitly picks an org. **No auto-selection of next-most-recent.** If user has zero orgs left, they land on RF-4's empty-state screen with Join-org / Create-org options. Never on an org dashboard directly.
   - "Switch org" button in the banner triggers the same redirect, just faster.
4. **Role-changed flow:**
   - First 403 with `INSUFFICIENT_ROLE` OR a backend-pushed signal (lighter — currently not planned for v2; relies on the 403-on-action discovery path) → mounts the role-change banner: "Your role in [Org Name] has changed. Some actions may no longer be available."
   - All UI stays exactly as it was — no hiding admin links, no permission-aware menu rewrites.
   - Subsequent clicks into routes their new role doesn't permit → backend `403 INSUFFICIENT_ROLE` → frontend renders the standard access-denied page (same page used for direct-URL access by non-admins; component already needed regardless of RF-9).
5. **Cross-tab propagation:** RF-1's `storage` event listener already fires on Amplify auth-key changes. Extend it to also propagate a small `permissionChange` event so other tabs in the same browser mount the same banner immediately. ~5 lines of additional code on top of the RF-1 listener.
6. **Cross-device propagation:** lazy — each device discovers the change on its own next API call → its own 403 → its own banner. Matches RF-1's locked pattern. No active push.
7. **No forced logout, no aggressive token refresh, no permission-aware UI rewrites.** Three deliberate non-decisions captured here so they don't drift into the build.

**Companion locks under RF-9:**
- **Backend error-code constants** added to a shared types file (e.g. `backend/lib/error-codes.ts`) and mirrored in `frontend/src/lib/error-codes.ts` so both sides stay in sync. Tiny module.
- **Sticky banner component** is reusable across both cases — same component, two copy variants. Will live in `frontend/src/components/PermissionBanner.tsx` or similar.
- **Access-denied page** is needed regardless of RF-9 (direct-URL access by non-admins is a separate case). RF-9 just reuses it for the role-changed-mid-session case.
- **RF-1's storage event listener** gets a small extension to propagate `permissionChange` across tabs. Captured here so the RF-1 listener implementation accounts for it from day one.

**Discussion notes:**
- User pushback shaped the membership-revoked flow toward "soft" rather than "aggressive" — original draft auto-redirected on first 403, user preferred banner + stay-on-page + redirect-on-next-nav. Final shape preserves user context until they naturally navigate away.
- **No auto-selection of next-most-recent org on redirect.** User explicitly corrected: even if the user has one or more remaining orgs, the redirect lands on the org list / switcher page where they pick explicitly. If zero orgs, lands on the empty-state screen with Join-org / Create-org only. Reason: avoid silently switching context without consent — picking an org is a deliberate user action, not a fallback.
- User explicitly accepted role-stale UI ("if he was admin now became a user the pages admin has will still be shown but when he clicks on the page where only admin has rights too then we can show access denied page"). This is consistent with the rest of v2's "middleware enforces, UI informs" philosophy and avoids permission-aware UI rewrite complexity.
- The `permissionChange` extension to RF-1's storage event is the only new infrastructure piece — and it's a 5-line addition to a listener that's already being written.
- Considered force-logout (Option A) — rejected because user can have other orgs they're still in. Logging them out across all orgs because they lost one is hostile.
- Considered force-redirect-on-first-403 (Option B) — rejected because it destroys the user's current page state mid-action. Banner-then-redirect-on-next-nav is gentler.
- Considered permission-aware UI rewrites (Option G) — rejected because every component would need to be permission-aware and the access-denied-on-click pattern handles the edge cases for free.
- Industry pattern: most B2B SaaS (Notion, Linear, Slack, GitHub) use the same banner-first soft pattern. Few force logout on permission loss; none force redirect on first 403.
- Full session details in `devlog/convo-042-v2-rapid-fire-rf9.md`.

---

## RF-10. Subscription expiry session behavior

**Why it matters:** Q11 locked the org-level state machine on subscription expiry (indefinite read-only, pre-expiry emails, end-of-period cancellation). RF-10 is the user-side overlay: what does an active user see when expiry fires mid-session? Without a clear pattern, users either get cryptic errors on every write attempt, or the org silently degrades and they discover via failed actions. Decides the banner shape, the error envelope, and the UI's posture (proactively disabled vs error-on-action).

**Options for surfacing the expiry state:**
- **A. Sticky banner the moment expiry is detected.** Banner copy + reactivation CTA for admins, "contact admin" copy for non-admins. UI stays interactive; writes error on click. Matches RF-9 pattern.
- **B. Block the entire org with a full-page modal.** "Your subscription has expired. Reactivate to continue." Modal can't be dismissed. Aggressive — destroys context, prevents reading existing content.
- **C. No banner; surface only on write attempt.** Silent until user tries to save. Each write returns the error code; toast shows. Confusing — user doesn't know why writes are failing without trying.
- **D. Proactive UI disabling.** Every write button greyed out across the entire app once expiry detected. Requires permission-aware UI rewrites in every component.

**Options for backend enforcement:**
- **E. Middleware checks `subscriptions.status` per request on write methods.** Existing tenant-scoping middleware (Q3) extends to read the active org's subscription status; if `expired` and request method is POST/PUT/PATCH/DELETE, return `403 SUBSCRIPTION_EXPIRED`. Centralized, one gate.
- **F. Per-route guards.** Each write endpoint individually checks subscription status. Scatters the check across the codebase.
- **G. DB-level constraint.** Postgres trigger / RLS policy blocks writes when subscription expired. Overkill, hard to message back to the frontend cleanly.

**Options for propagation:**
- **H. Lazy per-device detection.** First write attempt on each device returns the error; banner mounts. Matches RF-9.
- **I. Active push** (WebSocket/SSE). Already parked in RF-1 for v3.
- **J. Cross-tab same-browser:** RF-1's `storage` event listener extended with a `subscriptionExpired` event. ~5 more lines.

**Tradeoffs:** B is hostile — Q11 explicitly chose indefinite read-only over hard-lockout, so locking the UI behind a modal contradicts the lock. C is confusing UX — user gets errors without context. D requires the kind of permission-aware UI rewrites RF-9 explicitly rejected (every component becomes permission-aware). A is the only option consistent with RF-9 and Q11. E centralizes the enforcement in one place — the existing tenant-scoping middleware grows by ~5 lines instead of every controller learning about subscriptions. F scatters knowledge and creates drift risk. G is over-engineered for a state we already gate at the application layer. H + J together is exactly RF-9's pattern — reuse, no new infra.

**Decision: A + E + H + J.** ✅ Sticky banner + middleware-level enforcement + lazy per-device detection + storage-event cross-tab propagation.

**Concrete v2 shape:**

1. **Backend error code.** Standard 403 envelope adds:
   - `code: "SUBSCRIPTION_EXPIRED"` — fired by the tenant-scoping middleware when `subscriptions.status = 'expired'` and the request method is a write.
2. **Middleware extension.** The Q3 tenant-scoping middleware (which already reads `user_orgs(user_id, current_org_id)` per request) extends to also read the active org's `subscriptions.status` in the same query (single join, no extra DB round trip). If status is `expired` AND method is POST/PUT/PATCH/DELETE, return the 403. Reads continue to flow.
3. **Banner copy (admin variant):** "Your subscription expired on [date]. The organization is now in read-only mode." + "Reactivate subscription" button → routes to the org's billing page per Q11's reactivation flow.
4. **Banner copy (non-admin variant):** Same first line + "Contact your organization admin to reactivate." No button. Role determined client-side from the user's role in the active org (already loaded as part of org context).
5. **Mid-action flow:** user is editing a ticket / sprint / project when expiry fires. Save click → backend `403 SUBSCRIPTION_EXPIRED` → frontend axios interceptor shows a specific toast ("Cannot save — subscription has expired") and mounts the sticky banner if not already up. User keeps their unsaved edits visible (no destructive page reload) but can't persist them until reactivation.
6. **UI posture:** all write buttons and CTAs stay visible and clickable. No proactive disabling. Click → error → toast + banner. Same philosophy as RF-9.
7. **Cross-tab same-browser:** RF-1's `storage` event listener gets a `subscriptionExpired` event in addition to `permissionChange` from RF-9. Other tabs in the same browser mount the same banner immediately.
8. **Cross-device:** lazy detection — each device discovers the change on its own next write attempt → its own 403 → its own banner. Matches RF-9 / RF-1.
9. **Reactivation flow** (already locked at Q11): admin clicks "Reactivate" in banner → billing page → completes payment → subscription status flips back to `active` → next API call from any device returns to normal → banner auto-dismisses on next successful write response (frontend clears banner state when a write succeeds without the error code).

**Companion locks under RF-10:**
- **`PermissionBanner` component** (built for RF-9) gets a third variant. Same component, three copy modes (membership revoked / role changed / subscription expired).
- **Axios response interceptor** (built for RF-9) gets the `SUBSCRIPTION_EXPIRED` case. Total interceptor logic ~40 lines covering all three v2 banner-trigger codes.
- **RF-1 storage event listener** must propagate both `permissionChange` (from RF-9) and `subscriptionExpired` (from RF-10). Account for both from day one.
- **Tenant-scoping middleware** (Q3 + RF-10): the extended query now reads `user_orgs.role` AND `subscriptions.status` in addition to the existing membership validation. Still one query — single join from `user_orgs` to `subscriptions` on `org_id`.

**Discussion notes:**
- User recalled Q11 and proposed the banner pattern: "again same as banner it'll pop and in mid of something means like while changing ticket or something it'll just give error nah the error should be then specific that subscription expired and banner should be there while everything being read only got it?" — confirmed exactly. RF-10 is RF-9's pattern applied to a different trigger.
- Considered full-page modal (Option B) — rejected. Q11 explicitly preserved read access on expiry; modal would contradict that lock.
- Considered proactive UI disabling (Option D) — rejected for the same reason as RF-9: every component would need permission-awareness; click-then-error is good enough at much lower complexity.
- Admin vs non-admin banner copy split is the only "permission-aware" piece — handled cheaply by reading role from already-loaded org context, not a per-component decoration.
- Banner auto-dismiss on next successful write (after reactivation) avoids stale "expired" banners lingering after the admin reactivates. Same pattern would work for RF-9 if membership / role were restored mid-session — captured here so the dismiss logic is general from day one.
- Outbox / SSE / WebSocket push not needed at v2 scale — lazy detection covers the use case. Captured under RF-1's existing parks.
- Full session details in `devlog/convo-043-v2-rapid-fire-rf10.md`.

---

## RF-11. Active-org deleted while user is logged in

**Why it matters:** Q14 locked org retention policy at the org level (indefinite retention in v2, 1-year retention → hard delete in v3, self-serve 2FA hard delete always available). RF-11 is the user-side overlay: what does an active user see when *the org they're currently working in* disappears mid-session? Without a clear pattern, users either get cryptic 404s on every fetch, hang on a ghost page that no longer exists, or get a destructive forced reload. Decides the banner shape, the error envelope, the redirect trigger, and the divergence (if any) from the RF-9 / RF-10 banner pattern.

**Options for surfacing the deletion:**
- **A. Sticky banner + redirect on next API call.** Same banner infrastructure as RF-9 / RF-10, fourth copy variant. On *any* subsequent fetch or action → toast + redirect to org switcher. UI stays mounted briefly so the transition isn't a hard reload, but doesn't pretend the org still works.
- **B. Force immediate full-page redirect the moment deletion is detected.** No banner; just navigate away on the first 403. Loses any unsaved in-memory state (filters, draft text) without warning.
- **C. Full-page modal: "This organization has been deleted. Click to continue."** Modal blocks all interaction; click → switcher. Heavier than necessary for a state that React Query refetches will surface anyway.
- **D. Keep banner sticky, allow reads from cache, only redirect on write attempt** (the RF-9 / RF-10 shape). Misleading — RF-9 / RF-10 preserve a real underlying state (membership exists but revoked / org exists but expired). RF-11's org row is *gone*; cache is showing a ghost.

**Options for backend enforcement:**
- **E. Q3 middleware naturally returns `403 ORG_DELETED` when the `user_orgs` ⋈ `organizations` join returns 0 rows for the current org.** No new query; the existing tenant-scoping query's empty result becomes a typed error code instead of a generic 403. Centralized.
- **F. Per-route 404 / 410.** Each endpoint discovers org absence on its own (FK lookup fails). Scatters the detection, drifts from the RF-9 / RF-10 error-code envelope.

**Options for propagation:**
- **G. Lazy per-device detection** — first API call on each device returns the error and the banner mounts. Matches RF-9 / RF-10.
- **H. Cross-tab same-browser:** RF-1's `storage` event listener extended with an `orgDeleted` event. ~3 more lines.
- **I. Active push (WebSocket / SSE).** Parked under RF-1 for v3.

**Tradeoffs:** B loses unsaved state and is jarring. C is the heaviest UX for a state that the lazy refetch already surfaces. D preserves a fiction (cache shows a deleted org's data); the moment React Query refetches on focus or mount, the cache invalidates anyway, so the "stays as-is with read access" promise from RF-9 / RF-10 doesn't translate cleanly to a hard-deleted entity. A is the only option that reuses the existing banner + interceptor + storage-event infrastructure while honoring the fact that the org *does not exist anymore for anyone*. E centralizes detection in one already-existing middleware vs. F's scatter. G + H is RF-9 / RF-10's exact propagation shape.

**Decision: A + E + G + H.** ✅ Sticky banner + middleware-level detection (Q3 join returning 0 rows) + lazy per-device detection + storage-event cross-tab propagation. Diverges from RF-9 / RF-10 only on the redirect trigger: *any* API call (read or write), not just writes.

**Concrete v2 shape:**

1. **Backend error code.** Standard 403 envelope adds:
   - `code: "ORG_DELETED"` — fired by the Q3 tenant-scoping middleware when `user_orgs JOIN organizations ON user_orgs.org_id = organizations.id WHERE user_orgs.user_id = $1 AND user_orgs.org_id = $2` returns 0 rows. The middleware already runs this query for membership validation (RF-9) and `subscriptions.status` (RF-10); RF-11 adds no extra DB round trip. The 0-row case currently returns generic `MEMBERSHIP_REVOKED`; the middleware learns to distinguish: if the user row exists in `user_orgs` but `organizations.id` is missing → `ORG_DELETED`; if the `organizations` row exists but no `user_orgs` row → `MEMBERSHIP_REVOKED`. One LEFT JOIN variation, ~5 lines.
2. **Banner copy:** "This organization has been deleted. Switch to another org to continue." Same `PermissionBanner` component as RF-9 / RF-10, fourth copy variant. No admin / non-admin split — the org is gone, no role-gated action available.
3. **Frontend interceptor flow:** axios catches `ORG_DELETED` → shows toast ("This organization has been deleted") + mounts banner + immediately calls the redirect helper that navigates to the org switcher (or RF-4 empty-state if no other orgs). No "stay on the page until next action" delay — the page can't function, every refetch will 403.
4. **The deleter's own session is separate.** The user who clicked self-serve 2FA hard-delete in settings doesn't go through the interceptor flow at all — the delete endpoint returns success, the frontend explicitly navigates them to the switcher (or RF-4 empty-state). The banner-flow is for *other* sessions: the deleter's own other tabs / devices, and every other admin/owner session in the same org.
5. **Cross-tab same-browser:** RF-1's `storage` event listener gets an `orgDeleted` event in addition to `permissionChange` (RF-9) and `subscriptionExpired` (RF-10). Other tabs in the same browser receive the event, immediately invalidate React Query cache for the deleted org, and trigger the redirect helper.
6. **Cross-device:** lazy detection — each device discovers the deletion on its own next API call → its own 403 → its own redirect. Matches RF-9 / RF-10 / RF-1.
7. **"Stays on page" caveat (inherited from RF-9 / RF-10):** because React Query refetches on focus / mount, the page may surface 403s and go empty/error-state before the user clicks anything. The interceptor catches all of those identically — banner + redirect. Best-effort, acceptable.

**Companion locks under RF-11:**
- **`PermissionBanner` component** now has four copy variants (membership revoked / role changed / subscription expired / org deleted). One component file, four copy modes.
- **Axios response interceptor** handles all four 403 codes. Total interceptor logic ~50 lines.
- **RF-1 storage event listener** propagates four events: `permissionChange` (RF-9 — both revoked and role-changed), `subscriptionExpired` (RF-10), `orgDeleted` (RF-11). Account for all four from day one — listener is written once, not iterated per RF.
- **Q3 tenant-scoping middleware** distinguishes `ORG_DELETED` from `MEMBERSHIP_REVOKED` via the LEFT JOIN variation described in shape #1. Single query covers all three of: membership existence, `subscriptions.status`, `organizations` existence.

**v2 scope clarification:**
- Q14 locked v2 as **indefinite retention** — no auto-deletion. The *only* path that triggers RF-11 in v2 is **another admin or owner hitting the self-serve 2FA hard-delete button** in settings.
- v3+ retention-expiry deletion (1-year window → hard delete) gets pre-deletion emails at T-30 / T-7 / T-1 per Q14, so users have ample warning before the banner ever appears.
- Q14 reactivation window (1-year, any admin/owner-at-cancel) only applies to the `read_only` retention state, not to hard-deleted orgs. Once an org is hard-deleted (v2: self-serve 2FA; v3+: also retention expiry), the row is gone and the org can't be revived — this is what makes the redirect-on-any-action behavior correct.

**Discussion notes:**
- User recalled the RF-9 pattern: "similar to how we are handling if user is removed from org... a banner appears if org is deleted and if a user does any action then he will be redirected to the org switch page." Confirmed exactly, with the one divergence: in RF-11 *any* API call (not just writes) triggers the redirect, because the org doesn't exist anymore — there's no read state to preserve from cache like RF-9 / RF-10 have.
- Considered keeping RF-9's "writes only" trigger for RF-11 (Option D) — rejected. RF-9 / RF-10 keep reads working because the org still exists in those states. RF-11's org is gone — React Query refetches on focus / mount will 403 anyway, so the "writes only" promise is fiction.
- Considered force-redirect on first 403 (Option B, no banner) — rejected. Loses any in-memory unsaved state (filters, draft text) without warning. Banner + redirect helper gives a beat for the toast to register.
- Considered full-page modal (Option C) — rejected as overkill for a state that the lazy refetch already surfaces; modal would block the rest of the app shell (top-right org switcher itself!) which is the destination we want users to reach.
- The Q3 middleware extension is a one-query change, not three. The existing `user_orgs ⋈ organizations` join + `subscriptions` join already runs per request; the 0-row case just learns to distinguish "user_orgs row missing" (`MEMBERSHIP_REVOKED`) vs "organizations row missing" (`ORG_DELETED`). LEFT JOIN with `IS NULL` checks on each side. ~5 lines on top of RF-9 / RF-10.
- The deleter's own session is the most-asked edge case during build. Captured explicitly above (concrete shape #4) so the implementer doesn't accidentally route the deleter through the interceptor and create a weird double-redirect.
- Full session details in `devlog/convo-044-v2-rapid-fire-rf11.md`.

---

## RF-12. Invite edge cases beyond Q6 happy path

**Why it matters:** Q6 locked the happy-path email invite mechanism (single token, two paths, 7-day single-use). RF-12 is the surrounding edge-case envelope: what happens with duplicate invites to the same email, with revocation when an admin sent the wrong role / wrong email, and with re-invites after a user was removed from the org. These are all reachable in normal use and any of them quietly broken creates support load. Decides the schema additions, the supersede vs coexist semantics, and the Team-page "Pending invites" UX.

**Options for duplicate invite to same pending email** (two valid unused tokens floating in the inbox):
- **A. Newer supersedes older.** Sending the second invite marks the first as `revoked_at = NOW()` in the same transaction. First token dies immediately, second is the only live token.
- **B. Both stay valid; first-click wins.** Both tokens remain valid until the user clicks either. The clicked one sets `used_at`; subsequent click on the other shows "you've already joined" friendly page.
- **C. Reject duplicate.** Second invite call returns an error: "bob@x.com already has a pending invite from Admin A — cancel that one first."

**Options for already-a-member invite attempt:**
- **D. Pre-flight check at the invite endpoint.** Resolve email → `user_id` → `user_orgs(user_id, current_org_id)` lookup. If row exists, return friendly `409` "already a member." No email sent, no `invites` row.
- **E. Let it flow; show friendly page on click.** Send the invite, create the row; when Bob clicks the link, the join handler discovers he's already a member and shows "you're already in this org" page.

**Options for revoking a pending invite:**
- **F. "Pending invites" list on Team page with Cancel button.** Sets `revoked_at = NOW()`. Revoked tokens behave identically to expired ones on click.
- **G. No revoke mechanism.** Admin lives with the wrong-role / wrong-email invite until it expires (7 days). Practical workaround: send a corrected invite that supersedes the first (Option A handles the role-typo case).
- **H. Edit invite in place.** Admin can update role / email on a pending invite row. More complex; conflicts with the "token = immutable signed intent" model.

**Tradeoffs:** A is the cleanest mental model (latest admin intent wins, naturally handles role-upgrade mid-flight). B avoids the destructive revoke but creates two-tokens-in-inbox confusion and doesn't help when the role differs between T1 and T2. C is heaviest UX (admin must hunt for the prior invite and cancel before retrying). D is a ~3-line guard that prevents wasted email sends and the confusing "you're already a member" landing experience. E lets every duplicate-invite flow through email + DB + click before the user discovers it — wasteful and noisy. F gives admins direct control over the typo case and matches industry norm (Slack, Jira, GitHub all show pending invites with cancel). G works in theory (A's supersede covers role typo) but fails for the wrong-email case where the admin can't supersede because they don't know the right email yet. H is over-engineering for v2 — a fresh invite via supersede is simpler than editable invite rows.

**Decision: A + D + F.** ✅ Newer-supersedes-older + pre-flight already-member guard + Team-page "Pending invites" with revoke.

**Concrete v2 shape:**

1. **Schema add:** `invites.revoked_at TIMESTAMP NULL` column. Token validity check across all four states becomes:
   ```
   used_at IS NULL
   AND revoked_at IS NULL
   AND expires_at > NOW()
   ```
   Q6's schema `(token, org_id, role, invited_email, invited_by, expires_at, used_at)` plus this column = final invites schema for v2.
2. **Invite-create endpoint flow:**
   1. Validate caller role: caller must be `admin` or `project_manager` in current org (Q5).
   2. Validate subscription: middleware already gates writes when `subscriptions.status = 'expired'` per RF-10 — returns `403 SUBSCRIPTION_EXPIRED` automatically.
   3. **Pre-flight already-member check:** resolve email → `user_id` (Cognito `AdminGetUser` by email, or local `users.email` lookup if user has signed up). If `user_orgs(user_id, current_org_id)` row exists → return `409 ALREADY_MEMBER`, friendly message "bob@x.com is already a member of this org." No email sent, no DB row.
   4. **Supersede previous pending invite:** in the same transaction as the new `INSERT INTO invites`, run `UPDATE invites SET revoked_at = NOW() WHERE invited_email = $email AND org_id = $org_id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`. Marks any prior live token for this `(email, org)` as revoked. Then `INSERT` the new row.
   5. Send email via SES with the new token. Body includes "This invite expires in 7 days."
   6. Frontend toast: "Invite sent to bob@x.com — expires in 7 days."
3. **Revoke / cancel pending invite endpoint:** `POST /api/v1/invites/:id/revoke`. Role-gated to `admin` / `project_manager`. Sets `revoked_at = NOW()`. Returns updated row. No email is sent on revoke (the invitee may not have read the original yet — silent cancel is the norm).
4. **Pending invites list endpoint:** `GET /api/v1/invites?status=pending` returns rows where `used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()` for the current org. Used by the Team page.
5. **Team page UI:** "Pending invites" section (bottom of member list, or filterable via a toggle) lists pending invites with `invited_email`, `role`, `invited_by`, time until expiry, and a "Cancel" button per row. Cancel calls the revoke endpoint, optimistic UI removes the row from the list.
6. **Click handler on token:** unchanged from Q6 except the validity check now includes `revoked_at IS NULL`. Expired / used / revoked tokens all land on the same friendly "this invite is no longer valid — ask for a new one" page.

**Companion locks under RF-12:**
- **Reserved error codes** added to `backend/lib/error-codes.ts`: `ALREADY_MEMBER` (`409`). Sits alongside the four 403 codes (`MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`, `ORG_DELETED`).
- **`invites` table final schema** is locked at v2 migration time as: `(id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`. No further columns deferred to v3.
- **Team page** has a "Pending invites" section from day one — not deferred. Required because RF-12 locks revoke as a v2 feature.
- **Subscription-expired interaction** confirmed working out of the box: RF-10's tenant-scoping middleware gates POST `/invites` and POST `/invites/:id/revoke` (both writes) — admins of an expired org can't send or revoke invites until reactivation. No RF-12-specific code.

**Edge cases explicitly covered:**
- **Duplicate invite to same pending email:** supersede (decision A).
- **Invite to existing member:** pre-flight 409 (decision D).
- **Wrong role on pending invite:** admin sends a new invite with correct role → supersede revokes the old one (A handles it).
- **Wrong email on pending invite:** admin cancels the wrong-email invite from Pending list, sends a fresh invite to the correct email (F).
- **Expired token reuse:** Q6 already covers — friendly expired page.
- **Used token reuse (accepted-then-removed-then-clicks-old-email-link):** Q6's single-use already covers — `used_at IS NOT NULL` → friendly page. Bob needs to be re-invited (fresh row, fresh token, fresh email).
- **Re-invite after removal:** standard happy path — admin invites the same email again, supersede has nothing to supersede (the old row has `used_at` set, isn't "pending"), so a fresh row + email goes out as normal.
- **Invite while org subscription is expired:** RF-10 returns `403 SUBSCRIPTION_EXPIRED`. Admin sees the banner, can't invite until reactivation.
- **Invite while org is hard-deleted:** RF-11 returns `403 ORG_DELETED`. Admin gets redirected to the org switcher. Not reachable in practice — if the org is deleted, the admin no longer has a path to the Team page.

**Discussion notes:**
- User confirmed Q6's 7-day TTL stays as-is (initially considered overriding to 24h for tighter blast radius; 7d retained for invitee convenience and industry alignment).
- User confirmed Option A (supersede) with reasoning "latest intent wins, role on T2 may differ from T1, e.g. admin upgraded the invite from user to project_manager." This is exactly the case that makes A a better default than B.
- User confirmed Option D's framing: "we will check while sending invite if there's no mail we will say user is already in org" — pre-flight at the endpoint, not after.
- User confirmed Option F's surface: "if user was invited in team page they will still show up in bottom or we can filter out" — bottom-of-list with optional filter, cancel button "treated same as token expired." Revoke + expire converge on the same friendly page.
- Considered Option H (editable invite rows) — rejected. The token represents an immutable signed intent; supersede via fresh row keeps the invariant clean.
- Considered "send a notification email on revoke" — rejected. Silent revoke is the norm; the invitee may never have read the original email.
- Per-org or per-day invite quota / abuse prevention (admin spamming invites): deferred to v3 with the rest of the abuse-prevention surface. Not blocking v2.
- Email bounce handling (invalid invitee email): handled at the SES layer in v3 — bounce notifications go to a webhook. v2 relies on the admin noticing the invitee never responded. Not blocking.
- RBAC discussion (who can invite, can `project_manager` invite at `admin` role, etc.) parked for the dedicated post-rapid-fire roles/RBAC pass. RF-12 inherits Q5/Q6's existing rule: `admin` and `project_manager` can invite. Tightening (e.g. PM can only invite as `user`) is a v2 detail to lock in that future pass, not in RF-12.
- Full session details in `devlog/convo-045-v2-rapid-fire-rf12.md`.

---

## RF-13. Token refresh stale window during org switch

**Why it matters:** Q1 made the token's `custom:current_org_id` claim the per-request source of truth for active org — middleware reads it on every request. The org-switch flow has three steps: (1) backend `AdminUpdateUserAttributes` writes the new orgId to the Cognito attribute, (2) backend updates `user_orgs.last_accessed_at`, (3) frontend calls `Auth.currentSession({forceRefresh: true})` to mint a *new ID token* containing the updated claim. RF-8 covered steps 1+2. RF-13 closes step 3 — the window between "backend succeeded" and "frontend has the new token in hand." Without a clear answer, the UI either lies (shows orgB while the live token still says orgA → server returns orgA data), or silently flips an hour later when Amplify's background auto-refresh quietly picks up the new attribute value. Both are user-visible bugs.

**Options for the UI flip timing:**
- **A. Gate UI flip on the refresh + claim verification.** Switcher stays in "switching..." until the new token is in hand *and* its `custom:current_org_id` claim equals the requested orgId. Then atomic flip via React Query invalidation. Brief intermediate state (~500ms typical), but UI never lies.
- **B. Flip UI immediately on backend success.** UI updates to orgB the moment backend returns 200. Token catches up later. Creates the "profile orgB / data orgA" race window — bad state visible to user.
- **C. Force logout + re-login.** Cleanest atomicity, heaviest UX. User signs back in, fresh tokens reflect the new attribute. Adds 5–10 seconds and breaks the user's flow.

**Options for refresh-failure handling:**
- **D. Two-layer retry: 3 internal auto + user-facing Retry button + Contact Support after 3 user retries.** Internal layer hidden behind the "switching..." spinner; if exhausted, surface a banner. Mirrors RF-2's `withCognitoBackoff` pattern on the frontend.
- **E. Single retry layer, then force logout on failure.** If refresh fails after retries, log the user out, push to sign-in.
- **F. No retries — first failure surfaces error immediately.** Simplest, worst UX for transient network blips.

**Options for the post-failure system state:**
- **G. Revert Cognito attribute + DB to prior orgA when refresh fails.** RF-8's compensation pattern applied to RF-13's step 3. Resyncs all three state stores. Prevents Amplify's background auto-refresh from silently flipping the UI to orgB ~50 minutes later.
- **H. Leave Cognito attribute at orgB; rely on user to click Retry.** Simpler — no revert endpoint. But the silent-switch-1-hour-later bug is reachable: Amplify auto-refreshes, new token claim = orgB, user's UI flips mid-work without context.
- **I. Mark the divergence in DB; healing routine reconciles periodically.** Heavy infra, overkill at v2 scale.

**Tradeoffs:** A is the only option that prevents the "profile orgB / data orgA" race without a heavy logout — the brief "switching..." spinner is the price for atomicity. B is fast but produces exactly the visual lie the user explicitly wants to avoid. C works but the 5–10 second logout/re-login hit for every org switch is hostile. D is the standard "graceful degradation" pattern — internal retries handle transient failures invisibly, user only sees the banner if things truly fail. E is over-aggressive; refresh failures are usually transient network blips, no reason to nuke the session. F surfaces every network hiccup as a user-visible failure. G closes the silent-switch trap by reverting state when the switch couldn't complete cleanly — matches user mental model ("it failed, I'm still in orgA"). H is simpler but reintroduces the trap. I is heavyweight and unnecessary when the frontend can call a revert endpoint synchronously after Layer 1 exhausts.

**Decision: A + D + G.** ✅ Gated UI flip + two-layer retry + compensation revert on refresh failure.

**Concrete v2 shape:**

1. **Frontend cognito-retry helper.** New module `frontend/src/lib/cognito-retry.ts`. Mirrors RF-2's backoff (100ms / 300ms / 1s with ±20% jitter, 3 attempts). Used to wrap `Auth.currentSession({forceRefresh: true})`.
2. **Switch flow (happy path):**
   1. User clicks switcher → frontend captures current orgId as `priorOrgId`, disables switcher (RF-6), shows "switching..." spinner.
   2. Frontend calls `POST /api/v1/auth/switch-org` with `{newOrgId}`.
   3. Backend runs `withCognitoBackoff(() => AdminUpdateUserAttributes(...))` then `withDbRetry(() => UPDATE user_orgs SET last_accessed_at = NOW() WHERE ...)`. Both succeed (RF-8 path).
   4. Backend returns `{success: true, newOrgId, priorLastAccessedAt}` so frontend has what it needs for the revert call if step 6 fails.
   5. Frontend runs `cognitoRetry(() => Auth.currentSession({forceRefresh: true}))`.
   6. Frontend verifies new token's `custom:current_org_id` claim === `newOrgId`. If yes → invalidate all `['org', priorOrgId, ...]` and `['org', newOrgId, ...]` queryKeys → atomic UI flip → "switching..." spinner clears.
3. **Switch flow (refresh fails after 3 internal retries):**
   1. Frontend calls `POST /api/v1/auth/switch-org/revert` with `{revertToOrgId: priorOrgId, restoreLastAccessedAt: priorLastAccessedAt}`.
   2. Backend runs `withCognitoBackoff(() => AdminUpdateUserAttributes(...orgA))` then `withDbRetry(() => UPDATE user_orgs SET last_accessed_at = $priorTimestamp WHERE ...)`.
   3. Revert succeeds → frontend shows banner: "Org switch unsuccessful — [Retry?]". Switcher re-enabled. User is cleanly back to orgA across all three stores (token + Cognito attribute + DB).
   4. Revert fails (after retries) → RF-8 SNS alert fires (`event: "org_switch_revert_failed"` per RF-8's reserved naming pattern). Frontend shows banner with Retry + Contact Support both visible immediately (auto-recovery is broken; user needs the escape hatch).
4. **User-facing Retry banner behavior:** Retry button re-runs the full switch flow from step 1 (capture priorOrgId again — it's still orgA if revert succeeded). After 3 Retry button clicks all fail, the banner adds a Contact Support button below Retry. User can still keep clicking Retry indefinitely; Contact Support is the escape hatch, not a forced terminal state.
5. **Atomic UI update mechanism:** RF-6's `['org', orgId, ...]` queryKey convention. When the gated flip happens (step 2.6), React Query invalidates *every* tenant-scoped query in one shot. Profile, header, dashboard, sidebar all refetch with the new orgId simultaneously — no panel races ahead of another.
6. **Token-expired-mid-switch (separate edge):** if the backend `/switch-org` call itself returns 401 because the outbound ID token expired during the request (1-hour Cognito TTL, race against in-flight calls), the standard axios refresh-on-401 interceptor handles it — refresh the token, retry the switch endpoint once. If refresh fails here too, the refresh-token has genuinely expired (30-day TTL — very rare) → normal session-timeout redirect to login. Not switch-specific.

**Companion locks under RF-13:**
- **`POST /api/v1/auth/switch-org`** response shape must include `priorLastAccessedAt` so the frontend can pass it to the revert endpoint. Backend captures this *before* writing the new value.
- **`POST /api/v1/auth/switch-org/revert`** endpoint added. Idempotent (re-running it with the same args is a no-op if state already matches).
- **`frontend/src/lib/cognito-retry.ts`** mirrors `backend/lib/retry.ts`'s `withCognitoBackoff`. Two-side codification of the same backoff curve.
- **Reserved log event** (RF-8 pattern): `event: "org_switch_revert_failed"` for the SNS-alerting case. Code that fires this must use the exact event name to match the CloudWatch metric filter.
- **No new error code.** The retry banner is driven by client-side state ("refresh failed N times"), not by a server error envelope.

**What this does NOT include:**
- **No forced logout** on refresh failure. The old token is still valid and self-consistent (token says orgA = what the user sees = what the backend returns). Forcing logout would be a worse UX than letting the user stay in orgA with a retry banner.
- **No SNS alert on first-layer failure.** Refresh failures are usually transient network blips. SNS only fires when the *revert* also fails — i.e. when Cognito truly cannot accept any write, which is rare enough to warrant ops attention.
- **No backend-driven heartbeat or healing routine.** Revert is frontend-driven (the browser is the only party that knows the refresh failed). Simpler than a server-side timeout-and-revert pattern.

**Discussion notes:**
- User's first instinct was to conflate this with RF-8 (Cognito-first, retry, SNS) — corrected: RF-8 covers steps 1+2 (attribute write + DB write), RF-13 covers step 3 (token refresh). Different Cognito API call (`InitiateAuth REFRESH_TOKEN_AUTH` vs `AdminUpdateUserAttributes`), different failure mode.
- User pushed for "immediate atomic switch on backend success" — explained that's not technically possible because middleware reads the token claim, so the UI must wait for the refresh. The "atomicity" they want is delivered by the brief "switching..." spinner + RF-6's queryKey invalidation — not by racing the UI flip ahead of the token.
- User's "no forced logout" instinct was correct — old token is still valid; user can keep working in orgA. But this surfaced the silent-switch-1-hour-later trap: without revert, Amplify's background auto-refresh would silently pick up the new attribute value and flip the UI mid-work. Compensation revert (Option G) closes this — locked.
- User asked for two-layer retry shape: internal auto-retries hidden in the spinner, then user-facing Retry button, then Contact Support after 3 Retry clicks all fail. Confirmed and locked.
- Considered backend-driven heartbeat-and-auto-revert (Option I-adjacent) — rejected as overkill. Frontend explicitly calling the revert endpoint is simpler and the browser is the authoritative party on whether refresh succeeded.
- The `priorLastAccessedAt` capture-before-write is the load-bearing detail for clean revert. Without it, revert would set `last_accessed_at` to `NULL` or to the wrong timestamp, breaking RF-5's recency ordering for the org switcher dropdown.
- Full session details in `devlog/convo-046-v2-rapid-fire-rf13.md`.

---

## RF-14. Per-request membership validation scaling

**Why it matters:** Q1 locked middleware-only tenant isolation with per-request DB validation. By RF-13 the per-request work has accreted: RF-9 added role read, RF-10 added subscription status, RF-11 added org existence. All five — membership, role, subscription, org-existence, org-deleted-vs-revoked distinction — collapsed into a single LEFT JOIN query (plus a separate `loadUser` query). At v2 scale this is free. At v3+ scale it becomes the hottest path in the app and the obvious caching candidate. RF-14 locks two things: the **v2 footprint and indexes** (cheap to set right now, painful to retrofit after data exists), and the **abstraction shape** that lets v3 add Redis without rewriting middleware. RF-15 (invalidation) is formally bound to RF-14 — only relevant once caching exists.

**Per-request DB footprint (locked, will hold through v2):**

For any tenant-scoped endpoint under `/api/v1/...`, the auth chain runs:

1. **`verifyCognitoJwt`** — JWT signature verification against Cognito JWKS. **No DB query** (JWKS cached in-memory by `aws-jwt-verify`).
2. **`loadUser`** — `SELECT id, email, ... FROM users WHERE cognito_sub = $1`. **1 DB query** to `users`.
3. **Combined membership + role + subscription + org-existence check** — merged from what would have been four queries into one LEFT JOIN:
   ```sql
   SELECT
     uo.role,
     o.id   AS org_exists,
     s.status AS sub_status
   FROM user_orgs uo
   LEFT JOIN organizations o ON o.id = uo.org_id
   LEFT JOIN subscriptions s ON s.org_id = uo.org_id
   WHERE uo.user_id = $1 AND uo.org_id = $2
   ```
   **1 DB query.** Touches `user_orgs`, `organizations`, `subscriptions`.

**Total = 2 queries per tenant-scoped request.** Both are equality lookups on indexed columns, sub-millisecond at v2 scale.

**Options for v2 posture:**
- **A. Lock the v2 footprint and the abstraction; defer caching to v3 with explicit trigger criteria.** Index every hot-path lookup at first migration. Introduce `MembershipResolver` interface so v3 swaps in Redis without touching middleware. Activate v3 work when measured metrics cross specific thresholds, not when intuition says "feels slow."
- **B. Build Redis caching now.** Premature optimization at v2 scale — adds infra (Redis instance), invalidation complexity (RF-15), failure modes (cache stampede, stale reads on role change), and operational burden for zero measured benefit.
- **C. Defer everything (no abstraction either).** Cheap now, expensive later — v3 caching becomes a middleware rewrite touching every tenant-scoped endpoint.

**Options for the cache-readiness abstraction:**
- **D. `MembershipResolver` interface with `DbMembershipResolver` as v2's only impl.** Middleware calls `resolver.resolve(userId, orgId)`. v3 adds `CachedMembershipResolver` as a decorator wrapping the DB resolver with Redis lookup-then-fallback. One DI registration change to swap.
- **E. No abstraction; query inline in middleware.** Simpler today, painful tomorrow.
- **F. Heavier abstraction (full caching layer in v2, but with `NullCache` impl).** Over-engineered — `NullCache` is an extra file solving zero problems.

**Options for the v3 activation trigger:**
- **G. Mechanical thresholds locked now.** p99 auth middleware latency sustained >10ms over a 24h window, OR concurrent active users >500 sustained, OR DB connection pool saturation traceable to middleware queries. Any one fires → v3 work activates.
- **H. "We'll know when we see it."** Subjective trigger leads to either premature work or sustained pain.
- **I. Time-based (e.g. "do it in Q3").** Disconnected from actual load.

**Tradeoffs:** A matches v2's scale honestly while preserving the swap path. B is premature. C makes v3 painful. D is the cheapest abstraction that meets the swap requirement — mirrors Q1's `AuthService` and Q12's billing-adapter pattern, ~5 lines net cost. E saves 5 lines today, costs a middleware rewrite later. F invents complexity. G gives the team a mechanical decision rule instead of arguing about subjective slowness. H invites either over-engineering or under-engineering. I is calendar-driven, ignores actual load.

**Decision: A + D + G.** ✅ v2 locks footprint + indexes + `MembershipResolver` abstraction. v3 activation governed by explicit metric thresholds. RF-15 stays bound to RF-14.

**Concrete v2 shape:**

1. **Index list locked at v2's first migration:**
   - `users(cognito_sub)` UNIQUE — drives `loadUser`.
   - `user_orgs(user_id, org_id)` UNIQUE composite — drives the membership query (also functions as the table's PK).
   - `user_orgs(org_id)` — tenant scoping for "list members of org X" (Q16 covers tenant tables generally; this is the membership side).
   - `user_orgs(user_id, last_accessed_at DESC)` composite — drives RF-5's "8 most recently accessed orgs" dropdown.
   - `organizations(slug)` UNIQUE — drives slug uniqueness (Q14) and lookup-by-slug.
   - `subscriptions(org_id)` UNIQUE — one subscription per org, drives the join.
   - `invites(token)` UNIQUE — drives invite-link click handler (Q6).
   - `invites(invited_email, org_id) WHERE used_at IS NULL AND revoked_at IS NULL` partial index — drives RF-12's pre-flight already-member check and supersede transaction.

2. **`MembershipResolver` interface:**
   ```ts
   // backend/modules/auth/membership.resolver.ts
   export interface MembershipResolver {
     resolve(userId: string, orgId: string): Promise<MembershipContext | null>;
   }

   export type MembershipContext = {
     role: 'admin' | 'project_manager' | 'user';
     orgExists: boolean;
     subStatus: 'active' | 'expired' | 'trialing' | 'canceled';
   };

   export class DbMembershipResolver implements MembershipResolver {
     async resolve(userId, orgId) { /* the LEFT JOIN query */ }
   }
   ```
   Middleware calls `resolver.resolve(userId, orgId)` and reads `MembershipContext` — never touches SQL directly. v3 adds `CachedMembershipResolver` wrapping the DB one; middleware code unchanged.

3. **v3 activation trigger criteria (locked here so the decision moment is mechanical, not subjective):**
   - **p99 auth middleware latency sustained >10ms** over a 24h window (CloudWatch alarm), OR
   - **concurrent active users >500 sustained** (DAU proxy), OR
   - **DB connection pool saturation traceable to middleware queries** (`pg_stat_activity` shows the auth-chain queries dominating wait time).
   - Any one fires → activate RF-14/RF-15 v3 work (Redis cache + invalidation).

4. **What v3 work looks like (parked, not designed in detail here):**
   - `CachedMembershipResolver` wrapping `DbMembershipResolver` with Redis lookup-then-fallback.
   - Cache key: `mem:{userId}:{orgId}` → serialized `MembershipContext`. TTL ~60s (calibrate at activation time).
   - Invalidation (RF-15 territory): on role change / membership removal / subscription status flip / org deletion, the writer explicitly deletes the cache key. Pub/sub broadcasts the invalidation to all backend instances. Detailed shape locked when RF-15 activates.
   - Read replicas considered alongside Redis at activation time — separate decision (cache may make replicas unnecessary at v3 scale).

5. **What this does NOT include in v2:**
   - No Redis instance. No `ioredis` dependency in v2's `package.json`.
   - No `NullCache` placeholder class. The abstraction is `MembershipResolver`, not a caching abstraction — caching is one v3 implementation strategy, not a v2 concept.
   - No read replicas. v2 is single-Postgres.
   - No shorter token TTL. Cognito's default 1h ID-token TTL is fine for v2 (and even at v3 scale, shortening the TTL doesn't actually help middleware load — middleware re-checks per request regardless of token TTL).

**Companion locks under RF-14:**
- **`dev-standards.md` §2 (Backend Standards)** gains an "Indexes on hot paths" entry pointing to the v2 index list above.
- **`dev-standards.md` §8 (Design Patterns in Use)** — `MembershipResolver` added to the existing "Service-interface abstraction for swap-ready infrastructure" entry alongside `AuthService`, `BillingService`, `SearchService`.
- **`upgrades.md`** — parks the v3 items: Redis membership cache, read replicas, RF-15 cache invalidation strategy.
- **No new error code**, no new log event. RF-14 is purely a shape + indexes lock; nothing new fires from it at runtime.

**Discussion notes:**
- User confirmed Redis + read replicas + TTL tuning as v3 work, with the explicit framing "we will do all things as per industry scaling standard even a little tiny thing but as per versions am making the priorities." This is the right posture — solve at the scale you have, but design so the next-scale solution drops in.
- User asked for a concrete walkthrough of the per-request DB footprint before locking — answered with the 2-queries-per-request breakdown above. Surfaced that `loadUser` is the *only* query that hasn't been merged into the combined join (it can't, since it uses `cognito_sub` not `user_id` — different lookup key). Merging would require either a redundant JOIN or denormalizing `cognito_sub` onto `user_orgs`, both worse than the 2-query baseline.
- Considered merging `loadUser` into the combined query via `JOIN users ON users.id = user_orgs.user_id` — rejected. The middleware needs the `users` row for `req.context.user` regardless of org context (e.g. profile endpoints don't pass orgId at all); keeping `loadUser` standalone preserves reuse across both org-scoped and user-only endpoints.
- The `MembershipResolver` interface intentionally exposes `MembershipContext` (the full read result), not granular methods like `hasRole(orgId, role)`. The granular shape would force re-querying for each check; returning the full context lets middleware do all gates against one resolved object.
- Trigger criteria deliberately use measured metrics (latency, user count, pool saturation), not estimates. The team can argue about whether the threshold is right, but not about whether the trigger has fired.
- Shorter token TTL was on the original RF-14 question list — declined here because it solves a different problem (token freshness for permission changes), not middleware DB load. Q1 already chose per-request re-validation precisely to avoid waiting for token TTL to surface permission changes.
- Full session details in `devlog/convo-047-v2-rapid-fire-rf14.md`.

---

## RF-15. Cache invalidation strategy (future Redis)

**Why it matters:** If/when RF-14 activates Redis caching for membership lookups, stale cache entries become a security and UX issue — a revoked user who's cached as "active member" continues to access the org until the cache TTL expires.

**Decision: deferred to v3, activates together with RF-14's Redis work.** ✅

v2 has no cache to invalidate. The detailed invalidation design (pub/sub broadcast, write-through vs. write-around, per-key TTL fallback) is locked at the v3 activation moment, not pre-emptively. Sketched in RF-14's "What v3 work looks like" section; full design happens when RF-14's trigger criteria fire.

**Why not designed in more detail now:** the right invalidation pattern depends on the concrete cache topology chosen at activation time (single Redis vs. cluster, multi-region vs. single, pub/sub via Redis vs. via the existing alert pipeline). Pre-designing without knowing the topology produces decisions that get re-litigated at activation.

**Parked in `upgrades.md`** alongside RF-14's v3 items.

---

## RF-16. Cognito swap future-proofing (preserving `users.id` mapping)

**Why it matters:** Q1 + `dev-standards.md` §8 already abstract the auth API surface behind an `AuthService` interface — swapping Cognito for Auth0 / Clerk / self-built JWT is a new implementation + one DI line for code paths. But Q13 locked **`users.id` = Cognito `sub` (UUID v4)** — a tight DB-level coupling that the interface abstraction can't fix. If we swap providers tomorrow, every FK in the system pointing at `users.id` (`user_orgs.user_id`, `tickets.created_by`, `comments.author_id`, every `assigned_to` / `updated_by` / `owner_id` column across all tenant tables) becomes orphaned because the new provider's sub-equivalent values don't match our existing IDs. "Swap" stops being a one-line DI change and becomes a months-long system-wide data migration. RF-16 closes this — locks the industry-standard decouple of internal-user-ID from external-auth-ID — so the swap stays mechanical regardless of why or when we do it (cost, vendor lock-in concern, customer requirement for non-AWS-resident auth, etc.).

**Options for the user identity model:**
- **A. Decouple: `users.id` = internal UUID v7 we generate; `users.external_auth_id` = whatever the current provider's user_id is.** `loadUser` queries by `external_auth_id` (resolved from JWT), returns `users.id` to app. Provider-agnostic schema.
- **B. Status quo (Q13): `users.id` = Cognito sub directly.** Saves one column. Swap is a months-long FK chase.
- **C. Composite key (`(provider, external_id)`) as PK.** Allows multi-provider simultaneous use. Way more than v2 needs — overkill.

**Options for provider-specific state (e.g. `custom:current_org_id`, `email_verified`):**
- **D. Stays in provider metadata, abstracted via `AuthService.verifyAccessToken()` returning a normalized shape.** Each provider's `AuthService` impl knows where to read/write its provider's metadata system. Middleware reads only the normalized shape.
- **E. Mirror into our DB (e.g. `users.current_org_id` column).** Provider-independent storage. But conflicts with Q1's session model — token-based per-session org context lets multi-device sessions independently act as different orgs (until their tokens refresh and pick up the latest attribute). DB column would force a single global current_org_id per user, changing session semantics.
- **F. Don't worry about it; let each call site handle provider differences.** Defeats the abstraction.

**Options for SDK access discipline:**
- **G. No raw provider SDK imports outside the concrete `AuthService` implementation.** Codified in `dev-standards.md` §8. Review-rejected if a controller imports `@aws-sdk/client-cognito-identity-provider` directly. Forces all Cognito-specific behavior into one swappable module.
- **H. Allow SDK access anywhere, rely on developer discipline.** Always erodes; provider-specific code creeps into controllers; swap is a grep-and-fix exercise.

**Tradeoffs:** A is the industry standard (Auth0, Clerk, Stytch all explicitly recommend it for exactly this reason). B is the "we'll deal with it when we swap" answer — fine until you actually swap, at which point it costs months. C is over-engineered for a system that uses one provider at a time. D preserves Q1's per-session model and works with any provider that has user metadata (which is every major provider). E quietly changes session semantics — single global current_org_id per user instead of per-token — and breaks the storage model that RF-1 / RF-13 are built on. F erodes the abstraction. G makes the abstraction enforceable at review time. H is wishful thinking.

**Decision: A + D + G.** ✅ Decouple internal ID from external auth ID + provider-specific state stays in provider metadata behind `AuthService` normalization + no raw provider SDK access outside the concrete impl.

**Concrete v2 shape:**

1. **Schema:**
   - `users.id` = UUID v7 (we generate via the `uuidv7` npm package, same as `organizations.id` and `subscriptions.id` per Q13's pattern).
   - `users.external_auth_id VARCHAR NOT NULL UNIQUE` — stores the Cognito `sub` today, gets updated per-user on any future provider swap.
   - `users.email VARCHAR NOT NULL UNIQUE` — separate, universal across providers.
   - UNIQUE index on `external_auth_id` (drives `loadUser`).
2. **`loadUser` flow:**
   ```sql
   SELECT id, email, ... FROM users WHERE external_auth_id = $1
   ```
   Where `$1` = the `sub`-equivalent claim returned by `AuthService.verifyAccessToken()`. Middleware never queries `users` by the raw provider sub — always by the normalized `external_auth_id` value.
3. **`AuthService.verifyAccessToken()` normalization contract** (locked in `dev-standards.md` §8):
   ```ts
   {
     externalAuthId: string,    // provider sub / user_id, raw value
     email: string,
     emailVerified: boolean,
     currentOrgId: string | null  // resolved from provider metadata (Cognito attribute / Auth0 app_metadata / Clerk privateMetadata / etc.)
   }
   ```
   Middleware reads only these four fields. Never touches raw JWT payload, never branches on provider type.
4. **`dev-standards.md` §8 discipline:** no raw provider SDK imports outside `backend/modules/auth/cognito-auth.service.ts` (and future provider equivalents). Review-rejected if a controller, model, or any non-auth module imports `@aws-sdk/client-cognito-identity-provider` directly.
5. **Swap-day procedure** (captured here for future reference):
   1. Write new provider's `AuthService` impl (e.g. `Auth0AuthService`) implementing the same interface.
   2. Per-user migration script:
      - Create user in new provider, capture new external user_id.
      - Copy `current_org_id` from old provider's metadata to new provider's metadata system.
      - `UPDATE users SET external_auth_id = $newExternalId WHERE id = $userId`.
   3. Reconfigure federation (Google/MS SSO) in new provider's console.
   4. Re-template welcome / password-reset emails in new provider (or keep using SES directly, depending on provider).
   5. One DI wiring change: bind `AuthService` to `Auth0AuthService` instead of `CognitoAuthService`.
   6. Deploy. All FKs in the system remain intact (every FK still points to `users.id`).

**Touch-point migration map** (full enumeration of where provider-specific state intermingles with the system, captured for swap-day reference):

| # | Touch point | Today | Under RF-16 |
|---|---|---|---|
| 1 | `users.id` | = Cognito sub (UUID v4) | = our UUID v7 |
| 2 | `users.external_auth_id` | (didn't exist) | = Cognito sub today, swappable |
| 3 | `users.email` | mirror of Cognito email | No change. Universal. |
| 4 | `custom:current_org_id` Cognito attribute | active org per user | Stays in provider metadata; `AuthService.switchOrg()` + `verifyAccessToken()` abstract. Migration script copies value per user on swap. |
| 5 | JWT `sub` claim | resolves identity | `AuthService.verifyAccessToken()` normalizes to `externalAuthId`. |
| 6 | JWT `custom:current_org_id` claim | per-request org context | Normalized to `currentOrgId`. |
| 7 | JWT `email_verified` claim | gates Q7 verify-before-action | Normalized to `emailVerified`. |
| 8 | `withCognitoBackoff` (RF-2) | retries Cognito throttles | Helper stays; provider-specific error-code matchers swap. |
| 9 | Federation config (Google/MS SSO — RF-7) | Cognito user-pool toggle | Re-configured in new provider's console. All major providers support both. |
| 10 | SES for Cognito-managed emails | welcome / password-reset templates | Either keep SES (it's AWS, separate from Cognito) and point new provider's templates at it, or use new provider's built-in email. App-sent emails (RF-12 invites) are SES-direct, unaffected. |
| 11 | `AdminGetUser`, `AdminUpdateUserAttributes`, `AdminDeleteUser`, `AdminSetUserPassword` | Cognito admin SDK calls | All wrapped inside `CognitoAuthService`. New provider's impl uses its admin SDK. |
| 12 | `AdminListUserAuthEvents` (parked for v3 active-sessions UI) | Cognito event history | Same abstraction; new provider's equivalent audit API. |

**Companion locks under RF-16:**
- **Q13 revision** — `users.id` strategy updated from "UUID v4 (Cognito sub)" to "UUID v7 (we generate)". `users.external_auth_id` added to the schema as a new column. Q13's discussion notes annotated with a pointer to RF-16.
- **`dev-standards.md` §8** gains the `AuthService.verifyAccessToken()` normalized-shape contract + the "no raw provider SDK imports outside the concrete impl" rule.
- **Migration discipline:** the v2 migration creates `users` with the decoupled shape from day one. No retrofitting needed (Q4 drop-and-reseed makes this free).

**What this does NOT include:**
- **No simultaneous multi-provider support.** v2 (and v3) run one auth provider at a time. Composite-key approach (Option C) is rejected as over-engineering — if we ever need to support, say, Cognito for some users and self-built JWT for others, that's a separate architecture decision, not RF-16.
- **No abstract `MetadataStore` interface.** `current_org_id` lives in provider metadata; each `AuthService` impl knows how to read/write it. We don't need a third abstraction layer between AuthService and the provider's metadata system — AuthService already is that layer.
- **No swap-day automation in v2.** The migration script gets written when we actually need to swap. RF-16 just ensures the script's job is small (per-user UPDATE) rather than impossible (system-wide FK rewrite).

**Discussion notes:**
- User asked whether the new provider needs custom-attribute support for `current_org_id` to work — answered yes, but it's table stakes: Auth0 has `app_metadata` / `user_metadata`, Clerk has `publicMetadata` / `privateMetadata`, Stytch has `trusted_metadata` / `untrusted_metadata`, self-built JWT just uses our DB. No real concern.
- User asked for a full enumeration of "mixed columns" — the touch-point table above is the answer, captured for swap-day reference.
- User explicitly framed the goal: "easily swapable architecture we needed in here." RF-16 makes this true. Without RF-16, the AuthService interface (Q1) gives the *appearance* of swap-ability while the DB coupling silently makes swap painful.
- The Option E alternative (mirror `current_org_id` to a `users.current_org_id` DB column) was considered and rejected — would conflict with Q1's per-token session model, which RF-1 / RF-13 / RF-6 are all built on. Each token = one session = one "acting as org X" context. Moving to a global per-user current_org_id breaks that.
- The naming choice `external_auth_id` (not `cognito_sub`, not `auth_provider_id`, not `idp_user_id`) was deliberate — provider-agnostic so swap doesn't require a column rename. Industry-standard term.
- Cognito's federated identities (Google/MS SSO logins per RF-7) all produce a single Cognito `sub` per user via Cognito federation — so `external_auth_id` is still one value per user even with multiple federation paths. RF-16 doesn't introduce any complication for the SSO flows.
- Full session details in `devlog/convo-048-v2-rapid-fire-rf16.md`.

---

## RF-17. Sensitive-action gate — custom email-OTP (not Cognito MFA) for v2

**Decision:** Gate the three irreversible high-impact actions — **org delete, ownership transfer, project delete** — behind a **self-issued, single-use email OTP**, shipped in v2. Reason: it delivers the "OTP on destructive actions" intent *now* without the Cognito-MFA dependency (which needed MFA enrollment + Advanced Security tier first).

**Mechanics:** new `otp` backend module. `POST /api/v1/otp/request {action, targetId}` mints a 6-digit code, stores only its SHA-256 hash (`otp_challenges`, migration 017), emails the plaintext to the caller. The action endpoint takes `otpCode` in its body and calls `verifyActionOtp()` **after** its role check, **before** the mutation. Code is bound to `(user, action, targetId)`, single-use, 10-min TTL, 3-attempt cap; a resend retires the prior code; the request route has its own 5/10-min/IP limiter (every call emails).

**Discussion notes:**
- **Replaces** the v2 typed-name / typed-email confirmation for these three flows (the `OtpConfirm` component swaps the old text-guard input).
- **Deviation from the parked plan** (`upgrades.md` § OTP gate): that plan assumed a Cognito MFA challenge gated on enrolled MFA. We decoupled — a backend email code needs no enrolled second factor, so the gate ships independently. The Cognito-MFA upgrade stays parked as future hardening.
- **Authorization split:** `/otp/request` does **not** check whether the caller may perform the action (it only emails their own address); the execution endpoint re-checks role + code. Minting a code you can't use is harmless.
- **Extensible:** the gated set is an allowlist (`otp/otp.types.ts`). **Billing** actions (cancel subscription, change billing email) reuse it when Phase 4 lands — add an action key + wire the controller.
- Reuses the existing SES sender (no new env/infra). Codified in `backend/guide - backend.md` § Sensitive-action OTP; API in `Api-Documentation/otp-api/`.

---

## How to use this doc

Work through questions in roughly this order — earlier ones constrain later ones:

1. **Q1 (multi-org per user)** — biggest impact, blocks schema design ✅ decided (all sub-decisions, AWS Cognito as auth provider)
2. **Q2 (URL strategy)** — ✅ decided (path-based; subdomain deferred)
3. **Q3 (tenant isolation)** — ✅ decided (middleware-only for v2; RLS deferred)
4. **Q4 (existing v1 data)** — ✅ decided (drop and reseed; 30-day legacy v1)
5. **Q5 (admin tiering)** — ✅ decided (two-tier: admin / project_manager / user)
6. **Q6 (invite flow)** — ✅ decided (single token, two paths; code-based deferred)
7. **Q7 (email verification)** — ✅ decided (verify before any org action; Cognito toggle)
8. **Q8 (RDS migration timing)** — ✅ decided (Docker → fresh RDS at staging cutover)
9. **Q9 (Cognito pool)** — ✅ decided (single pool, locked at Q1)
10. **Q10 (free trial card on file)** — ✅ decided (no card; 30-day trial; v3 adds card requirement)
11. **Q11 (subscription expiry behavior)** — ✅ decided (indefinite read-only on expiry; pre-expiry emails; end-of-period cancellation; per-seat INR monthly via BillingProvider adapter; internal admin panel committed)
12. **Q12 (service layer decomposition)** — ✅ decided (modular monolith; service-file-only cross-module imports; no top-level services folder; opt-in service files; billing designed for future microservice peel-out)
13. **Q13 (migration order + ID format)** — ✅ decided (drop + recreate; mixed format: UUID v4 for users/Cognito, UUID v7 app-side for orgs/subscriptions, BIGSERIAL for tenant tables; opaque PKs + slug for orgs; `projects.key` now per-org unique; BIGINT cast to JS `number` via pg type parser)
14. **Q14 (org deletion / retention)** — ✅ decided (v2 indefinite retention; v3 introduces 1-year retention → hard delete; slug locked during retention; reactivation by any-admin-at-cancel; pre-deletion email warnings; self-serve 2FA hard delete satisfies GDPR; backups at infra layer)
15. **Q15 (last admin leaves)** — ✅ decided (block + "contact support" message)
16. **Q16 (`org_id` index audit)** — ✅ decided (action item)

**Deferred — to be handled in a focused future conversation:**
- Q13 ID format (mixed vs all-UUID — needs more thought)

**Capture convention** (so this doc stays self-sufficient if memory is lost):
- `**Decision:**` line — the answer + one-line reason. Reason matters more than the answer.
- `**Discussion notes:**` block — alternatives considered and rejected, industry references, companion rules / cross-doc pointers (e.g. "codified in `dev-standards.md`"), and any deferred follow-ups. The goal is that re-opening this doc cold reproduces the chat that led to the decision.

After all decisions are locked: sequence Phase A sub-phases concretely (schema → backfill → org_id columns → middleware → query helpers → RLS later), then code one sub-phase at a time.

**Capture convention** (so this doc stays self-sufficient if memory is lost):
- `**Decision:**` line — the answer + one-line reason. Reason matters more than the answer.
- `**Discussion notes:**` block — alternatives considered and rejected, industry references, companion rules / cross-doc pointers (e.g. "codified in `dev-standards.md`"), and any deferred follow-ups. The goal is that re-opening this doc cold reproduces the chat that led to the decision.

After all decisions are locked: sequence Phase A sub-phases concretely (schema → backfill → org_id columns → middleware → query helpers → RLS later), then code one sub-phase at a time.
