# Guide — Frontend

Next.js (App Router) UI for Rai. Multi-tenant, talks to the Rai backend, AWS Cognito auth.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · TanStack Query · Zustand · axios · dnd-kit · sonner · lucide-react

## What's in this guide
- **Folder structure** — where everything lives
- **Org model** — URL-driven multi-tenancy (`/orgs/[slug]/…`)
- **Auth** — Cognito direct-fetch, token + per-tab org header
- **State** — the 3 Zustand stores + server cache
- **API layer** — `lib/api.ts` (token + `X-Org-Id`)
- **RBAC** — 4-tier roles, per-org
- **Page pattern** — loading / error
- **Hooks** — data pattern + query keys
- **Types** — single source of truth
- **Key UI** — TicketPanel, Search, Board, ui kit
- **Content** — centralized copy
- **Do / Don't**, **Env setup**, **Add-a-feature checklist**

---

## Folder structure
```
frontend/
├── app/
│   ├── auth/              ← Cognito flows: login, register, verify, forgot/reset-password, callback (OAuth)
│   ├── invite/[token]/    ← accept an org invite
│   ├── orgs/[slug]/       ← the authenticated app, scoped to ONE org
│   │   ├── dashboard/  my-work/  team/  settings/ (+ billing, notifications subpages)  admin/
│   │   └── projects/[id]/ ← overview, board, backlog, archive, reports,
│   │                         settings, sprints/[sprintId], tickets/[key]
│   ├── welcome/  pricing/ ← onboarding + pricing
│   └── (root)             ← marketing landing page
├── components/
│   ├── shell/             ← Header, Sidebar, Footer, ProjectSubNav, TicketPanel
│   ├── ticket/            ← type-specific ticket fields (TicketTypeFieldsForm, TicketDetailsCard) + epic UI (EpicTag, EpicProgress)
│   ├── modals/            ← CreateProject / Sprint / Ticket, AddMember, InviteMember
│   ├── search/            ← SearchBar + SearchModal (Cmd/Ctrl+K)
│   ├── marketing/         ← landing sections (Hero, FeaturesGrid, …)
│   ├── ui/                ← RichSelect, DatePicker, MentionTextarea, Skeleton, PageError, PageNotFound, PinButton
│   └── Logo · BrandLogos · SubscriptionStatusChip · CrossTabSync
├── hooks/                 ← TanStack Query hooks (tickets, projects, sprints, reports, comments, team, search, my-work, domain-peers, deleted-orgs, notifications)
├── store/                 ← Zustand: auth.store, ui.store, theme.store
├── providers/             ← AuthProvider (hydrates /me), QueryProvider
├── lib/                   ← api, cognito-client, env, routes, errors, dates, role/sprint/project/text utils, icons, messages, toastQueue, sanitizeHtml, …
├── content/               ← centralized copy: marketing.ts, placeholders.ts, notifications.ts, emails/
└── types/                 ← api.types.ts (entities), auth.types.ts (user/role/membership)
```

## Org model — URL-driven multi-tenancy (the v2 core)
- Every authenticated page lives under `/orgs/[slug]/…`. **The slug in the URL = the active org.**
- A user can belong to many orgs (`memberships`). The URL — not a global toggle — decides which org a tab shows, so two tabs can sit in two different orgs at once.
- Each request sends an **`X-Org-Id` header derived from the URL slug** (see API layer); the backend trusts it over the JWT claim.
- `components/CrossTabSync` keeps login/logout in sync across browser tabs.

## Auth — Cognito (direct fetch)
- Auth is **AWS Cognito via `lib/cognito-client.ts`** — direct `fetch`, **not** the Amplify SDK (it hangs under keystroke-encryption AVs).
- `getIdToken()` → current ID token (auto-refreshes); `signOut()` → clears + redirects.
- Flows under `app/auth/`: login, register, verify email, forgot/reset password, and `callback/` for OAuth (Google/SSO) federation.
- `providers/AuthProvider.tsx` hydrates on load via `/me` → `{ user, memberships }`.
- **Org-layout render gate is stale-while-revalidate** (`app/orgs/[slug]/layout.tsx`). It shows the `<TransientShell />` loading screen **only when there's no usable session yet** (`!isAuthenticated || no memberships || slug doesn't resolve`) — **not** on `isHydrating`. A background re-validation (the throttled tab-focus/visibility refresh, a cross-tab hydrate) keeps the page mounted and swaps to fresh data atomically when `/me` returns. Blanking on `isHydrating` used to unmount `children` on every refresh, wiping in-progress in-page state (open OTP modals, half-filled forms). The focus refresh itself uses `refreshMemberships()` (silent `/me`, no `isHydrating` flip) rather than `hydrate()` — DB-authoritative, no layout remount.

## State — server cache + 3 stores
| Kind | Where | Holds |
|---|---|---|
| Server data | `hooks/` (TanStack Query) | projects/tickets/sprints/… cache, auto-refetched |
| Auth | `store/auth.store.ts` | `user` + `memberships`; helpers `useCurrentMembership()`, `useCurrentRole()` |
| UI | `store/ui.store.ts` | ephemeral: panels, sidebar, modals |
| Theme | `store/theme.store.ts` | light / dark |

**Rule:** never copy API data into `useState` — read from the query result, mutate via the hook.

## API layer — `lib/api.ts`
- One axios instance. Base URL from `NEXT_PUBLIC_BACKEND_URL` (e.g. `http://localhost:4000/api/v1`), with an auto host-swap so LAN/phone testers reach the dev laptop, not their own `localhost`.
- Request interceptor attaches **`Authorization: Bearer <Cognito ID token>`** + **`X-Org-Id`** (from the URL slug). 10s timeout.
- Never import `axios` directly — always `import api from '@/lib/api'`.

## RBAC — 4-tier, per-org
- Roles: `owner` > `admin` > `project_manager` > `user`. A role is **per org** (from the current membership), not a global user field.
```ts
const role = useCurrentRole();                 // from store/auth.store
const canManage = role === 'owner' || role === 'admin' || role === 'project_manager';
const isAdmin   = role === 'owner' || role === 'admin';
```
- Frontend gates UI for convenience; **the backend is the authority** and returns 403 regardless.
- `role` drives gating; `role_label` (per-org rename like "Tech Lead") is display-only.
- Full per-action matrix lives in the docs repo `guide-rbac.md` — that's the source of truth.

## Page pattern (everywhere)
Unwrap params → fetch hook → loading skeleton → error (`PageNotFound` vs `PageError`) → render. No global loading screen; each page owns its states.
```tsx
const { id } = use(params);
const { data, isLoading, error } = useXxx(id);
if (isLoading) return <Skeleton/>;
if (error) return isNotFoundError(error) ? <PageNotFound/> : <PageError onRetry={refetch}/>;
if (!data) return null;
```

## Hooks
- All data fetching/mutations live in `hooks/`, one file per domain.
- Mutation pattern: optimistic update (`onMutate`) → rollback on error (`onError`) → `invalidateQueries` / refetch on settle. Toasts via `sonner`.
- Query keys are centralized (e.g. `projectKeys.detail(id)`) — don't hand-roll keys.
- **Org recycle bin:** `useDeletedOrgs()` (query `['deleted-orgs']`) + `useRestoreOrg()` live in `hooks/useDeletedOrgs.ts`. Org delete (`useDeleteOrg` in `useTeam.ts`) is a 30-day soft-delete; the **Recently deleted** restore list renders in **two places** — on `/welcome` (`RecentlyDeletedOrgs`, for owners who deleted their last org) and a muted section at the bottom of **Settings** (`RecentlyDeletedOrgsSection`, for owners who still have other orgs). Both are owner-only, with a per-row "X days left" countdown + inline restore confirm; restore hard-navigates into the org so the org-layout guard re-hydrates cleanly.
- **Export your data:** owner/admin Settings section (`ExportDataSection`) downloads the whole org as JSON or Excel via `GET /orgs/:id/export?format=` (axios `responseType: 'blob'` → browser download; filename from `Content-Disposition`). Backend gates owner/admin too. Export-only — import is v3.
- **Personal pins (My Work quick-access):** `useToggleProjectPin()` (`useProjects.ts`) + `useToggleTicketPin()` (`useMyWork.ts`) hit `PUT`/`DELETE /me/pins/{projects,tickets}/:id`. Both take `{ id, pin }`, invalidate the host list query (projects list / my-work) to re-read the `isPinned` flag — **no optimistic patch** (DB is authoritative), and surface the backend's 422 "up to 3" message verbatim. Shared `ui/PinButton` (stops link propagation; filled when pinned). Projects page floats pinned to the top; My Work renders a dedicated **Pinned** section above the grouped list. The **global sidebar** project list and the **dashboard** (project grid + "My open tickets") also float pinned items to the top with a filled `Pin` indicator — read-only there (no toggle; the toggle lives on the `/projects` index + My Work rows). Max 3 per type, enforced server-side.
- **Sensitive-action OTP (`useOtp.ts` + `ui/OtpConfirm`):** delete-org, transfer-ownership, and delete-project confirm modals are gated by an emailed 6-digit code instead of the old typed-name/typed-email guard. `useRequestActionOtp()` POSTs `/otp/request` `{ action, targetId }`; the shared **`OtpConfirm`** component owns the send / resend / code-input UI and lifts the `code` to the parent, whose existing confirm button enables on `code.length === 6` and passes it to the mutation. The gated mutations (`useDeleteOrg`, `useTransferOwnership`, `useDeleteProject`) now take an `otpCode` and send it in the request body; the backend re-verifies it. `OtpAction` type lives in `types/api.types.ts`.
  - **These modals are NOT light-dismissible** — no backdrop-click / Escape close, only an explicit Cancel / X. The user has to leave the window to fetch the emailed code, so an accidental outside-click must not tear the flow down. (Pairs with the stale-while-revalidate render gate below, which stops a background `/me` refresh from unmounting the page while the modal is open.)
- **Notifications (`useNotifications.ts`):** a **single per-user feed across all orgs** — keys are `['notifications', …]`, **not** org-scoped, and the routes need no `X-Org-Id`. `useUnreadCount()` polls `/notifications/unread-count` every 45s for the bell badge; `useNotificationList(open)` fetches the feed only while the dropdown is open; `useMarkNotificationRead()` / `useMarkAllNotificationsRead()` invalidate both. Preferences: `useNotificationPreferences()` + `useUpdateNotificationPreference()` toggle the **email** channel per type (in-app is always on). Relative timestamps via `lib/time.ts` (`timeAgo`); UI copy in `content/notifications.ts`.

## Types — single source of truth
- `types/api.types.ts` — entities (Project, Sprint, Ticket, Member, Comment), enums, mutation payloads.
- `types/auth.types.ts` — `AuthUser`, `Membership`, `OrgRole`, `SubscriptionStatus`.
- Enums: TicketType `task|bug|story|epic` · Priority `lowest→critical` · TicketStatus `todo|in_progress|in_review|done` · SprintStatus `planned|active|completed` · OrgRole `owner|admin|project_manager|user`.
- **Backlog** = tickets with `sprintId === null` (separate from `sprint.tickets`) — search both when scanning all tickets.

## Key UI
- **NotificationBell** (`shell/`) — bell + unread badge + dropdown inbox in the header (replaces the old "coming soon" placeholder). Outside-click/Escape close (same pattern as the org switcher); rows deep-link via each notification's own `org_slug`; "Mark all read" + a footer link to the notification-settings page (`settings/notifications`). Email preferences live on their **own page** (`orgs/[slug]/settings/notifications`, mirroring Billing — a fixed set of toggles earns a dedicated page, unlike user-dependent lists). The Settings root shows an **"Open notifications"** entry card in the "You" group; the page renders `settings/NotificationPreferencesSection` (per-type email toggles grouped by category, system-critical types locked on). The card itself draws no header — the page H1 owns the title.
- **TicketPanel** (`shell/`) — slide-in ticket editor; re-derives its ticket from live project data via `useMemo`, so it stays fresh after mutations.
- **Type-specific ticket fields** (`components/ticket/`) — `TicketTypeFieldsForm` (shared always-editable inputs for Epic name+color / Story points+acceptance criteria / Bug steps+environment; nothing for Task) is used by the CreateTicketModal and, via `TicketDetailsCard`'s read/edit wrapper, by the ticket detail page + TicketPanel. Epic color swatches + story-point scale live in `lib/ticket.meta.tsx` (`EPIC_COLOR_HEX`, `STORY_POINT_VALUES`).
- **Search** (`search/`) — Cmd/Ctrl+K, 300ms debounce, `GET /search?q=` (min 2 chars), keyboard nav (↑↓/Enter/Esc).
- **Board** (`projects/[id]/board`) — dnd-kit Kanban; optimistic move + snap-back on failure; `user` role can only drag their own tickets.
- **ui/** kit — RichSelect, DatePicker, MentionTextarea, Skeleton, PageError, PageNotFound, OtpConfirm.
- **ProjectAvatar** (`ui/ProjectAvatar`) — single render site for a project tile (sidebar, projects index, project-sidebar identity, settings). Two tile colourings: the **default** key-letter tile (`avatarType='initials'`) uses the key-derived `projectColor`; a **preset icon** tile (`avatarType='icon'` + `avatarValue`) wears that icon's **own 135° gradient** (Jira/Google style — each preset a distinct hue), so picking an icon also picks its colour. The id→def gallery lives in `lib/projectAvatar.tsx` — ~14 curated icons spread across the hue wheel, each `{ id, label, Icon, gradient }`; `PROJECT_ICONS` drives the picker, `PROJECT_ICON_MAP` (id→def) the lookup. Add icons there + re-export from `lib/icons`, giving each an unused hue. The settings picker renders the **real coloured tiles** (active = primary ring) so the choice previews 1:1. v2 = preset icons only; custom image upload + org/user avatars are deferred to v3.
- **SubscriptionStatusChip** — shows trial / active / suspended / cancelled (gating signal).

## Styling — theme tokens
- **Single source of truth:** all colors / font / radius live in `app/globals.css` (`@theme` block), with **light + dark** variants. Retheme the whole app by editing that one file — never hardcode hex in components.
- **Design system:** Atlassian/Jira — Atlassian Blue primary, navy text, light-grey surfaces. Font **Inter** (base 14px). Icons **lucide-react** only. Subtle 6px Jira-style scrollbars (`scrollbar-subtle`).
- **Use semantic Tailwind classes** (never raw `bg-blue-600`):

| Group | Tokens — use as `bg-` / `text-` / `border-` |
|---|---|
| Primary | `primary`, `primary-hover`, `primary-subtle` |
| Text | `text`, `text-subtle`, `text-placeholder`, `text-disabled`, `text-inverse`, `text-link` |
| Surfaces | `surface`, `surface-raised`, `surface-sunken`, `surface-overlay` |
| Borders | `border`, `border-subtle`, `border-focus` |
| Status | `success`, `warning`, `danger`, `info` (+ `-subtle`) |
| Ticket type | `epic`, `story`, `task`, `bug` |
| Priority | `priority-critical` / `high` / `medium` / `low` / `lowest` |

Light anchors: primary `#0052CC`, text `#172B4D`, surface `#F4F5F7`. Dark mode auto-swaps via the dark `@theme` block.

## Content — centralized copy
User-facing strings (marketing, placeholders, emails) live in `content/`, **not inline** in components. Edit copy in one place; also sets up i18n later.

## Do / Don't
| Don't | Do |
|---|---|
| import `axios` directly | `api` from `@/lib/api` |
| store API data in `useState` | read from the query hook |
| define entity types in components | import from `@/types` |
| use a global user role | `useCurrentRole()` (per-org) |
| inline user-facing copy | `content/` files |
| hardcode hex / colors | Tailwind theme tokens (docs repo `dev-standards.md`) |
| hand-roll query keys | use the `*Keys` helpers |
| `console.log` | `logger` from `@/lib/logger` (see `guide - logging.md`) |
| `dangerouslySetInnerHTML` with untrusted HTML (e.g. mammoth DOCX output) | pass it through `sanitizeHtml` from `@/lib/sanitizeHtml` first |

## Env setup
```bash
cp .env.example .env     # fill Cognito values + NEXT_PUBLIC_BACKEND_URL
npm install
npm run dev              # http://localhost:3000
```
- Keys: `NEXT_PUBLIC_COGNITO_REGION / POOL_ID / CLIENT_ID / DOMAIN`, `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_OAUTH_SIGNIN_URL / SIGNOUT_URL`.
- ⚠️ `NEXT_PUBLIC_*` are **baked at build** — change one → **rebuild** (`up -d --build`); a restart won't pick it up.

## Add a feature (checklist)
1. Type → `types/api.types.ts`
2. Hook → `hooks/` (query/mutation, optimistic pattern)
3. Page → `app/orgs/[slug]/…` (or a component)
4. Gate by `useCurrentRole()`
5. Loading + error states (Skeleton / PageError)
6. User-facing copy → `content/`
7. Log via `@/lib/logger`
