# Convo 055 — Amplify SDK dropped; direct-fetch Cognito client; org creation + switcher; SES setup started

**Date:** 21 May 2026

---

## What happened

Long session. Started from convo-054's plan to wire Amplify v6 into the v2 auth core. Hit a hard wall: Amplify's `signIn` hangs in normal browsers because Webroot Identity Shield (and similar keystroke-encryption AVs) intercept the WebCrypto operations Amplify's auth state machine triggers before any HTTP call. ~4 hours debugging proved the hang is in Amplify pre-flight code, not network or Cognito. **Pivoted to a direct-fetch Cognito client.** No SDK, just typed `fetch()` against Cognito's documented HTTPS API.

After the pivot, Phase 1 auth core landed end-to-end: signup, verify, login, federation (Google + Microsoft), forgot/reset password, sign-out, /me round-trip, org creation, and org switcher UI. SES setup started (sender verified, production-access request submitted — awaiting AWS review).

## The pivot: Amplify v6 → direct-fetch

**Symptom:** Amplify's `signIn` neither resolved nor rejected. 15s timeout fires every time in normal Firefox; works fine in incognito.

**Diagnosis path:**
1. Hard timeout around `signIn` → timed out, no network request ever left the browser
2. Direct curl from same machine to `cognito-idp.ap-south-2.amazonaws.com/` → 400 in ~150ms (network fine, AWS reachable)
3. Manual fetch probe inserted before `signIn` in code → also 400 in ~50ms (browser network fine too)
4. Incognito works, normal Firefox hangs → browser-side, not network
5. Hydration mismatch warnings showed inputs had `wfd-id` attributes — Webroot's "Web Form Defender" injecting form attributes pre-React. Webroot intercepts WebCrypto on form-related data; Amplify SRP triggers WebCrypto; signIn hangs forever.

**Fix:** new `frontend/lib/cognito-client.ts`. Talks straight to Cognito's HTTPS API (`InitiateAuth`, `SignUp`, `ConfirmSignUp`, `ResendConfirmationCode`, `ForgotPassword`, `ConfirmForgotPassword`, `GlobalSignOut`, `/oauth2/token` for federation). No WebCrypto, no SRP, no SDK state machine. Same API surface AWS CLI uses for `cognito-idp initiate-auth`.

**Verified prod-safe.** AWS's HTTPS API is documented, versioned, stable. Many enterprise apps that hit SDK quirks use this pattern. Bundle drops ~200KB (no aws-amplify). Memory locked: [[avoid-amplify-sdk-prefer-direct-fetch]].

## Backend ↔ frontend auth pieces — final state

**Frontend** (everything Amplify-free):
- `lib/cognito-client.ts` — full auth API surface, single chokepoint `cognito()` helper logs every Cognito call with op + duration. Tokens stored in one localStorage key `rai.cognito.tokens`. Auto-refresh near expiry. `refreshTokens()` exposed for org-switch claim updates. PKCE for federation, sessionStorage for in-flight OAuth state.
- `lib/auth-storage-guard.ts` — runs on every client boot (imported by cognito-client). Walks localStorage, removes `CognitoIdentityServiceProvider.<clientId>.*` keys whose clientId ≠ current. On fingerprint mismatch or first-time guard boot, also nukes Amplify IndexedDB + stray service workers. Idempotent ~5ms no-op when storage is clean.
- `lib/icons.ts` — central icon re-export. Every component imports from here, never directly from `lucide-react`. Future icon-library swap = one file change.
- `app/auth/{login,register,verify,forgot-password,reset-password,callback}/page.tsx` — all use cognito-client, all have toast + inline error, all parse Cognito error names to human messages.
- `app/welcome/page.tsx` — `/me` via React Query + axios. When `memberships=[]` shows `CreateOrgSection`; when `memberships.length >= 1` shows `OrgSwitcherSection` (read-only row for single org, click-to-open dropdown for 2+). Auto-picks first org if `currentOrgId` is null. Mounted gate prevents hydration mismatch.
- `lib/api.ts` — axios + cognito-client.getIdToken() interceptor. 10s timeout. 401 → redirect to /auth/login with `redirectingToLogin` circuit breaker.
- `providers/AuthProvider.tsx` — thin pass-through. Side-effect imports cognito-client so storage guard runs on boot.
- `next.config.ts` — `compiler.removeConsole` strips `console.*` in prod builds, keeps `error` + `warn`.
- `aws-amplify` removed from `package.json` dependencies.

**Backend**:
- `modules/auth/cognito-auth.service.ts` — every Cognito SDK call wrapped in `callCognito()` that logs op + duration + AWS requestId + httpStatus + errorName to backend terminal. Email-verification normalized at this layer: if JWT carries a federated identity (Google/Microsoft), `emailVerified` is forced to `true` regardless of raw claim — defense against Cognito attribute-mapping misconfig.
- `middleware/authMiddleware.ts` — monotonic email_verified upgrade: if JWT now says verified but DB row still says false, UPDATE row to true. Never downgrades.
- `modules/orgs/` (new) — `orgs.routes.ts`, `orgs.controller.ts`, `orgs.model.ts`, `orgs.types.ts`. `POST /api/v1/orgs` validates name (2-100 chars) + slug regex (`^[a-z][a-z0-9-]{1,49}$`), inserts org + user_orgs in single transaction, catches `uq_organizations_slug` (23505) → 409 "Org identifier is already taken", calls Cognito `switchOrg` best-effort to set `custom:current_org_id`.
- `app.ts` — mounts `/api/v1/orgs`.

## Decisions locked

| Decision | Rationale |
|---|---|
| **Direct-fetch over Amplify SDK** | Amplify hangs in browsers running keystroke-encryption AVs; direct API is documented + stable + production-safe; ~200KB bundle savings. Backend `aws-jwt-verify` unaffected (validates same Cognito-signed tokens). |
| **Single transactional sender** (`devops@novetum.com` for now, `rai@novetum.com` later) | Slack/Linear/Notion pattern. Subject + body differentiate. Per-category split (`noreply@`, `notifications@`, `support@`, `billing@`) parked in upgrades.md for v3+ scale. |
| **Slug uniqueness, not name uniqueness** | Industry standard (Slack, GitHub, Jira, Linear, Notion). Different orgs CAN have similar names; slug is the URL-safe globally-unique alias. |
| **UI label = "Org identifier", code field = `slug`** | Users don't know "slug" — dev jargon. Frontend label is human-friendly; backend column/API field stays `slug` (devs know it). |
| **First-come-first-served slug claim** | Auction model parked for v3+. |
| **Auto-pick first membership if `currentOrgId` null + memberships exist** | Slack/Linear convention. Saves users from "please select an org" limbo. |
| **Federation = email_verified=true** | Google and Microsoft both require email ownership before authentication completes. Normalization happens in `cognito-auth.service` so all downstream code sees verified=true for federated users without needing devops to fix Cognito attribute mapping. |

## SES setup — in flight

- Verified sender: `devops@novetum.com` (clicked verification link from AWS)
- IAM policy attached: backend AWS user (`AKIAVIGWOPC76XBKLLFI` / `rai-dev-cognito-admin`) has `ses:SendEmail` + `ses:SendRawEmail`
- Region: `ap-south-2` (inherited from `AWS_REGION`)
- `SES_FROM_EMAIL=devops@novetum.com` added to `backend/.env` (and blank placeholder in `.env.example`)
- **Production-access request submitted 21 May 2026 ~20:15 IST.** AWS replied asking for more detail; user submitting follow-up tonight with full use-case description (email types, frequency, recipient management, bounce/complaint handling, example invite copy, ~5000/day target volume). Expecting approval within 24h.

## Open blocker — IAM Cognito admin permissions missing

Backend's `switchOrg` (and by extension `logoutAll`, `linkProvider`) fails with:

```
AccessDeniedException: User rai-dev-cognito-admin is not authorized to perform:
cognito-idp:AdminUpdateUserAttributes on resource ap-south-2_vOb1QS6Xl
```

Devops needs to attach (or extend the existing inline policy to include):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CognitoAdmin",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminUserGlobalSignOut",
        "cognito-idp:AdminLinkProviderForUser"
      ],
      "Resource": "arn:aws:cognito-idp:ap-south-2:361226991807:userpool/ap-south-2_vOb1QS6Xl"
    },
    {
      "Sid": "SES",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

Until this lands, org switcher's auto-pick fires + fails silently (toast "Org switch failed"). Org creation still works because of best-effort handling — DB has the row, just Cognito attribute doesn't get set. User can manually pick from dropdown (also fails until IAM fix).

## Docs / memory updates this session

- `docs/notifications.md` — new "Email sender configuration" section (single mailbox, per-type sender table, Cognito → SES integration walkthrough) + "Template structure" section (typed template-per-type pattern, plain-text-first rule, why no Handlebars/MJML yet).
- `docs/upgrades.md` — added "Pre-production email/sender hardening" entry covering 4 items: swap to rai@novetum.com sender, Cognito → SES integration, per-category sender segmentation, exit SES sandbox. Plus separate "Password-reset reject reuse of current password" v3 entry.
- Memory: `feedback_avoid_amplify_sdk.md` — never re-suggest Amplify SDK for browser auth; use direct-fetch via `lib/cognito-client`.
- Memory: `feedback_surface_alternative_paths.md` — when a setup has 2+ materially different paths (e.g. SES sandbox vs production-access), lead with the choice; don't walk one default and only mention the alternative later.
- Memory: `project_v2_cognito.md` updated — frontend uses direct-fetch client, not Amplify; lists the storage guard + auto-clean fingerprint pattern.

## Status going into next session

| Item | Status |
|---|---|
| Email/password sign-in + sign-out | ✅ working |
| Federation (Google + Microsoft) | ✅ working |
| Signup → email verify → login | ✅ working |
| Forgot / reset password | ✅ working |
| `/me` round-trip (lazy-sync + memberships) | ✅ working |
| Org creation (slug uniqueness, transactional insert) | ✅ working |
| Org switcher UI (single-org case) | ✅ working (untested by user) |
| Org switcher actual switching (multi-org) | 🚫 blocked on IAM permission |
| Hydration mismatch on /welcome | ✅ fixed (mounted gate) |
| `aws-amplify` removed from package.json | ✅ (run `npm install` to clean node_modules) |
| Logger gated for prod (`removeConsole`) | ✅ |
| SES sender verified | ✅ |
| SES IAM permission | ✅ (ses:SendEmail attached) |
| SES production access | 🔜 awaiting AWS review (~24h) |
| **IAM Cognito admin policy** | 🚫 devops fix needed (policy JSON above) |
| Email invites code | 🔜 next session (uses SES) |
| Settings page (name + password change) | 🔜 next session |
| **Initial v2 commit** | 🔜 user is committing today after testing switch-org |
| Phase 2 retrofit (projects/sprints/tickets multi-tenant) | 🔜 after Phase 1 closeout |

## Tomorrow's playbook

1. **First thing** — devops attaches the IAM Cognito admin policy (the JSON above). Without this, org switcher can't switch.
2. **User tests org switcher** end-to-end:
   - Single-org case (already verified works visually, just confirms no toast errors)
   - Multi-org case: needs a second `user_orgs` row. Easiest path: `INSERT INTO user_orgs (user_id, org_id, role) VALUES ('<your-uuid>', '<other-org-uuid>', 'admin');` against local Postgres. Then refresh `/welcome` → dropdown appears → switch should toast "Switched to <name>" + refetch /me.
3. **Check AWS SES inbox** for production-access approval. If approved → wire invites next. If still in review → build settings page first (no SES dependency).
4. **Initial v2 commit** at end of day per user's plan.

## Files changed this session (summary)

**New:** `frontend/lib/cognito-client.ts`, `frontend/lib/auth-storage-guard.ts`, `frontend/lib/icons.ts`, `backend/modules/orgs/{routes,controller,model,types}.ts`.
**Deleted:** `frontend/lib/amplify.ts`.
**Heavily rewritten:** `frontend/app/welcome/page.tsx`, `frontend/app/auth/login/page.tsx`, `frontend/app/auth/callback/page.tsx`, `frontend/app/auth/{register,verify,forgot-password,reset-password}/page.tsx`, `frontend/providers/AuthProvider.tsx`, `frontend/lib/api.ts`, `frontend/store/auth.store.ts`.
**Updated:** `frontend/app/layout.tsx`, `frontend/next.config.ts`, `frontend/package.json` (removed `aws-amplify`), `backend/app.ts`, `backend/middleware/authMiddleware.ts`, `backend/modules/auth/cognito-auth.service.ts`, `backend/.env`, `backend/.env.example`, `docs/notifications.md`, `docs/upgrades.md`.
