# Convo 054 — Cognito handoff received, env files scaffolded, federation prep locked

**Date:** 20 May 2026

---

## What happened

First session back after convo-053. Devops handed over Cognito pool + app client. Walked the federation prep, scaffolded v2 env files with placeholders for the still-missing values, and locked two small but load-bearing decisions. No code written — still in pre-Phase-1 prep.

## Credentials received from devops

| Var | Value |
|---|---|
| `AWS_REGION` | `ap-south-2` |
| `COGNITO_USER_POOL_ID` | `ap-south-2_7Mg6KNdBA` |
| `COGNITO_APP_CLIENT_ID` | `s04a2smdd7dj1dcc8rcesgb7o` |
| `AWS_ACCESS_KEY_ID` | ⏳ pending (IAM access key generation from devops side) |
| `AWS_SECRET_ACCESS_KEY` | ⏳ pending |

Cognito setup walkthrough originally planned for this session was **skipped** — devops handled pool/client creation on their side.

## Env files scaffolded (with placeholders)

- `backend/.env` — full v2 shape. v1 `JWT_SECRET` / `JWT_EXPIRES_IN` removed (Cognito owns tokens). Placeholders for the 3 missing values (AWS keys + `COGNITO_DOMAIN`). Phase 3 SES/SNS vars commented out for now.
- `backend/.env.example` — clean template matching the new shape.
- `frontend/.env.local` — `NEXT_PUBLIC_AWS_REGION` + pool/app client IDs in place. `NEXT_PUBLIC_COGNITO_DOMAIN` placeholder for federation.

Master env blueprint (all phases, what's needed when) captured in chat — user has it as a checklist for future devops handoffs.

## Decisions locked this session

### 1. Federated account linking — backend lazy-sync (no Pre-Sign-up Lambda)

When a user signs up native then later signs in via Google or Microsoft with the same verified email, link both identities into one `users` row (don't create duplicates). Implementation in the lazy-sync step of `loadUser` middleware — if JWT email matches an existing verified `users.email`, call `AdminLinkProviderForUser` and reuse the existing `users.id`; otherwise insert a fresh row keyed by Cognito `sub`.

**Why backend over Lambda:** same reasoning as the lazy-sync-over-Lambda lock in convo-053. No extra AWS artifact, debuggable locally, idempotent and safe to retry. Required IAM perm: `cognito-idp:AdminLinkProviderForUser` (must be added to the dev IAM user policy).

Captured in: `docs/standards.md` §8 (new paragraph after the test fixture section).

### 2. Microsoft IdP — multi-tenant + personal accounts

Azure App Registration must select "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts" — the **third option**, not the default first one.

**Why:** customers will use their own Microsoft tenants. Single-tenant would only allow `@novetum.com` Microsoft accounts and reject everyone else at Microsoft's login screen. Wider IdP reach is safe because org membership is gated by our invite system (Q6).

Captured in: `docs/standards.md` §8 (same paragraph as above).

### 3. Repo split timing — deferred to end of all v2 work (not end of Phase 2)

User's call: monorepo stays through ALL phases. Repo split (`rai-backend`, `rai-frontend`) happens only after v2 is fully done. Convo-053's "split at end of Phase 2" plan is superseded.

**Why:** avoids context-switching overhead during build; the mobile-team-clean-API-view argument doesn't have a stakeholder yet.

Doc update for `docs/v2-plans.md` deferred to next session (no rush — it just removes a Phase 2 closing task).

### 4. Frontend look and feel — match v1 exactly

No theme, font, component, layout, or design changes in v2. v2 is a foundation rebuild underneath, not a UI refresh. Reuse v1's components/Tailwind config/styles as-is for all Phase 1+ pages. New UI only added where v2 introduces genuinely new flows (org switcher, invite accept page, settings tabs) — and even those use v1's visual language.

Captured in: memory `feedback_v2_frontend_match_v1.md`. No doc-side capture needed — it's a feedback rule, not an architecture decision.

## Standing reminders pulled forward

- **Critical Cognito + federation config gotchas** flagged to user (10-item table in chat):
  - App client must have NO client secret (SPA can't keep secrets)
  - Auth flows enabled: `ALLOW_USER_SRP_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`
  - "Prevent user existence errors" = ON
  - `custom:current_org_id` attribute exists on pool (mutable string)
  - Email = required + auto-verified primary attribute (not username)
  - IAM user policy includes `AdminLinkProviderForUser`
  - Azure redirect URI type = "Web" (not SPA/Public)
  - Azure ID token optional claim: `email` (forces inclusion)
  - Google OAuth consent screen stays in Testing mode for dev
  - All AWS services in `ap-south-2`
- New memory `feedback_surface_critical_config_choices.md` saved — going forward I bake non-default config callouts directly into walkthrough steps, not as afterthoughts.

## What lands when AWS keys arrive (next session — code wiring begins)

Sequential order locked:

1. **Schema migration** — new `users` (PK = Cognito `sub` UUID, no `password_hash`), `organizations`, `user_orgs` tables.
2. **Backend** — install `aws-jwt-verify` + `@aws-sdk/client-cognito-identity-provider`. Build `CognitoAuthService` implementing the `AuthService` interface from standards.md §8.
3. **Backend** — new auth middleware: verify JWT → lazy-sync `users` row via `ON CONFLICT DO NOTHING` (with email-match linking from decision #1 above) → check `user_orgs` + `organizations.subscription_status` per request.
4. **Backend** — delete v1 auth files (`backend/modules/auth/*`, `backend/middleware/authMiddleware.ts`) entirely. Cognito-from-day-1 lock from convo-053.
5. **Frontend** — install `aws-amplify`. Configure with `.env.local` values. New login/signup pages calling `Auth.signIn` / `Auth.signUp`. v1 has no `frontend/src/**/auth/**` files (greenfield).
6. **E2E smoke** — signup → Cognito email verify → login → backend validates JWT → `users` row lazy-created → `/me` returns user. Gate for Phase 1 proper to begin.

Federation wiring (Google + Microsoft buttons + Amplify oauth config) lands later in Phase 1, not blocking the auth core.

## Status going into next session

| Item | Status |
|---|---|
| v2 env scaffolding (placeholders) | ✅ |
| Federated account-linking pattern locked (lazy-sync, not Lambda) | ✅ |
| Microsoft tenancy choice locked (multi-tenant + personal) | ✅ |
| Frontend look-and-feel match-v1 rule | ✅ |
| Repo split timing (end of all v2, not Phase 2) | ✅ |
| `docs/v2-plans.md` Phase 2 closing-task removal | 🔜 (next session, small) |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` from devops | 🔜 |
| Cognito federation wiring (Google + Microsoft IdPs + hosted domain) | 🔜 (devops side; not blocking auth core) |
| Verify the 10 Cognito + federation gotchas with devops | 🔜 |
| **Phase 1 auth core wiring (schema → backend → frontend → smoke)** | 🔜 (unblocked once AWS keys land) |
