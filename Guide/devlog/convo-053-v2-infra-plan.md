# Convo 053 — v2 infra plan locked

**Date:** 19 May 2026

---

## What happened

First session back after the convo-052 wrap. Walked the full v2 infra plan end-to-end, locked the shape, and updated four docs. Discussion-mode throughout — no code written.

User's framing: v1 app behavior stays as-is functionally; **infra is what changes for v2**. v1 collapsed frontend + backend + Postgres into one Docker container on EC2 with no external DB visibility (debugging pain). v2 separates everything so each piece scales, debugs, and replaces independently.

## Decisions locked

### Topology

```
GoDaddy DNS (kept; no Route 53)
├─ app.rai.app          → CloudFront → S3 (frontend prod)
├─ staging.rai.app      → CloudFront → S3 (frontend staging)
└─ api.rai.app          → EC2 (v2 day-1, Nginx+certbot) | ALB later → Docker → Node
                                                                       ↓
                                                            RDS PostgreSQL (private subnet)

Side rails: Cognito · SES · SNS · Secrets Manager · CloudWatch · ACM · IAM
```

### Component choices (with why)

| Decision | Choice | Why |
|---|---|---|
| Frontend hosting | S3 + CloudFront | Industry standard, predictable, cheaper than Amplify (user had bad Amplify experience). |
| Backend hosting | EC2 + Docker (single container) | Docker = dev/prod parity. ECS premature for one EC2. Docker as wrapper only — RDS/SES/Cognito/SNS all external. |
| Backend TLS day-1 | Nginx + certbot on EC2 host | Same pattern as v1, known-working. Skip ALB until scale justifies. |
| Backend TLS later | ALB + ACM | Add when sustained CPU/mem > 70% or response-time degrades. ~$16/mo. |
| DB | RDS PostgreSQL 16 | Multi-AZ for prod, single-AZ staging. Aurora deferred (~3× cost, swap target in upgrades.md). |
| DB debug access | SSM Session Manager port-forward | No public DB IP, no bastion, no extra cost. |
| Repos | Separate: backend, frontend, mobile-later | Mirrors infra split; mobile v3 team gets clean API consumer view. |
| DNS | GoDaddy (kept) | No Route 53 migration. GoDaddy A/CNAME → CloudFront / EC2 works fine. |
| NAT Gateway | Avoided | ~$32/mo for nothing — backend in public subnet with SG locked down. |
| CI/CD | Manual deploy script | Real pipeline parked to v3 / post-prod-stabilization (per user). |

### SES vs SNS clarified (both used, different purposes)

| | SES | SNS |
|---|---|---|
| Sends | Product emails to **users** | Ops alerts to **devops/on-call** |
| Examples | Signup verify, password reset, invite | CloudWatch alarm → email |
| Wired via | Backend `email.service.ts` | Devops console (alarm → topic → subscriber) |

### Statelessness made strict

Single stateful piece found in v1 backend: `backend/middleware/rateLimiter.ts` uses `express-rate-limit` with its in-memory default. Would break on multi-EC2.

**Swap moved INTO v2 build (not a future upgrade):** `express-rate-limit` + `rate-limit-postgresql` PostgresStore against existing RDS. ~3 lines of code change. Single counter truth across instances from day-1.

Other Maps in v1 (`projects.types.ts:250`, `reports.model.ts:74`) are request-scoped and garbage-collected — stateless ✅.

User: "i dont want to keep small things as counter for later thing so v1 upgrade we will do while doing coding of v2."

### Scaling strategy locked

Vertical first → horizontal second.

1. **Vertical:** t3.medium → t3.large → t3.xlarge. One click. Covers most spikes.
2. **Horizontal:** ALB + multi-EC2. Works zero-config because backend is strictly stateless.
3. **DB:** RDS instance class up → Aurora swap → read replicas (parked in upgrades.md under RF-14).

### Security checklist locked

1. HTTPS only (ACM on CF, certbot/ACM on EC2/ALB).
2. RDS in private subnet — backend SG only.
3. Secrets in Secrets Manager — no `.env` on disk.
4. SSH disabled, SSM Session Manager only — close port 22.
5. CloudFront WAF basic rate-limit.
6. CloudWatch alarms (5xx, DB CPU, DB connections, reserved log markers) → SNS → email.
7. RDS automated daily backups + manual snapshot before each migration.
8. IAM least-privilege per env.
9. Logs scrubbed (no passwords, tokens, full bodies).

### Data migration v1 → v2

No real migration. v1 schema (no `org_id`) is too different. User's pragmatic call: keep v1 EBS snapshot as cold archive until v2 ships to prod; if a customer needs old data, look up in the snapshot and manually insert into v2.

### Health check + log shipping

- `/health` endpoint already exists in v1 (`backend/modules/health/`). Carries over to v2 as-is — ALB points at it when ALB lands.
- Log shipping: same pattern as v1 — Docker `awslogs` driver → CloudWatch. Per-env log group.

## What landed where

**Modified:**

- `docs/deployment.md` — new section "v2 Infra Architecture & Devops Handoff": topology, component spec (with notes for devops), SES vs SNS, TLS strategy, scaling order, security checklist, full per-env handoff sheet (staging values; prod mirrors with bigger numbers).
- `docs/standards.md` §1 — "Stateless backend" → "Stateless backend (strict)" with a table of allowed / banned patterns. Rate-limiter swap codified as v2 build scope.
- `docs/standards.md` §4 — rate-limiting row updated to reflect Postgres-store swap (no longer "in-memory exception").
- `docs/standards.md` §7 — tooling-decisions row for rate limiting updated.
- `docs/upgrades.md` — added five swap targets under Alternative Implementations: ALB+multi-EC2, ECS/Fargate, Aurora, Route 53, Redis rate-limiter store. Each with: currently / alternative / why we'd swap / why not v2 / migration path.
- `docs/v2-plans.md` — added Phase 0 ("Infra setup") before Phase A. Captures per-env devops checklist, repo-split work, rate-limiter swap as build-phase scope, scaling triggers.

**Not modified:**

- `docs/v2-decisions.md` — these are infra/operational choices, not Q-decisions or RF-decisions. They live in deployment.md (operational) + upgrades.md (swap targets) + v2-plans.md (build phase).
- `docs/rbac.md` — no RBAC changes.
- `docs/notifications.md` — no notification changes.

**Memory:** no new entries this convo. Existing memories ([[project_hosting_plan]], [[project_v2_multitenant]], [[project_v2_cognito]], [[project_v2_alert_pipeline]], [[feedback_v1_stays_as_is]], [[feedback_walkthrough_style]]) cover everything discussed.

## Late-session additions (same day, after infra lock)

After locking infra, the session continued and locked phase re-sequencing, coding kickoff workflow, folder/git strategy, and Cognito-from-day-1.

### v1 module-by-module classification — SKIPPED

User's call: every v1 module carries over with `org_id` retrofit; very few rewrites (auth module is the only major rewrite — bcrypt out, Cognito in); nothing drops. Walking each module would be performative. Items that need attention surface naturally during build.

New memory landed: [[feedback_mid_build_quick_discussions]] — items that come up during build get quick inline discussions, not separate sessions.

### Phase sequence locked (Phase 0 + Phase 1–5)

Tightened from old A-F (with Phase E moved to v3 entirely) to 5 active phases plus parallel infra:

| Phase | Scope |
|---|---|
| **0** | Infra (devops parallel) |
| **1** | Foundation — Cognito wiring, multi-tenant schema, middleware chain, signup/email-verify/org-create, login/logout/password-reset, invite system, RBAC, org switcher, main layout, Google + Microsoft SSO, seed script, rate-limiter swap |
| **2** | Multi-tenant retrofit of v1 modules + v1 feedback items batched in |
| **3** | Notifications (module + ~22 templates + cron jobs except billing-related + preferences UI) |
| **4** | Billing (subscriptions schema + NoOpBillingProvider + trial flow + pre-expiry warnings + read-only enforcement + owner-transfer) |
| **5** | Polish (theme, sprint notes, AI button, mobile-friendly view, data export, R&D) |

v3 (out of v2 scope): GitHub SSO, SAML/OIDC, mobile app, audit logs, Teams plugin, internal admin panel, real billing provider, push notifications, manage-devices UI, vanity subdomains.

User's reasoning for splitting notifications + billing into separate phases (vs the original lumped "Must-Have Functionality"): clarity. Each phase is one focused thing.

### Coding kickoff workflow (per phase)

User's strategy: shell → user review → APIs → wire → user tests end-to-end → fix → next phase. No mock data ever; prod-quality from day one (matches v1's build approach). Locked in `v2-plans.md` "Coding kickoff workflow" section.

### Cognito-from-day-1 (no MockAuthService in production paths)

User confirmed: v1 self-built JWT + bcrypt-on-production-users deleted entirely. Cognito wired in from local dev itself via shared `rai-dev` pool. `MockAuthService` retained only as a test fixture (unit tests against bcrypt + local Postgres for fast offline tests) — never on production code paths. Standards.md §8 was already aligned to this; no doc changes needed beyond the v2-plans.md phase scope.

### Folder + repo split strategy

User's plan: keep working in current `Rai/` folder (backend + frontend already in subfolders). Init separate git repos in `backend/` and `frontend/` subfolders upfront (not at end-of-build, to avoid working without commits for months). Parent `Rai/` `.git` stops tracking those subfolders via `.gitignore`. Workflow identical to v1; commits flow to two new GitHub remotes (`rai-backend`, `rai-frontend`).

Commands captured in chat — user runs them manually per [[feedback_user_commits_manually]] (new memory).

### Cognito setup walkthrough — deferred

User flagged Cognito setup as a beginner topic. Standalone walkthrough session will happen when Phase 1 coding starts (or right before, as the very first thing in the build). Devops creates the pools; user needs to understand the moving parts (user pool, app client, federated identity providers, custom attribute, hosted UI off, etc.).

### Recall confirmed: @acme.com SSO behavior (RF-7)

User asked recall question — confirmed: federated sign-in via Microsoft as `dip@acme.com` does **not** auto-join the Acme org. User becomes a Cognito identity, gets auto-linked to existing native account if emails match + both verified, but org membership still requires invite (Q6). Domain-based auto-join parked in `upgrades.md` for v3+.

### Six small but-don't-forget infra items

Added to `deployment.md`: CloudFront cache invalidation on deploy, S3 uploads bucket versioning, AWS Budgets alarm, external uptime monitor (UptimeRobot free tier), Docker `--restart unless-stopped`, default `pg` pool size guidance.

### Seed credentials

2 orgs × 4 roles (owner / admin / PM / user) = 8 test users for local dev. Lives in `backend/scripts/seed-dev.ts`. Appends to the existing test-creds file (keeping v1 entries intact). Noted in `v2-plans.md` Phase 1 scope.

---

## Final session additions (Q&A round before kickoff)

User worked through several clarifying questions in succession to fully understand the Cognito setup + auth migration. All decisions captured:

### Lazy-sync over post-confirmation Lambda

Locked in `deployment.md` and `v2-plans.md` Phase 1 scope. Reasoning:
- Lambda would need to HTTP-call our backend → for local dev that'd require ngrok/port-forwarding (Lambda runs on AWS public infra, can't reach `localhost:4000`).
- Lazy-sync = backend creates `users` row on first authenticated request via `ON CONFLICT DO NOTHING` in the `loadUser` middleware step. ~10 lines, fully idempotent, every request retries until success.
- Concrete flow:
  ```
  loadUser middleware:
    SELECT * FROM users WHERE id = $jwtSub
    if not found:
      INSERT INTO users (id, email, created_at) VALUES (...) ON CONFLICT (id) DO NOTHING
      re-SELECT
    attach to req.user
  ```

### SES deferred to Phase 3

Cognito's built-in default sender (5/day cap, generic `no-reply@verificationemail.com`) covers Phase 1 testing. SES verified sender domain setup moves to Phase 3 alongside the rest of product email wiring. Captured in `v2-plans.md` Phase 1 + Phase 3 scope.

### Seed script deferred to Phase 2

User's call: skip seed entirely for Phase 1; manual signup via the UI tests the real signup flow. Seed becomes useful in Phase 2 when known-state across orgs/users/projects is needed for RBAC + multi-tenant feature testing. When it lands: Cognito `AdminCreateUser` with `MessageAction=SUPPRESS`, `email_verified=true`, `AdminSetUserPassword(Permanent=true)`. Captured in `v2-plans.md` Phase 2 scope.

### Local SSO callback URLs work without port-forwarding

User's concern: "if Cognito needs to call backend in localhost we need port-forwarding nah?"

Clarified: OAuth/SSO is **browser-mediated**, not server-to-server. User clicks "Sign in with Google" → user's browser navigates through Cognito → Google → back to Cognito → back to `http://localhost:3000/auth/callback`. Cognito never calls localhost directly. Standard OAuth/OIDC flow. Localhost callback URL works fine for local dev.

The only Cognito → backend server-to-server case would be a post-confirmation Lambda (which we skipped via lazy-sync) — that one would have needed port-forwarding for local dev. Another reason lazy-sync wins.

### Old `rai` repo handling

Locked plan: stay active for v1 hotfixes only until v2 has been stable in prod for ~2 months. Pin `v1.0.0` tag now (recoverable known-good point). README pointer to `rai-backend` + `rai-frontend`. Archive on GitHub (read-only) only after v2 retires v1. Captured in `v2-plans.md` Phase 0 "Repo-split work" section.

### Local → staging data dump procedure

Captured in `deployment.md` § "Local → staging data dump (after all phases ship to staging)". Three commands (SSM port-forward + `pg_dump` + `pg_restore`). Caveats: Cognito users don't carry (different pools), sequences auto-reset, migrations-first if schema drifted. Recommended path: **first staging launch = fresh signup via real Cognito + SES** (tests the real flow); dump-and-restore is for later staging seeding.

### Devops local-dev minimum codified

7-step checklist in `deployment.md` § "Local dev minimum" — Cognito pool + IAM user + access keys + shared config. ~30 min devops work. No EC2/RDS/S3/CloudFront/SES/SNS/ALB needed yet — those are staging-and-beyond.

### Env split locked

- **Backend `.env`:** AWS access key + secret + region + pool ID + app client ID + DB URL.
- **Frontend `.env`:** pool ID + app client ID + region only (no IAM creds — frontend never makes Admin calls).
- **Nowhere:** secrets in code, Slack, screenshots.

### IAM concept made concrete

User asked "what does IAM have to do with Cognito huh is this because someone needs to change custom attributes they need permission huh?" — yes, exactly. IAM = permission badge for "what this thing is allowed to do in AWS." Cognito checks IAM permissions before allowing Admin API calls. Local dev = IAM user with access keys; prod = IAM role on EC2.

---

## Status going into next session

| Item | Status |
|---|---|
| Q1–Q16 strategic | ✅ |
| RF-1 to RF-16 rapid-fire | ✅ |
| RBAC pass | ✅ |
| v1 feedback walk-through | ✅ |
| Notifications architecture | ✅ |
| Scheduling pattern | ✅ |
| Mobile-API-compat | ✅ |
| Background-jobs file structure | ✅ |
| EventBridge + Lambda v3 evolution | ✅ |
| v2 infra topology + devops handoff | ✅ |
| Statelessness strict rules + rate-limiter v2-build swap | ✅ |
| Scaling triggers + swap targets | ✅ |
| Phase sequence (0 + 1-5) | ✅ |
| Coding kickoff workflow | ✅ |
| Cognito-from-day-1 + MockAuthService for tests only | ✅ |
| Folder + repo split strategy + old-repo handling | ✅ |
| Lazy-sync over Lambda | ✅ |
| SES → Phase 3, Seed → Phase 2 | ✅ |
| Devops local-dev minimum (7-step list) | ✅ |
| Local → staging dump procedure | ✅ |
| **Cognito setup walkthrough (live, in AWS Console)** | 🔜 NEXT |
| **Phase 1 coding kickoff** | 🔜 |

## Resume context (next session)

**Repo-split timing changed mid-session — now deferred to end of Phase 2** (not start). v2 development happens in the existing `Rai` monorepo through Phase 1 + Phase 2; split happens once v2 runs end-to-end. Reason: mid-dev split = double-commits across two repos for every logical change. Captured in `v2-plans.md` Phase 0 + Phase 2.

User's order before coding starts:

1. ✅ **Done:** commit all doc updates to current `Rai` repo on `developement` branch (commit `bbe3ed3`).
2. ✅ **Done:** `rai_v2` database created in local Docker Postgres (alongside untouched `rai_db` and `rai_test_db`).
3. **Devops (in progress, ~30 min):** the 7-step "Local dev minimum" in `deployment.md`. Output: pool ID, app client ID, region, IAM access keys delivered securely.
4. **Next chat session:** live Cognito setup walkthrough (10 steps), wire `CognitoAuthService` (backend) + Amplify (frontend), verify signup → email verify → login → JWT verify → org switch end-to-end. All work commits to the current `Rai` repo on `developement` branch.
5. **Phase 1 proper kicks off** — multi-tenant schema, middleware chain, org CRUD, invites, RBAC, main layout, Google + Microsoft SSO, rate-limiter swap. Still in monorepo.
6. **End of Phase 2:** split `backend/` and `frontend/` into `rai-backend` and `rai-frontend` GitHub repos. Docs stay in current `Rai` repo.

## Standing reminders for next session

- v1 stays untouched ([[feedback_v1_stays_as_is]]).
- Walkthrough style — file-by-file, plain language ([[feedback_walkthrough_style]]).
- Quick mid-build discussions for items that surface — never queue for separate sessions ([[feedback_mid_build_quick_discussions]]).
- Never run state-changing git commands — explain what user would run ([[feedback_user_commits_manually]]).
- Discuss before implementing ([[feedback_discuss_first]]) — including mid-coding mini-discussions.
- Devops owns infra setup; the handoff sheet in `deployment.md` is what they work from.
