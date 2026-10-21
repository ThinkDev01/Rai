# Convo 058 — Cross-tab UX rework + URL-slug-driven org context (path-based tenancy pulled into v2)

**Date:** 27 May 2026

---

## What happened

User reported "Could not load your account — 429" after yesterday's convo-057 silent-rehydrate fix landed. Trace:

- Convo-057 added Case B in the storage-event handler: on `sub` mismatch → `qc.clear() + hydrate()`. Silent.
- `hydrate()` had no inflight dedupe (parked from convo-056). A sign-in flow writes localStorage more than once (initial token + immediate refresh in some Cognito flows), so two storage events fired → two `hydrate()` calls in parallel → two `/me` requests → backend rate limit returned 429.
- The bigger problem under the 429 was that **silent rehydrate is not what Jira / Linear / Notion do anyway** — they either prevent the second sign-in or surface it for explicit user action.

User asked for a full alignment with industry standard. We mapped what Jira / Slack / Linear / Notion / GitHub / Gmail do and converged on:

1. One user per browser-origin (already true — localStorage tokens are shared).
2. **Org context in the URL, not in shared state** — URL is naturally per-tab, so two tabs can hold two different orgs trivially. Matches every comparable SaaS.
3. **Cross-tab logout** → notification toast + delayed redirect. Match Jira.
4. **Login-page propagation** → tab on `/auth/login` auto-redirects when another tab signs in. Match Jira.
5. **Cross-tab account-swap** → persistent banner with explicit user-action buttons. No silent swap.
6. **Hydrate dedupe** → fix the 429.

User explicitly pulled path-based tenancy from v3 into v2 ("yes this was in v3 but it seems important now so make it now only cleanly").

Eight tasks tracked, all shipped in this session.

## Architecture before / after

**Before:**

| Aspect | State |
|---|---|
| URL structure | `/dashboard`, `/projects/[id]/board`, `/team`, `/settings`, etc. — no org in URL |
| Current org source of truth | zustand `user.currentOrgId`, mirrored to Cognito `custom:current_org_id` attribute |
| Org switch flow | `POST /auth/switch-org` → Cognito attr write → token refresh → hydrate → qc.clear → redirect |
| Multi-tab multi-org | Broken — last switch-org call wins, every other tab's claim flips under it |
| Cross-tab logout | Silent redirect to `/auth/login` |
| Cross-tab account-swap | Silent re-hydrate (convo-057, removed in this session) |
| Hydrate concurrency | Unbounded — every caller fires its own `/me` |

**After:**

| Aspect | State |
|---|---|
| URL structure | `/orgs/[slug]/dashboard`, `/orgs/[slug]/projects/[id]/board`, etc. — every authenticated route slug-prefixed |
| Current org source of truth | URL slug, mirrored *into* zustand for selectors to keep working. One-way sync |
| Org switch flow | `router.push(orgRoute(slug, '/dashboard'))` — pure navigation |
| Multi-tab multi-org | Works trivially — each tab's URL holds its own slug |
| Cross-tab logout | Sonner toast "Signed out in another tab — Redirecting to sign-in…" (1.5s) → redirect |
| Cross-tab account-swap | Persistent sonner banner with `[Switch this tab]` and `[Sign back in]` buttons — explicit user choice |
| Hydrate concurrency | Module-scope inflight Promise — concurrent callers `await` the same `/me` |
| Cognito `custom:current_org_id` | "Default org on next fresh login" only — tab-local switches don't write it |

## Files touched

**New:**
- `frontend/lib/routes.ts` — `orgRoute(slug, subpath)`, `useCurrentSlug()`, `defaultDashboardRoute(memberships, preferredOrgId?)`.

**Moved (route tree restructure):**
- `frontend/app/(app)/*` → `frontend/app/orgs/[slug]/*` (admin / dashboard / error.tsx / layout.tsx / my-work / projects / settings / team).

**Rewritten:**
- `frontend/store/auth.store.ts` — hydrate dedupe singleton + new `setCurrentOrgId` action.
- `frontend/app/orgs/[slug]/layout.tsx` — slug-driven gate, slug-transition `qc.clear()`, sonner-toast cross-tab handlers (logout banner + account-swap banner).
- `frontend/components/shell/Header.tsx` — switchOrg becomes `router.push(orgRoute(...))`; removed `POST /auth/switch-org` call, refresh, hydrate, qc.clear (layout handles all of that).
- `frontend/app/page.tsx` — root redirect targets `defaultDashboardRoute()` instead of `/dashboard`.
- `frontend/app/auth/login/page.tsx` — added cross-tab propagation effect (storage listener + on-mount check).
- `frontend/app/welcome/page.tsx` — auto-pick + create-org redirect through `defaultDashboardRoute()` / `orgRoute(...)`.
- `frontend/app/invite/[token]/page.tsx` — accept redirects to the joined org's slug-prefixed dashboard.

**Mechanical link updates** (added `useCurrentSlug()` + `orgRoute(slug, ...)` wrap):
- `frontend/components/Logo.tsx` — points to root `/`, which now routes intelligently.
- `frontend/components/shell/Sidebar.tsx` — Dashboard / My Work / Team / Settings nav links, project list links, project sub-nav links, sprint list links, archived project links. Route detection regex updated from `^/projects/...` to `^/orgs/[^/]+/projects/...`.
- `frontend/components/shell/TicketPanel.tsx` — parent + sub-ticket + open-full-page links.
- `frontend/components/modals/AddMemberModal.tsx` — invite-by-email shortcut link.
- `frontend/components/modals/CreateProjectModal.tsx` — post-create router.push.
- `frontend/components/search/{SearchBar,SearchModal}.tsx` — result navigation.
- `frontend/app/orgs/[slug]/dashboard/page.tsx` — stat-card links + project-card link + my-ticket row link.
- `frontend/app/orgs/[slug]/my-work/page.tsx` — ticket row link.
- `frontend/app/orgs/[slug]/projects/[id]/{backlog,board,overview,archive,settings}/page.tsx` — internal navigation.
- `frontend/app/orgs/[slug]/projects/[id]/tickets/[key]/page.tsx` — board back-link + parent ticket links + sub-ticket links.
- `frontend/app/orgs/[slug]/projects/[id]/sprints/[sprintId]/page.tsx` — backlog jump + archive jump + post-delete redirect.

**Docs:**
- `docs/v2-plans.md` — UI-pass round 3 entry extended with the full convo-058 cross-tab rework breakdown.
- `docs/upgrades.md` — slug rename + alias redirects entry updated (path-based tenancy now in v2; rename stays parked as a separate concern).
- `docs/devlog/convo-058-cross-tab-rework-url-slugs.md` — this file.

## Cross-tab behavior matrix

| Trigger | Active tab state | New behavior |
|---|---|---|
| Sign-out in another tab | Authenticated | Toast "Signed out in another tab — Redirecting to sign-in…" (1.5s) → `clearAuth` + `qc.clear` + `/auth/login` |
| Sign-in in another tab as **same user** (token same `sub`) | Authenticated | No-op — `sub` matches, nothing to reconcile |
| Sign-in in another tab as **different user** (token different `sub`) | Authenticated | Persistent toast with two actions: `[Switch this tab]` → `qc.clear()` + `hydrate()`; `[Sign back in]` → `clearAuth()` + `/auth/login` |
| Sign-in in another tab | On `/auth/login` | Auto-redirect to `defaultDashboardRoute(memberships, preferredOrgId)`; invite caveat redirects to `/invite/<token>` if `?invite=<token>` query is present |
| Sign-out in another tab | On `/auth/login` | No-op (already unauthenticated) |

## Why URL-driven org, not store-driven

localStorage is shared per-origin → all tabs read the same auth tokens. So one user globally is non-negotiable. What's tabbable is **which org each tab is focused on**. Industry consensus (Jira / Slack / Linear / Notion / GitHub) is to encode it in the URL because that's the only natural per-tab state.

Concrete consequence: with the new model, opening Tab A on `/orgs/acme/dashboard` and Tab B on `/orgs/widgets/dashboard` simultaneously is supported — each tab's `useCurrentSlug()` returns its own slug, and the layout effect mirrors the right orgId into the zustand store on first render. Selectors (`useCurrentMembership`, `useCurrentRole`) keep working because they read the (now URL-derived) `user.currentOrgId`.

## What was deliberately NOT done

- **`POST /auth/switch-org` backend endpoint removal.** Kept on the backend — still useful as the only way to update Cognito's `custom:current_org_id` attribute. Frontend just stops calling it on tab-local switches. Could be repurposed later as "make this my default org" from a Settings UI.
- **Slug rename + alias redirects.** Stays parked in `upgrades.md`. Rename without aliases would break external links; not worth shipping before there's customer demand.
- **Subdomain-based tenancy** (`acme.rai.app`). Stays parked for v3 — separate concern from path-based, triggered by enterprise SSO demand.

## Verification

`tsc --noEmit` clean across the refactor. The 6 pre-existing `project possibly-undefined` errors in `orgs/[slug]/projects/[id]/settings/page.tsx` still flagged for a separate batch (untouched here).

**Manual test plan** (resumes the UI walkthrough):

1. Sign in. Confirm landing URL is `/orgs/<your-default-slug>/dashboard`.
2. Open second tab to root `/`. Confirm it lands at the same `/orgs/<slug>/dashboard` without prompting for sign-in.
3. Use the org switcher → confirm URL changes to `/orgs/<new-slug>/dashboard` and the page renders the new org's data.
4. With two tabs open in two different orgs, click around in each — data should be independent, no 404s, no cross-pollination.
5. Sign out in Tab A → Tab B should show a 1.5s toast then land on `/auth/login`.
6. Sign back in on Tab A. Tab B (on login page) should auto-redirect to its dashboard.
7. Sign out on Tab B; sign in on Tab B as a different account → Tab A (still authenticated with old user) should show the account-swap banner with `[Switch this tab]` / `[Sign back in]` buttons. Click each in turn to verify both branches work.
8. Trigger several rapid storage events (e.g., sign-in flow with refresh) → confirm no 429.

## Related

- Supersedes convo-057's silent rehydrate (rolled back in this session).
- Closes convo-056's parked items: "Storage event listener (multi-tab signin propagation)" + "Hydrate inflight dedupe singleton".
- Pulls path-based tenancy (`/orgs/<slug>/...`) from `upgrades.md` v3 parking lot into v2.

---

## Follow-up — account-swap banner persists across refresh

User flagged a gap: refreshing Tab A while the banner was up silently swapped to the new identity. The render-gate effect would hydrate with whatever tokens were in localStorage and route to that identity's dashboard — convo-057's silent-swap antipattern leaking through the refresh path.

Fix: mirror the pending-swap state into sessionStorage (per-tab — survives F5, dies on tab close, never leaks to other tabs).

**`frontend/app/orgs/[slug]/layout.tsx`:**
- New module-scope helpers `readPendingSwap()` / `writePendingSwap()` / `clearPendingSwap()` over the `rai.pendingAccountSwap` sessionStorage key.
- Extracted `showAccountSwapBanner({ oldUserEmail, newSub, qc, router, onResolve })` helper so the cross-tab handler and the mount-time refire effect share identical UI + button behavior.
- New layout state `pendingSwap: PendingSwap | null`. Mount-time effect reads the marker; if non-null and the current ID token's `sub` still matches the marker's `newSub`, refires the banner and sets `pendingSwap`. Stale markers (sub mismatch — e.g. user signed in as a third identity after the marker was written) are cleared and ignored.
- Cross-tab Case B handler now writes the marker + sets state + fires banner via the helper.
- Both banner buttons clear the marker AND call the `onResolve` callback (= `setPendingSwap(null)`) as their first step, so the gate effect resumes after the user picks.
- Auth gate effect short-circuits when `pendingSwap !== null` — no redirects, no hydration calls. Banner is the only path forward.
- Render gate adds `pendingSwap` to its null-condition; the shell is hidden while the banner is up.

**Behavior after fix:**

| Scenario | Behavior |
|---|---|
| Refresh while banner is up | sessionStorage marker survives; layout mount refires banner + gates render. App content stays hidden until the user picks. |
| Close Tab A entirely (banner up) | sessionStorage is per-tab, cleared on tab close. Reopening any tab sees no marker → normal flow (silently lands at whichever identity owns the tokens). Reasonable — closing a tab is an implicit "I'm done". |
| Click `Switch this tab` then refresh | Marker cleared by the click; refresh runs the normal hydrate path with the new identity. |
| Click `Sign back in` then refresh | Marker cleared, tokens cleared by clearAuth(). Refresh sees no tokens → /auth/login. Other tabs also signed out (single shared session per browser). |
| User signs in as a third identity in another tab while banner is up | Marker becomes stale (newSub no longer matches token's sub). Mount-time refire detects mismatch, clears stale marker. Cross-tab handler re-fires fresh banner with the new sub. |
