# Convo 030 — v2 Decisions Q1 & Q2 + Cognito Pivot + Doc Restructure

**Date:** 5 May 2026

---

## What was discussed

Walked through the first two of v2's 16 architecture questions in `docs/v2-decisions.md`. Mid-session pivot from self-built JWT to AWS Cognito for v2 auth. Doc structure reorganized — new `upgrades.md` introduced.

---

## Decisions locked

### Q2 — URL strategy for tenancy

**Locked: B — path-based, `rai.app/orgs/<slug>`.** Vanity subdomains (`acme.rai.app`) deferred to a later release as an infra-only migration (no schema/JWT/code changes; just wildcard SSL + wildcard DNS + cookie scope + CORS + redirects).

Companion rule (codified in `standards.md` §2):
- `org_id` is sourced from the JWT, never from `req.params` or URL path. URL slug is decorative and must match the JWT's `org_id` or middleware returns 403.
- This single rule is what keeps the path → subdomain migration as a config/infra change, not a rewrite.

Migration checklist for the future subdomain switch is in `deployment.md`.

Rejected: `rai.app/<slug>` (no `/orgs/` prefix) — system routes (`/login`, `/api`, etc.) live at the same path level, forcing a permanent reserved-slug blocklist.

### Q1 — One user → many orgs

**Locked: B — one user, many orgs.** Industry-standard pattern (Jira/Slack/GitHub/Notion/Linear/Asana). A→B migration later costs ~5x what B costs upfront.

Sub-decisions locked together:
- Schema: `user_orgs(user_id, org_id, role, joined_at, PRIMARY KEY(user_id, org_id))`.
- Org switcher: right-side profile dropdown listing user's orgs; "show more" if >10. Click → token swap → React Query cache clear → dashboard refetch. No login form.
- Auth middleware re-checks `user_orgs` membership + `organizations.subscription_status` per request — never trusts the token claim blindly. Handles mid-session removal and expired subscriptions.
- Subscription is org-level; members inherit. Admin → 402 with billing redirect on expiry; non-admin → 402 with "contact admin" message.
- Cross-tab sync via `storage` event listener on Amplify auth-related localStorage keys.
- `BroadcastChannel` parked as upgrade path for richer cross-tab messages.
- Middleware split into small single-purpose functions (`verifyCognitoJwt`, `loadUser`, `checkOrgMembership`, `checkSubscription`) in `src/middleware/auth/`. Each ~10–30 lines, unit-testable in isolation. Most security-critical code in the app — gets integration tests for every gate.

### Mid-session pivot — Auth provider: AWS Cognito (not self-built JWT)

Initially locked self-built JWT for v2: 15-min access TTL, sliding 7-day + absolute 30-day refresh, rotation, replay detection, family tracking, `refresh_tokens` table (jti + family_id + parent_jti + revoked_at + ...), `SELECT FOR UPDATE` row locks, axios in-flight dedup. ~300 lines of auth code.

User pushed back: doing JWT now then migrating to Cognito later was duplicate work. Pivoted to Cognito.

What v2 actually ships now:
- One Cognito user pool, `custom:current_org_id` user attribute carries current org.
- Backend: `aws-jwt-verify` validates Cognito tokens against the pool's JWKS endpoint.
- Frontend: `aws-amplify` SDK manages tokens (refresh handled internally).
- **No `refresh_tokens` table** — Cognito owns it.
- **No password column on `users` table** — Cognito owns passwords. `users` table is profile data keyed by Cognito's `sub` UUID.
- Org switch: `POST /api/v1/auth/switch-org` → backend `AdminUpdateUserAttributes` → frontend `Auth.currentSession()` refresh → new ID token reflects updated `custom:current_org_id`.
- Logout from all devices: `Auth.signOut({ global: true })` — sub-second, no Redis needed.
- Cognito gives free: password reset, email verification, account lockout, password strength enforcement, refresh-token rotation/families/replay detection/multi-device. Plus toggles for MFA and SSO when those features land.
- **Q9 (Cognito pool: single vs per-org)** implicitly locked: **single pool**, custom attribute distinguishes orgs.

Plug-and-play preserved via `AuthService` interface (`standards.md` §8):
- v2 implementation: `CognitoAuthService` (wraps Cognito + `aws-jwt-verify`).
- Documented fallback in `upgrades.md`: `JwtAuthService` (~300 lines, if we ever leave AWS).
- Frontend mirrors with `AuthClient` interface.

`current_org_id` injection method: **custom user attribute** (simpler). Pre-Token-Generation Lambda parked in `upgrades.md` as the "industrial strength" alternative for high-frequency org switches or richer per-token context.

### Local dev pattern locked

- **Local dev:** shared `rai-dev` Cognito pool. Each developer points local backend at it via `.env.local` — just env vars, no setup beyond that.
- **Unit tests:** `MockAuthService` implementing the same `AuthService` interface (bcrypt + local Postgres). Fast, offline, deterministic. Used only for tests, not for live local dev.
- **CI integration tests:** dedicated `rai-ci` Cognito pool that resets between runs.

### Auth fundamentals — what's in v2 vs deferred

In v2 (Cognito-managed configuration, not engineering work):
- Login rate limit (Cognito basic; Advanced Security tier for risk-based)
- Account lockout (Cognito pool policy)
- Password strength (Cognito pool policy)
- Password reset (`Auth.forgotPassword()` / `Auth.forgotPasswordSubmit()`)
- Email verification (Cognito built-in; Q7 to firm policy)

Deferred to `upgrades.md`:
- MFA (Cognito toggle when implemented)
- Active sessions UI (powered by Cognito's `AdminListUserAuthEvents`)
- Suspicious activity detection (Cognito Advanced Security tier)
- Comprehensive app-wide audit logging (separate `audit_logs` table)
- Third-party SSO (Cognito identity provider config)
- CSRF tokens beyond SameSite=Lax baseline

---

## Doc restructure

**New doc:** `docs/upgrades.md` — single source of truth for parked features AND alternative implementations. Two sections: Upcoming Features (parked items) and Alternative Implementations (swap targets — self-built JWT, Pre-Token-Generation Lambda, BroadcastChannel, Amplify cookie storage). Replaces the temporary "Deferred Features" section that briefly lived in `v2-plans.md`.

**Purpose headers** added to: `standards.md`, `deployment.md`, `v2-plans.md`, `v2-decisions.md`, `upgrades.md`. Each doc now opens with a one-paragraph "what this file is for" statement so navigation is obvious.

**`info.md` (project reference / folder structure):** docs list updated to include all docs that were missing (`standards.md`, `frontend-guide.md`, `rbac.md`, `log-guide.md`, `test-credentials.md`, `v2-plans.md`, `v2-decisions.md`, `upgrades.md`). Tech stack auth lines updated from "JWT + bcryptjs (self-built)" to Cognito + `aws-jwt-verify` + `aws-amplify` + `MockAuthService` for tests.

**`standards.md` updates:**
- §2 Backend Standards — added "Tenant scoping: JWT, never URL params" rule (v2 multi-tenant).
- §4 Security table — auth-endpoint rate limit row, account lockout row, password strength row all reframed as Cognito-managed config; bcrypt scoped to test-only `MockAuthService`; new row for Cognito user pool + JWKS verification.
- §7 Tooling Decisions table — Auth row inverted: Cognito primary, self-built JWT now listed as the fallback alternative.
- §8 Design Patterns — added "Service-interface abstraction for swap-ready infrastructure" pattern. v2 ships `CognitoAuthService` behind `AuthService` interface. Test fixture pattern documented (`MockAuthService` for unit tests).

**`v2-plans.md` updates:**
- Architecture Notes → URL strategy subsection (codifies path-based + JWT-as-tenant-source).
- Architecture Notes → Multi-org session model subsection (now Cognito-based).
- Phase E vanity subdomain bullet moved to `upgrades.md`.
- Deferred Features section replaced with pointer to `upgrades.md`.
- Purpose header added.

**`deployment.md`:** appended "Future: vanity subdomain migration" section with the 5-step infra checklist (wildcard SSL, wildcard DNS, cookie scope, CORS, 301 redirects). Purpose header added.

**`v2-decisions.md`:** Q1 + Q2 closed with full discussion notes. Decisions doc is now self-sufficient — re-opening cold should reproduce the conversation, not just the conclusions. Capture convention codified in the "How to use this doc" section: `**Decision:**` line + `**Discussion notes:**` block per question.

---

## Memories saved (auto-memory system)

- `feedback_no_phase_mentions.md` — don't reference v2 phase letters during decision discussions; phase mapping is a separate dedicated conversation after all 16 decisions lock.
- `project_v2_cognito.md` — v2 auth provider is AWS Cognito (not self-built JWT); single pool with `custom:current_org_id` attribute; `AuthService` interface keeps swap path open; local dev via shared dev pool; production has no password column.

`MEMORY.md` index updated.

---

## Conventions reinforced

- **Discuss in chat first → user verdict → capture decision + discussion notes in `v2-decisions.md` AND propagate consequences to `v2-plans.md` / `standards.md` / `upgrades.md` in the same response.** No scattered planning files.
- **`v2-decisions.md` is self-sufficient.** Future-cold-reads should be able to reproduce the chat. Each question has Decision + Discussion notes (alternatives considered, industry references, cross-doc pointers).
- **No "Phase A/B/C" labels in decision discussions.** Phase mapping is its own conversation after all decisions lock.
- **Parked items go to `upgrades.md`, not into phase listings.**

---

## Status

| | |
|---|---|
| Q1 (multi-org per user) | ✅ Locked — all sub-decisions including Cognito auth provider |
| Q2 (URL strategy) | ✅ Locked |
| Q9 (Cognito pool: single vs per-org) | ✅ Locked implicitly (single pool, locked at Q1) |
| Remaining | Q3 (tenant isolation), Q4 (v1 staging data), Q5 (admin tiering), Q6 (invite flow), Q7 (email verify timing), Q8 (RDS migration timing), Q10 (free trial card-on-file), Q11 (subscription expiry behavior), Q12 (service decomposition), Q13 (migration order), Q14 (org deletion semantics), Q15 (last admin leaves), Q16 (org_id index audit) |

---

## What's next

User to pick next question from `v2-decisions.md`. After all decisions lock, a separate dedicated phase-planning conversation re-sequences the work into concrete phases.
