# Convo 056 — Invite system + v1 shell restored + Settings page + auth/race fixes — Phase 1 closeout

**Date:** 22 May 2026

---

## What happened

Continued from convo-055 (Cognito auth core done, org create + switcher landed). Goal for this session: build out the Q6 + RF-12 invite system end-to-end, restore the v1 app shell so the org switcher and Team page live in their proper homes (per `[[feedback_v2_frontend_match_v1]]`), ship the Settings page (profile + password + org rename + switcher), fix the auth/race bugs that surfaced along the way, and **close Phase 1**.

Three arcs of work:
1. **Invites end-to-end** — backend (table + send + accept + revoke + preview + members list) + frontend (Team page + InviteMemberModal + `/invite/[token]` accept page with confirm card).
2. **v1 shell restoration** — Header / Sidebar / Footer / `(app)/layout.tsx` brought back from `_v1-archive/`; Phase 2 nav items commented inline; org switcher relocated from `/welcome` to a header avatar dropdown.
3. **Bug-fix arc** — multiple auth races and missing behaviors caught during testing (see "Bugs caught" section).

## Backend — what shipped

**New migration:**
- `004_invites.sql` — `(id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)` + partial unique index `(org_id, invited_email) WHERE used_at IS NULL AND revoked_at IS NULL` (at-most-one-live-invite-per-(org,email) invariant).

**New modules:**
- `modules/email/email.service.ts` — `SESv2` `SendEmailCommand` wrapper, `callCognito`-style logging (op + duration + recipient + AWS requestId).
- `modules/email/templates/invite.template.ts` — plain-text-first invite per `docs/notifications.md`.
- `modules/invites/{types,model,controller,routes}.ts` — full Q6 + RF-12 implementation:
  - `POST /api/v1/orgs/:id/invites` — owner/admin/PM only, pre-flight 409 if already a member, supersede-in-same-txn for duplicate live invites, SES send with **invite-row rollback on email failure** (so admin can retry cleanly).
  - `GET /api/v1/orgs/:id/invites?status=pending` — Team page list.
  - `POST /api/v1/invites/:id/revoke` — owner/admin/PM only.
  - `GET /api/v1/invites/preview/:token` — **public, no auth** — returns `{org_name, role, invited_email, state}` so the accept page can render a confirm card before the user is even signed in.
  - `POST /api/v1/invites/accept` — auth required, **email-bound** (invite.invited_email vs req.user.email — 403 on mismatch), lifecycle checks (`used` / `revoked` / `expired` → 410), accept-txn (mark used + insert user_orgs, COALESCE), Cognito switchOrg best-effort.

**Other backend changes:**
- `modules/orgs/orgs.controller.ts` — added `GET /api/v1/orgs/:id/members` (any member view; ordered owner → admin → PM → user, oldest first within tier) and `PATCH /api/v1/orgs/:id` (owner+admin only per rbac.md, name-only — slug locked).
- `modules/me/me.controller.ts` — added `PATCH /api/v1/me { name }` (2-100 char validation).
- `modules/auth/auth.model.ts` — `insertUser` now takes name, persists on insert, `COALESCE(users.name, EXCLUDED.name)` to preserve user-edited names on conflict; new `updateUserName` helper.
- `modules/auth/auth.service.ts` — `NormalizedAuthContext.name: string | null` added.
- `modules/auth/cognito-auth.service.ts` — `verifyAccessToken` extracts name from JWT (prefers `name`, falls back to `given_name + family_name` for IdPs that only set those).
- `middleware/authMiddleware.ts` — **backfills `users.name` from JWT** on every request when DB row has NULL but JWT has a name (heals all existing rows; first-mount fix for the silently-dropped-name bug).
- `.env.example` + `.env` — `FRONTEND_BASE_URL=http://localhost:3000`.
- `package.json` — `@aws-sdk/client-sesv2`.

## Frontend — what shipped

**Shell restored** (per `[[feedback_v2_frontend_match_v1]]`):
- `components/shell/{Header,Sidebar,Footer}.tsx` — restored from `_v1-archive`. Phase 2 nav items (Dashboard/My Work/Projects/Admin/Sprints sub-nav) **commented inline** so re-enabling them is the only change when Phase 2 lands.
- `app/(app)/layout.tsx` — **single deps-driven gate-effect** (was two with a stale-closure race condition — see Bugs section). Decision tree: no token → /auth/login; no user + tokens → hydrate; isHydrating → wait; !isAuthenticated → /auth/login; no memberships → /welcome; no currentOrgId → /welcome; all-passed → render shell.

**New pages:**
- `app/(app)/team/page.tsx` — fetches `GET /orgs/:id/members` for the member list, fetches `GET /orgs/:id/invites?status=pending` for pending invites (owner/admin/PM only), Invite button opens modal, Cancel button on each pending row revokes.
- `app/(app)/dashboard/page.tsx` — placeholder ("Phase 2 lands here").
- `app/(app)/settings/page.tsx` — major page:
  - **Account** section: read-only email + verified status + **editable Display name** (view → click Edit → input + Save/Cancel).
  - **Password** section: closed → click Change → 3-state machine:
    - `change` mode: current + new + confirm + per-field show/hide + "Forgot your password?" link
    - `reset` mode (confirm step): "We'll email a code to X. Continue?" with `[Send code]` (no email until clicked).
    - `reset` mode (code form): code field + new + confirm + Resend / Back-to-change.
    - Hidden entirely for federated users with a "Managed by Google/Microsoft" note instead.
  - **Current organization**: name editable for owner+admin (view → Edit), slug + role + subscription read-only.
  - **Switch organization**: list of other orgs (with `@slug` for disambiguation per `[[feedback_show_org_slug_in_listings]]`), Switch button per row.
  - Section headers: icon tile (User / Lock / Building2 / ArrowRightLeft) + title + description.
- `app/invite/[token]/page.tsx` — fetches preview, renders **confirm card** (not auto-accept), handles four states: signed-in matching email (Cancel/Accept), signed-in wrong email (Sign-out + retry), not signed in (Sign in / Create one), lifecycle terminal (used/revoked/expired). All token-preservation paths through register→verify→login work.

**Frontend changes (existing files):**
- `app/welcome/page.tsx` — empty-state only. Auto-picks first org via `POST /auth/switch-org` when memberships exist but currentOrgId is null (federated landing). Module-scoped Set guard against StrictMode double-fire.
- `app/page.tsx` — client-side route to `/dashboard` or `/auth/login` based on token presence.
- `app/layout.tsx` — Toaster moved to **bottom-right with `offset={52}`** so it clears the footer.
- `app/auth/{login,register,verify}/page.tsx` — preserve `?invite=token` through the full sign-up → verify → sign-in chain.
- `lib/cognito-client.ts` — added `changePassword`, `isFederatedUser`, `federatedProvider`.
- `lib/icons.ts` — added shell + settings icons.
- `store/auth.store.ts` — `isHydrating` initial state changed to `false` (means "haven't started", not "in flight"); `hydrate()` flips it `true` at start, clears auth state on no-token branch.
- `types/auth.types.ts` — `AuthUser.name: string | null`.
- `components/BrandLogos.tsx` — Google + Microsoft brand SVGs for OAuth buttons.
- Login page polished — h-10 fields with focus rings, brand-logo OAuth buttons (Google / Microsoft), tightened spacing to fit ~720px viewports without scroll.

## Decisions locked

| Decision | Rationale |
|---|---|
| **Invite tokens email-bound** | Only the invited address can redeem; forwarded links to a different account bounce. Matches Slack/Linear/Notion. User explicitly confirmed: "only the person who is invited if he is the mail specified only he can join otherwise no". |
| **Confirm step before email-fire** | Both invite accept and forgot-password reset now show a confirm card before any email/API. No silent state-change on a misclick. |
| **Slug rename: parked for v3** | Path-based tenancy (`rai.app/orgs/<slug>/...`) lands in Phase 2; slug rename needs alias-redirect table + grace period to ship safely. v2 ships name-rename only. Captured in `docs/upgrades.md` "Org slug rename with alias redirects". |
| **No OTP for password change** | Not industry standard. Current password is sufficient verification. Industry standard alternative is post-change email notification — parked for later. |
| **Settings UI: view → edit → save/cancel** | Per `[[feedback_settings_view_edit_pattern]]`. Raw editable forms look noisy. |
| **Toast position: bottom-right with offset** | Clears header (avatar/dark-mode), sidebar, footer. Matches Linear/Stripe/GitLab/Airtable. |
| **Org rename: owner + admin** | Per rbac.md "Edit org settings" — both roles. Slug stays locked. |
| **Federated users hide password section** | They have no Cognito password. Section becomes "Managed by Google/Microsoft" note. |
| **Display name source of truth: DB `users.name`** | Backend reads on every /me; updated via PATCH /me. Cognito's name attribute is the seed (signup + federation), DB is the canonical store after that. Lazy-sync backfills name from JWT when DB has NULL. |

## Bugs caught + fixed this session

1. **MS-federated infinite redirect loop** — `/welcome` (has memberships) → `/dashboard` → `(app)/layout` (no currentOrgId) → `/welcome` → ∞. Root cause: when I moved the switcher to the header, I stripped the auto-pick logic from `/welcome`; federated logins land with `custom:current_org_id=null`. Fixed by reintroducing auto-pick on `/welcome` with module-scoped Set guard.
2. **`(app)/layout.tsx` stale-closure race** — two effects, first kicked `hydrate()`, second had captured `isHydrating: false` from prior render's closure and redirected to `/auth/login` before hydrate could complete. Fixed by collapsing into a single deps-driven gate-effect.
3. **`isHydrating: true` initial → effect never fires hydrate** — first-mount logic depended on hydrate triggering, but the effect early-exited on `isHydrating: true`. Fixed by starting `isHydrating: false` (semantically: "not yet started").
4. **Store stale after sign-out → sign-in** — clearAuth set `isAuthenticated: false`, signIn stored tokens but didn't update store, layout saw stale state and redirected to /auth/login. Fixed by making layout's effect fire hydrate when `!user` and tokens exist.
5. **`users.name` silently dropped on lazy-sync** — signup form collected name, Cognito stored it, JWT carried it, but `authMiddleware` + `insertUser` never read/stored it. Fixed in NormalizedAuthContext + insertUser + middleware backfill.
6. **`switchOrg` fired twice (StrictMode double-mount)** — `useRef` guard reset on remount. Fixed by module-scoped `Set` keyed by user id.
7. **Invite accept auto-fired without consent** — page mounted → POST /invites/accept immediately, silently joining. Fixed via new `GET /invites/preview/:token` (public) + confirm card with `[Accept]/[Cancel]`.
8. **Toast covered header chrome** — `top-right` position blocked avatar + dark-mode buttons. Moved to bottom-right with footer offset.
9. **Show/hide password toggled all 3 password fields together** — single `showPwd` state. Fixed with per-field `showCurrent`/`showNew`/`showConfirm` state.
10. **Forgot password from settings logged user out feel** — `<Link href="/auth/forgot-password">` stranded the user on an auth page with no Back. Fixed by handling reset in-place via `ForgotPassword` + `ConfirmForgotPassword` inside settings, with confirm step before send.
11. **Org switcher IAM mismatch** — `rai-dev-cognito-admin-inline-policy` was pointing at user pool `ap-south-2_7Mg6KNdBA` while app uses `ap-south-2_vOb1QS6Xl`. Devops fix during the session (resource ARN updated). Now AdminUpdateUserAttributes succeeds.

## Memory adds this session

- `feedback_dev_server_auto_restart` — backend `tsx watch` + frontend Next HMR auto-reload; never reflexively tell user to restart (only required for new npm dep / new SQL migration / .env change).
- `feedback_log_every_step` — log liberally at controller entry, validation pass, branch decisions, success, error; gate-effects log which branch ran + why; sparse logs make user-reported bugs a round-trip waste.
- `feedback_show_org_slug_in_listings` — orgs can share names; always render `@<slug>` alongside name in switchers, settings, member tables.
- `feedback_settings_view_edit_pattern` — Settings sections show read-only by default; Edit/Change button reveals inline form with Save/Cancel; no raw forms visible without intent.
- `feedback_confirm_before_sensitive_action` — never fire emails / persistent state changes from a single click; always offer an inline confirm card with `[Cancel]` + explicit action button.

## Status going into next session

| Item | Status |
|---|---|
| Cognito auth core (signup/verify/login/forgot/federation) | ✅ from convo-055 |
| Org create + switch (auto-pick on federation) | ✅ |
| Org rename (owner+admin) | ✅ |
| Invite create / accept / revoke / preview | ✅ |
| Team page (members + pending invites + invite modal + revoke) | ✅ |
| `(app)` shell (Header / Sidebar / Footer / layout) | ✅ |
| Header avatar dropdown (account + switcher) | ✅ |
| Settings (profile name + password change + in-place reset + org rename + switch) | ✅ |
| `/invite/[token]` accept page (preview + confirm + lifecycle states) | ✅ |
| SES recipient verification (sandbox) | ✅ (user did manually) |
| SES production access | 🔜 awaiting AWS approval (submitted 21 May) |
| Slug rename | ⏸ parked for v3 (`upgrades.md`) |
| Admin-invites-admin owner approval | ⏸ parked for v3 (`upgrades.md`) |
| Post-change-password email notification | ⏸ parked |
| Status-enum refactor (isHydrating + isAuthenticated → discriminated union) | ⏸ parked |
| Storage event listener (multi-tab signin propagation) | ⏸ parked |
| Hydrate inflight dedupe singleton | ⏸ parked |
| Initial v2 commit | 🔜 user runs after this devlog |
| **Phase 2 — multi-tenant retrofit (projects/sprints/tickets)** | 🔜 next conversation |

## Tomorrow's playbook

1. **Initial v2 commit** — user runs `git add` + `git commit` (per `[[feedback_user_commits_manually]]`). Phase 1 closes.
2. **Phase 2 kickoff** in next conversation: multi-tenant retrofit of projects, sprints, tickets. Adds `org_id` columns + tenancy middleware enforcement + retrofitted controllers + re-enabled sidebar nav items. Seed script lands here per v2-plans Phase 1 deferral.

## Notable patterns established (for future sessions)

- **Single deps-driven gate-effect** for any layout/route guard. Never split mount-effect + deps-effect — stale closures race.
- **`isHydrating` starts false**; flipped true by hydrate at start; back to false on completion. Semantics: "actively in flight", not "haven't checked yet".
- **View → Edit → Save/Cancel** for editable fields. Read-only by default; Edit button reveals inline form; Save commits + collapses back; Cancel discards.
- **Confirm step before any action that fires email or persists state from a single click.** Inline confirm card with explanation + `[Cancel]` + explicit action button.
- **Module-scoped Set guards** for one-shot effects under StrictMode (useRef won't survive the dev-only remount).
- **Email-bound invite tokens** — security default (forwarded links don't redeem).
- **`@<slug>` everywhere multiple orgs are listed** — name-uniqueness isn't guaranteed.
- **Log every step** — controller entry, validation pass, branch decision, success, error. Layout gate-effect logs WHICH branch ran on every state change.
- **Lazy-sync backfill from JWT** — middleware monotonically updates DB rows (name, email_verified) when JWT carries fresher info than DB.
