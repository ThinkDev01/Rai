# Rai — Version 2 Plans

**Purpose:** Active v2 roadmap and architecture notes for the multi-tenant rebuild. Captures phasing strategy, architecture decisions as they get locked, and the multi-tenant target shape. Companion to `v2-decisions.md` (open-question log) and `upgrades.md` (parked features and alternative implementations). Phase organization (0 + 1–7) below was re-sequenced after all `v2-decisions.md` items locked (convo-053, May 2026); Phases 6–7 added as v3 items were promoted into v2 (2026-05-28, 2026-06-08).

**Status:** Planning. v1.0.0 is tagged on GitHub and running in staging. NOT shipped to prod.
**Reason for v2:** Until now Rai was treated as a user-facing app. The real product is org-level (like Jira). Multi-tenant changes are required before any production org onboards.

## v2 Scope Expansion (2026-06-08)

User reclassified v2 as the **final pre-prod build** ("last shot" — no separate v3 wave planned for the core product). Several items previously parked for v3 in `upgrades.md` are **promoted into v2**. Everything else in `upgrades.md` stays v3+.

**Promoted to v2:**

- **Billing → real Razorpay provider** (not the planned `NoOpBillingProvider` stub). See Phase 4.
- **Org data import**. See Phase 5. *(User-facing **entity** recycle bin — tasks/sprints/projects — moved back to v3 on 2026-06-08; org-level recycle bin shipped separately, see § Go-to-market lock.)*
- **MFA / 2FA**, **active-sessions UI**, **suspicious-login detection** (mostly Cognito toggles). See Phase 7.
- **OTP gate** on ownership transfer + destructive actions. ✅ Shipped via a custom **email-OTP** (not Cognito MFA) — see Phase 7.
- (Data export was already v2 — Phase 5. Custom logos/avatars **cut back to v3** on 2026-06-08 — not launch-important.)

**Mobile app:** built and complete by a separate dev. Implication: **push notifications need a token-register API contract handed to the mobile dev**, not a client build by us. FCM delivery + the device-token registration endpoint moved into Phase 3 — ✅ backend shipped (`device_tokens` + `/api/v1/devices` + real FCM channel); only the Firebase credential + mobile client remain.

**Still v3+ (unchanged):** vanity subdomains, workspace merge, multi-currency / advanced billing follow-ups, SAML/OIDC, GitHub SSO, comprehensive audit logging, internal admin panel, WebSocket in-app notifications, SMS/Slack/Teams, infra swaps (ALB/ECS/Aurora), and the rest of `upgrades.md`.

### Go-to-market lock (2026-06-08)

v2 ships to **production** at the end (mobile app ready → ships alongside web). Detailed batch + rationale in `upgrades.md` § Go-to-market batch. Net adds on top of the scope expansion above:

- **Skipping the internal admin dashboard** for launch — support runs through the `support@` shared inbox until volume justifies the panel. Stays v3+ (unchanged list above).
- **Launch-critical infra promoted into pre-prod** (see Pre-prod work § Infra + paperwork): email deliverability (SES sandbox exit + SPF/DKIM/DMARC + branded Cognito emails), **org-level soft-delete + 30-day purge** (before Billing), **DB backups + rehearsed restore**, and the **critical-error alert pipeline + uptime ping**.
- Internal product analytics: still deferred (out for launch).

## Contents

**Build phases**

- [Target Org Flow (Jira-style)](#target-org-flow-jira-style)
- [Phasing Strategy](#phasing-strategy)
- [Phase 0 — Infra setup (parallel to early app work)](#phase-0--infra-setup-parallel-to-early-app-work)
- [Phase 1 — Foundation (bones + auth + orgs)](#phase-1--foundation-bones--auth--orgs)
- [Phase 2 — Multi-tenant retrofit + v1 fixes](#phase-2--multi-tenant-retrofit--v1-fixes)
- [Phase 3 — Notifications](#phase-3--notifications)
- [Phase 4 — Billing](#phase-4--billing)
- [Phase 5 — Polish](#phase-5--polish)
- [Phase 6 — Product parity additions](#phase-6--product-parity-additions)
- [Phase 7 — Account security hardening](#phase-7--account-security-hardening)

**Deploy & pre-prod**

- [Staging deploy — devops checklist](#staging-deploy--devops-checklist)
- [Post-deploy verification (QA, not devops)](#post-deploy-verification-qa-not-devops)
- [Pre-prod work (before prod cutover)](#pre-prod-work-before-prod-cutover)
- [Coding kickoff workflow (per phase)](#coding-kickoff-workflow-per-phase)

**Architecture & reference**

- [Deferred Features & Alternatives](#deferred-features--alternatives)
- [Architecture Notes](#architecture-notes)
- [Subscription Model (locked at Q10/Q11)](#subscription-model-locked-at-q10q11)
- [Internal Admin Panel — deferred to v3](#internal-admin-panel--deferred-to-v3)
- [Open Questions](#open-questions)
- [Notes Captured Verbatim (from planning convo)](#notes-captured-verbatim-from-planning-convo)

**Appendix — archived & merged docs**

- [Appendix overview](#appendix--archived--merged-docs)
- [A1 · v1 Backend Phase Plan](#a1--v1-backend-phase-plan--_was-backend-phasesmd_)
- [A2 · v1 Feedback Triage](#a2--v1-feedback-triage--_was-v1-feedback-triagemd_)
- [A3 · v2 Rapid-Fire Decisions (RF1–16)](#a3--v2-rapid-fire-decisions-rf116--_was-v2-rapid-firemd_)

---

## Target Org Flow (Jira-style)

```
Signup → Verify email → Create org OR Join org via invite → If creator → Admin → Invite users
```

---

## Phasing Strategy

Infra (parallel devops) → Foundation (auth + orgs + bones) → Multi-tenant retrofit + v1 fixes → Notifications → Billing → Polish.
Each phase ships independently. Per-phase loop = shell → APIs → wire → test end-to-end → next phase. Foundation is the riskiest because tenant isolation, auth, and main layout underpin everything downstream.

---

## Phase 0 — Infra setup (parallel to early app work)

Devops-led; runs alongside the early phases. Full topology, component spec, security checklist, and per-env handoff sheet live in `dev-deployment.md` § "v2 Infra Architecture & Devops Handoff" — single source of truth, not duplicated here.

**Per-env (staging first, validate, then mirror for prod):**

- VPC with public + private subnet (no NAT Gateway by design).
- EC2 (t3.medium for staging) + Docker. Nginx + certbot on host for TLS day-1.
- RDS PostgreSQL 16 in private subnet, Multi-AZ for prod only.
- S3 buckets (frontend static + uploads). CloudFront in front of frontend bucket with WAF basic rules.
- Cognito user pool (`rai-staging`, `rai-prod`) — Rai-specific config per `dev-deployment.md` § "v2 Infra Handoff — Cognito".
- SES with verified sender domain (production-mode access requested).
- SNS topic + email subscribers; CloudWatch alarms wired to it (`dev-deployment.md` § "v2 Infra Setup — Critical-error alert pipeline").
- ACM certs (frontend in us-east-1, backend in ap-south-1).
- Secrets Manager entries per env (`rai/{env}/db-password`, `rai/{env}/cognito-*`, etc.).
- IAM role for EC2 with least-privilege per env.
- CloudWatch Logs with awslogs Docker driver; alarms on 5xx rate, DB CPU, DB connections, reserved log markers.

**Repo-split work — deferred to end of Phase 2 (not Phase 0):**

- v2 development happens in the **existing `Rai` monorepo** through Phase 1 + Phase 2. Backend and frontend stay as subfolders (`backend/`, `frontend/`) of the parent repo, same as v1. All commits flow to a single repo on a single branch. Splitting mid-dev would be friction for friction's sake — one logical v2 change (frontend + backend wiring) would become two commits in two repos.
- **Split trigger:** when v2 app runs end-to-end (signup → org → projects → sprints → tickets, all multi-tenant). Natural checkpoint = end of Phase 2 (multi-tenant retrofit done, all v1 features working under orgs). At that point:
  - `backend/` contents → new `rai-backend` repo on GitHub (start fresh history, or `git subtree split` if v1+v2 history is wanted).
  - `frontend/` contents → new `rai-frontend` repo.
  - ``, `.claude/`, root meta → stay in current `Rai` repo (becomes docs hub + v1 archive).
  - Mobile repo deferred to v3.
- **Old `rai` repo (v1) handling after split:** continues as docs hub + v1 archive. v1 codebase stays accessible at `v1.0.0` tag for hotfix branches. Once v2 has been stable in prod for ~2 months, fully archive the v1 code paths (delete `backend/`, `frontend/` from the post-split repo). Tag `v1.0.0` is forever recoverable.
- Per [[feedback_user_commits_manually]] user runs all git commands manually.

**Build-phase additions tied to infra:**

- **Rate-limiter swap.** `express-rate-limit` → `rate-limit-postgresql` PostgresStore against the new RDS. Ships in v2 build (not a future upgrade) so backend is fully stateless from day-1. ~3 lines of code in `backend/middleware/rateLimiter.ts`.

**Scaling triggers (informational — no v2 build work, just decisions deferred):**

- Vertical scale first (t3.medium → t3.large → t3.xlarge — one click).
- ALB + multi-EC2 only after sustained CPU/memory > 70% or response-time degradation (swap target in `upgrades.md`).
- Aurora swap after Multi-AZ RDS failover latency stops being acceptable, or read-replica fan-out exceeds 5 (swap target in `upgrades.md`).

---

## Phase 1 — Foundation (bones + auth + orgs)

**Status: ✅ complete as of 22 May 2026.** Closeout devlog: `devlog/convo-056-invites-shell-settings-and-auth-race-fixes.md`. Initial v2 commit happens at end of session. Phase 2 (multi-tenant retrofit) starts next conversation.

The biggest and riskiest phase. Done first because every later feature depends on tenant isolation, auth, and the main layout being correct. Absorbs old Phase A (org foundation) + old Phase B (auth completion) — Cognito gives most of auth as toggles so they ship together.

**Scope:**

- **Cognito wiring (backend + frontend).** `CognitoAuthService` implements the `AuthService` interface (per `dev-standards.md` §8). Frontend uses `aws-amplify`. v1 self-built JWT code deleted entirely (no bcrypt in production paths; `MockAuthService` retained as a test fixture only).
- **Schema.** `organizations`, `user_orgs`, `subscriptions`, `invites`, `device_tokens` (push registry — built real in Phase 3, migration 018), `notification_preferences` (stub for later phase). Add `org_id` (NOT NULL, FK, indexed) on every tenant-scoped table — projects, sprints, tickets, comments, ticket_status_history. Hot-path indexes per `dev-standards.md` (RF-14 list) at first migration.
- **Multi-tenant middleware chain.** `verifyJwt` → `loadUser` → `checkOrgMembership` → `checkSubscription` → attach `req.context`. Each step its own ~10-30 line file in `backend/middleware/auth/`. JWT is the only source of truth for `org_id`.
- **Signup → email verify → org create flow.** Cognito-managed email verification mandatory before org creation (anti-spam). **Lazy-sync** in auth middleware creates the `users` row on first authenticated request — no post-confirmation Lambda. Saves Lambda function + IAM + deploy + monitoring overhead. Cognito's **default email sender** (5/day cap, generic `no-reply@verificationemail.com` address) covers Phase 1 dev/early-staging needs; SES verified sender domain moves to Phase 3 alongside the rest of product email wiring.
- **Forgot password + login + logout.** Cognito-managed flows.
- **Org CRUD.** Create org, view settings, transfer ownership, leave org (last-owner guard).
- **Org switcher in main layout.** Right-side profile dropdown → `POST /api/v1/auth/switch-org` → Cognito attribute update → frontend force-refresh tokens → React Query cache cleared.
- **Invite system.** Token-based email invites, org-scoped, expiry cleanup (cron in Phase 3 alongside other crons; v1 ships expiry only via background-jobs pattern). Per RF-12.
- **RBAC enforcement.** Owner / admin / PM / user roles per `guide-rbac.md`. Middleware reads `user_orgs.role`. Project-level role overlay deferred to Phase 2 with the retrofit.
- **Google SSO + Microsoft SSO.** Cognito user pool federated identity providers, exposed via Amplify on the login UI. Per RF-7. GitHub SSO deferred to v3.
- **Main layout shell.** Sidebar + top nav + org switcher + main content area. Per-page shells empty at end of Phase 1 — get filled in Phase 2.
- ~~Seed script~~ **deferred to Phase 2.** Phase 1 testing happens via manual signup through the UI (literally exercises the signup flow you're building). Seed script lands in Phase 2 when known-state across orgs/users/projects becomes needed for RBAC + multi-tenant testing. When it lands: `backend/scripts/seed-dev.ts`, uses Cognito `AdminCreateUser` (`MessageAction=SUPPRESS`, `email_verified=true`) + `AdminSetUserPassword(Permanent=true)` for 2 orgs × 4 roles = 8 users; appends to the existing test-creds file (v1 entries kept intact).
- **Rate-limiter swap.** `express-rate-limit` → `rate-limit-postgresql` PostgresStore. ~3 lines in `backend/middleware/rateLimiter.ts`.

**Federated SSO / domain auto-join clarification (RF-7):** `dip@acme.com` signing in via Microsoft SSO becomes a Cognito user but does **not** auto-join the Acme org. Q6 invites remain the only path to org membership. Domain-based auto-org-join is parked in `upgrades.md` for v3+.

**Architecture decisions already locked:**

- Single DB, `org_id` on every tenant table, indexed (Q3, RF-14).
- Tenant isolation = middleware (RLS as defense-in-depth deferred — see `upgrades.md`).
- Schema uniformity preserves per-org sharding option if a customer demands it.

---

## Phase 2 — Multi-tenant retrofit + v1 fixes

The carry-over work. Existing v1 modules — projects, sprints, tickets, comments, ticket_status_history, reports, search, backlog — retrofitted to multi-tenant. v1 feedback items batched in.

**Progress tracker:**
- ✅ Foundation: `getMembership` exposes role + sub-status; `AuthUser.currentOrgRole` / `currentOrgSubscriptionStatus` populated by `authMiddleware`; new `requireOrgContext` + `requireOrgRole` middleware; `dev-standards.md` §2 chain example codified.
- ✅ Migrations 005 (projects + project_members), 006 (sprints), 007 (tickets + comments + ticket_status_history). All tenant tables have `org_id UUID NOT NULL` FK to organizations (CASCADE), every table indexes `org_id` per RF-14, BIGSERIAL → JS number via pg type parser.
- ✅ Projects module retrofitted (`backend/modules/projects/`) — org-scoped queries, full middleware chain wired, heavy step-by-step logging, mounted at `/api/v1/projects`. `projects.service.ts` exposes the cross-module read API.
- ✅ Sprints module (`backend/modules/sprints/`) — extracted as its own module per Q12; sub-mounted at `/api/v1/projects/:id/sprints/*`; transactions for active→completed (move incomplete tickets back to backlog) + delete (move tickets back, then delete sprint); partial unique idx enforces one-active-sprint-per-project at DB level.
- ✅ Tickets + comments + ticket_status_history (`backend/modules/tickets/`) — sub-mounted at `/api/v1/projects/:id/tickets/*`; advisory-lock-per-project + MAX(key)+1 transaction for ticket creation; status changes log to `ticket_status_history` with `org_id`; comments nested under tickets; deleteComment differentiates own-vs-elevated inside the handler.
- ✅ Reports module (`backend/modules/reports/`) — burndown / sprint-report / velocity at `/api/v1/projects/:id/reports/*`; all queries org-scoped + visibility-aware.
- ✅ Search module (`backend/modules/search/`) — `/api/v1/search?q=` org-scoped + visibility-aware ticket search; ranks key matches first.
- ✅ Users module (`backend/modules/users/`) — narrow surface: `/api/v1/users/:id/tickets` cross-project assignee listing in current org. Member listing moved to `/api/v1/orgs/:id/members` (orgs module owns membership) and role changes will land in v1-feedback batch.
- ✅ `/api/v1/me/tickets` — wired now that tickets module is multi-tenant-aware.
- ✅ Self-verify pass — every v2 module sources `org_id` from `req.context`; no `req.params`-as-org-id; no `req.user.role_type` reads; no `isMemberOfOrg` callers; `tsc --noEmit` clean; app boot clean.
- ✅ Backend Project response embeds `sprints[].tickets[]` + `backlog[]` (v1-parity nested shape); `tickets.service`/`sprints.service` expose cross-module reads per Q12; `getAllTicketsForProject` added.
- ✅ `/me/tickets` + `/users/:id/tickets` return v1 `MyWorkItem` nested shape (`{ ticket, project, sprint }`) so My-Work page renders unchanged.
- ✅ Org-member admin endpoints — `PATCH /api/v1/orgs/:id/members/:userId` (change role + label) and `DELETE /api/v1/orgs/:id/members/:userId` (remove). Owner-protection enforced (owner role can't be changed or removed via these endpoints; ownership transfer is a separate flow).
- ✅ Frontend full reveal — all v1 pages restored from `_v1-archive` (Dashboard, My Work, Team, Admin, Projects/[id]/{overview,board,backlog,reports,archive,settings}, Sprints/[sprintId], Tickets/[key]); modals (Create{Project,Sprint,Ticket} + AddMember); SearchBar + SearchModal; ProjectSubNav + TicketPanel.
- ✅ Frontend rewired to v2 contracts — `useTeam` now calls `/orgs/:orgId/members` and adapts to `Member` shape; admin mutations call `/orgs/:orgId/members/:userId`; every `user.role_type` / `user.role_name` reference replaced with org membership lookups via `useCurrentRole` / `useCurrentMembership`; `MyWorkItem` type loosened to match v2 backend shape; sidebar Phase 2 nav uncommented; SearchBar wired into Header with ⌘K shortcut.
- ✅ v1 feedback batch + UI-pass round 1 (full UI test pass continues before Phase 3):
  - ✅ Private-by-default (schema `DEFAULT 'private'` in `005_projects.sql`; UI initial visibility flipped in `CreateProjectModal`).
  - ✅ Non-admin empty-state on Dashboard — points users to ask an admin/PM instead of showing the admin-only "Create project" pitch (`MESSAGES.dashboard.noProjectsNonAdmin`).
  - ✅ Org switcher in header — rebuilt as a dedicated org-led control (Vercel / Linear / Notion pattern). Trigger leads with a colored `Building2`-icon square (deterministic palette via new `orgColor(slug)` util in `lib/project.utils.ts`) + org name + `@slug` + rotating chevron; user avatar removed from the trigger entirely so it no longer reads as a profile/logout button. Per-org color carries identity; the Building2 glyph carries the "this is an org" semantic — clearer than a bare initial. Dropdown richened with icons (Building2, ArrowRightLeft, Check, User, Settings), one colored Building2 square per org row, current-org card with checkmark, secondary "Signed in as" block, and a footer "Account & organization settings" link. Sign-out remains in the sidebar (single source of truth for destructive account actions).
  - ✅ `RETURNING` alias bug fixed in `projects.model.ts` — split `PROJECT_COLS_PREFIXED` (SELECT) and `PROJECT_COLS` (RETURNING) so INSERT/UPDATE don't reference the missing `p` alias.
  - ✅ `tickets.model.createTicket` INSERT column-order bug fixed — value tuple had `priority` in slot 9 and `status` in slot 10, but column list had `status` 9th and `priority` 10th. Resulted in priority CHECK firing on a 'todo' string and status CHECK firing on 'medium'. Swapped values to match column order; added a comment so future edits keep the two in lock-step.
  - ✅ Route-aware Sidebar restored (v1-parity) — on `/projects/[id]/*` paths the sidebar swaps to `ProjectSidebar` (back-link, project identity tile, Overview/Board/Backlog/Archive/Reports/Project Settings sub-nav, sprint list sorted active→planned→completed, "New sprint" CTA for PM+); other paths keep `GlobalSidebar` (dashboard nav + flat project list + archived collapsible). Adds missing icons (`ChevronLeft`, `ChevronRight`, `Archive`, `Plus`, `FolderOpen`, `Layers`, `List`, `BarChart2`, `LayoutGrid`, `SlidersHorizontal`) to `lib/icons.ts`. Role gating reads off `useCurrentMembership()` instead of v1's flat `user.role_type`.
  - ✅ Cross-tenant cache-poisoning bug closed — switching orgs while viewing a private project from the previous org used to leave that project rendered (cache survived) while child requests (comments, status updates) failed with "project not found". Three-layer fix:
    1. `Header.tsx` `switchOrg.onSuccess` now does `await hydrate() → qc.clear() → router.replace('/dashboard')`. Previously only invalidated `['me']` and called `router.refresh()`, which kept the stale project rendered.
    2. Every tenant-scoped TanStack Query key is now `['org', orgId, ...]` per `dev-standards.md` §3 — applied across `useProjects`, `useTickets`, `useSprints`, `useComments`, `useReports`, `useSearch`, `useMyWork`, `useTeam`. Hooks read `currentOrgId` from the auth store internally and disable queries while it's null. Even if cache-clear ever regresses, two orgs' entries can no longer collide on the same key.
    3. `(app)/layout.tsx` watches `currentOrgId` via a ref; any transition (Header-initiated, cross-tab, future direct mutation) triggers `qc.clear()` + redirect to `/dashboard`. Last line of defense.
  - ✅ Ownership-transfer flow — Phase 1 gap closed. New backend endpoint `POST /api/v1/orgs/:id/transfer-ownership` (owner-only) does an atomic demote-then-promote inside a single transaction with `FOR UPDATE` row locks; the partial unique index `one_owner_per_org` enforces single-owner invariant on commit. Settings page adds a red "Danger zone" section visible only to the current owner — recipient picker + typed-email confirmation gate + irreversible warning. After success: re-hydrate auth store + `qc.clear()` so the caller's UI flips to admin immediately. MFA-gating parked for v3 per `upgrades.md` § OTP / 2FA for ownership transfer.
  - ✅ Disable Create-Ticket when not a project member — new `canCreateTicketInProject()` + `createTicketBlockedReason()` helpers in `lib/project.utils.ts` mirror the guide-rbac.md ticket-create matrix exactly: owner/admin always; PM-in or PM-on-public; user-in only. Wired into board page (header CTA + DroppableColumn's hover-Add) and backlog page (header CTA + SprintSection's Add + BacklogSection's Add). Hidden entirely in column hover (cleaner than disabled button flashing on every hover); tooltip on top-right buttons explains why. Archived projects also block.
  - ✅ Sprint manager scope — verified already enforced correctly. `guide-rbac.md §Sprint actions` table is the definitive matrix (owner/admin/PM-in/PM-on-public ✓; PM-not-in-private / user — ✗). Backend `sprints.routes.ts` uses `requireOrgRole('owner','admin','project_manager')` for org gate; handlers call `loadProjectForCaller` for the PM-on-private-project membership check. Frontend Sidebar gates the "New sprint" CTA on `canManageSprints` (owner/admin/PM). No code change needed — clarification = doc cross-reference (this note).
  - ✅ Dashboard ↔ project mismatch — added `projectKeys.all(orgId)` invalidation to `useTickets` (create/update/move/delete), `useSprints` (create/update/start/complete/delete), and `useComments` (add/delete). Dashboard summaries (ticket count, active sprint name, last-active) now stay in sync with project detail after every mutation. Previously only the detail key got invalidated, so the summary stayed stale until /projects refetched naturally.
  - ✅ Instant role-change reflection — `(app)/layout.tsx` adds `visibilitychange` + `focus` listeners that call `useAuthStore.hydrate()` (throttled to 30s) when the tab becomes visible. When an admin in another session changes your role, you pick up the new role on your next tab-focus event. Backend role check runs from DB on every request (per `dev-standards.md` §2), so server-side is always fresh — this fixes only the client-side cached display.
  - ✅ Cross-tab logout — `(app)/layout.tsx` adds a `storage` event listener that detects token removal from another tab. When sign-out fires in tab A, tab B sees the storage event, verifies tokens are gone, calls `clearAuth()` + `qc.clear()` + redirects to `/auth/login`. Matches the pattern locked in `v2-plans.md` § Cross-tab session sync.
  - ✅ Migration 008 — `archived_at TIMESTAMPTZ NULL` added to `projects` and `sprints`. Partial indexes `idx_*_archived_at WHERE archived_at IS NOT NULL` for the archive-page lookup. Display of the archived date is deferred to v3 (column ships now so audit data is captured from day one). Backfilled existing archived projects (`updated_at` as proxy).
  - ✅ Project unarchive — `useUnarchiveProject` hook + Danger Zone in project settings now flips between Archive / Unarchive depending on `project.archived`. Unarchive triggers an "Are you sure?" dialog before mutating. Gate widened from owner/admin-only to **owner / admin / PM-in / PM-on-public** per guide-rbac.md §Project actions; Delete stays owner/admin-only per note ³.
  - ✅ Sprint archive / unarchive — `useArchiveSprint` + `useUnarchiveSprint` hooks; sprint page now shows Archive (or Unarchive) button beside Delete. Backend rejects archiving an active sprint (complete it first); unarchive is unrestricted. Archived sprints filtered out of Sidebar's sprint list and into the Archive page (which previously showed completed sprints — re-aligned to v1-feedback Item 17 lock: `planned → active → completed → archived` lifecycle, archive is the deliberate manual step).
  - ✅ Header search bar centered (`mx-auto` inside the flex-1 column) — restores v1's exactly-centered alignment regardless of right-cluster width.
  - ✅ Reports empty state — when no sprints exist, render a proper centered icon + title + description block (matches the dashboard/backlog empty-state look) instead of a single text line pinned to the top.
  - ✅ AddMemberModal invite link — footer shortcut "Don't see them? Invite by email →" linking to `/team` (where `InviteMemberModal` lives). Keeps the flow alive when the target user isn't an org member yet.
  - ✅ Create-Ticket buttons stay disabled on archived projects — already in place from the v1-fixes batch; relies on `!project.archived && canCreateTicketInProject(...)` in board + backlog pages. Backend rejects writes too; both gates align.
- ✅ UI-pass round 2 (2026-05-26) — visual polish + structural changes surfaced during the manual UI walkthrough:
  - **Dashboard rebuilt** (`/dashboard`) — was just a project list; now a proper dashboard with welcome header + 4 stat cards (My open tickets, In-progress/review, Active sprints, Active projects) + two-column body (My open tickets top-5 left, Active sprints summary right) + Projects grid as section 4. All derived from `useProjects()` + `useMyWork()` — zero new backend.
  - **Admin page merged into Team** — `/admin` 301-redirects to `/team`; sidebar drops the Admin link. Team page now renders inline role + remove controls based on caller's role (owner/admin/PM see admin controls, others see read-only). Slack / Linear / GitHub pattern. Adds `roleChipClass` everywhere a role surfaces.
  - **Project settings layout** — bumped from `max-w-2xl` single column → `max-w-6xl` 5-column grid. General + Danger zone on left (col-span-3, 60% — forms benefit from horizontal room); Members on right (col-span-2, 40% — list scrolls internally past 640px). Mobile stacks single-column in source order (General → Members → Danger).
  - **Project settings: view/edit pattern** for the General section — read-only by default; single "Edit" button in section header reveals the form (name, description, visibility) with Save changes + Cancel at the bottom. Save disabled when nothing changed. Removed the always-visible bottom Save button + the per-field description edit mode.
  - **Welcome page gated** — new users now see a two-path prompt ("Waiting for an invite?" vs "Starting fresh?") with a "Create an organization" button. Click reveals the form. Prevents accidental "I'll just fill this in" creating a wrong second org for users who landed here to accept an invite.
  - **Sprint page: archive lock + rename** — `canEdit = !isCompleted && !isArchived && canManage`. Archived sprints become fully read-only (no goal edit, no rename, no date edits) with an "Archived (read-only)" banner at top. New Rename icon next to sprint name opens a confirmation dialog (name flows into reports/archive/search — explicit intent required).
  - **Ticket page status dropdown** — restored v1's colored styling. Added `appearance-none` + a ChevronDown overlay so the per-status background/text colors render in all browsers (native `<select>` was overriding them). In Progress = amber, In Review = info-blue, Done = success-green, To Do = neutral.
  - **Role chips** (Owner / Admin / PM / User) — moved from outline+tint to **solid filled badges** (`bg-warning`/`bg-primary`/`bg-success`/etc + white text + shadow). Subscription chips kept their outline-tinted style. The two-axis split (hue + visual weight) means admin-blue ≠ trial-blue even when hues overlap. Shared via new `lib/role.utils.ts` (`roleChipClass(role, size?)`).
  - **Subscription chip** — new `components/SubscriptionStatusChip.tsx` (Trial/Active/Suspended/Cancelled, capitalized + colored + outline-tinted). Replaces raw `lowercase` text in Header dropdown + Settings.
  - **Custom Reports sprint dropdown** — replaced native `<select>` with a click-outside-closing custom listbox. Each row carries the colored sprint status pill (using `SPRINT_PILL_BASE` + `sprintDisplayStatus`) — native selects can't style options.
  - **Sprint status pills** moved from filled-bg to outline + colored text (`border-success/60 text-success` etc.) via new `lib/sprint.utils.ts` (`sprintDisplayStatus(sprint)` + `SPRINT_PILL_BASE`). Sprint-displayed-as-Archived now wins over its underlying `status: completed`. Applied across Sidebar / Overview / Backlog / Sprint header / Archive / Reports.
  - **`isLiveSprint(sprint)` helper** — filters archived sprints out of Backlog + Overview pages (archived sprints live exclusively on the Archive page per v1-feedback Item 17 lock).
  - **Reports + Settings empty states** — proper centered icon + title + description (matches the dashboard/backlog look) instead of single lines pinned top.
  - **Hook-order bug fixed** on ticket detail page — `useUpdateTicket` + 3 mutation hooks were called *after* early returns for `isLoading` / `error`, so first render skipped them and second render added them → React threw "Rendered more hooks than during the previous render". Moved all hook calls above the early returns with `ticketId` falling back to `''` while loading. The 3 `eslint-disable react-hooks/rules-of-hooks` comments removed — the warning was correctly flagging this; silencing it was the wrong move.
  - **Org switcher distinct trigger** — was a plain user-avatar; now a colored `Building2`-icon square (per-org color via `orgColor(slug)`) + org name + slug + rotating chevron, reads unambiguously as an org switcher (Vercel/Linear/Notion pattern).
  - **My Work group-by visibility** — selected option's `bg-surface` was indistinguishable from the toolbar's `bg-surface-raised`. Bumped to `bg-primary-subtle` + `text-primary` + `border-primary/40` so the selection is unmistakable while still lighter than the solid-primary Status filter above it.
  - **AddMemberModal invite shortcut** — footer link "Don't see them? Invite by email →" → `/team` (where the InviteMemberModal lives) so the flow doesn't dead-end when the target user isn't an org member yet.
  - **Search bar centered** in Header (`mx-auto`) — restores v1 alignment regardless of right-cluster width.
  - **Color assignment v3 plan** captured in `upgrades.md` — birthday-paradox math + the stored `color_index` column approach. Current 6-color hash kept for v2; collision-free assignment deferred to v3.
- ✅ UI-pass round 3 (2026-05-27) — incremental fixes surfaced as the manual walkthrough resumes:
  - **Cross-tab session rework + URL-slug-driven org context** (convo-058 — superseded convo-057's silent-rehydrate fix). Five linked changes shipped together:
    1. **Hydrate inflight dedupe singleton** — closes the convo-056 parked item. `auth.store.ts` `hydrate()` now reuses a module-scope `inflightHydrate: Promise | null`; concurrent callers `await` the same `/me` request. Fixes the 429 that convo-057's storage-event-driven re-hydrates surfaced when multiple writes fired in the same tick.
    2. **All `(app)` routes moved under `/orgs/[slug]/...`** — path-based tenancy realized in v2 (Q2 decision was always path-based; v3 was only the slug-rename + alias redirects). Folder tree migrated from `app/(app)/` → `app/orgs/[slug]/`. Internal route detection regex in `Sidebar.tsx` updated to `^/orgs/[^/]+/projects/([^/]+)`.
    3. **Slug → orgId resolver, URL is source of truth for current org** — new `lib/routes.ts` with `orgRoute(slug, subpath)`, `useCurrentSlug()`, `defaultDashboardRoute(memberships, preferredOrgId)`. New `orgs/[slug]/layout.tsx` reads slug from `useParams()`, resolves to membership, mirrors orgId to zustand via new `setCurrentOrgId()` action. Each tab independently holds its own org because the URL is per-tab (Jira / Linear / Notion pattern).
    4. **Org switch is a navigation, not a Cognito write** — `Header.tsx` switchOrg now just calls `router.push(orgRoute(targetSlug, '/dashboard'))`. Removed: `POST /auth/switch-org` call, `refreshTokens()`, `hydrate()`, `qc.clear()` — the layout's slug-transition effect handles cache clearing and currentOrgId sync now. Cognito `custom:current_org_id` becomes "default on next fresh login" only — tab-local switches don't touch it. Two tabs can sit in two different orgs without stepping on each other.
    5. **All internal link constructors slug-prefixed** — Sidebar, Header, ProjectSubNav, TicketPanel, AddMemberModal, CreateProjectModal, SearchBar, SearchModal, dashboard / my-work / projects / sprints / tickets / settings pages — every `href` and `router.push/replace` for tenant-scoped routes now goes through `orgRoute(slug, ...)`. Off-slug pages (login, welcome, invite, root `/`) use `defaultDashboardRoute(memberships, preferredOrgId)` to land users in the right org after sign-in / invite-accept / org-creation.
    6. **Cross-tab events use sonner toasts (not silent state mutation)**:
       - **Logout banner + delayed redirect** — storage event with tokens-removed → toast "Signed out in another tab — Redirecting to sign-in…" (1.5s) → `qc.clear()` + `clearAuth()` + `router.replace('/auth/login')`. Matches Jira's "session ended" UX.
       - **Login-page propagation** — `/auth/login` mounts a storage listener; tokens appearing in another tab → auto-redirect this tab to `defaultDashboardRoute()`. Also on mount: if tokens already present, skip the form (handles cold-open while sibling tab is signed in). Invite-link caveat: if `?invite=<token>`, redirect to `/invite/<token>` instead.
       - **Account-swap explicit banner** — storage event with tokens-replaced-by-different-`sub` → persistent sonner `toast.custom` with two actions: **[Switch this tab]** (`qc.clear()` + `hydrate()`, adopt the new identity) or **[Sign back in]** (`clearAuth()` + `/auth/login`, let the user choose). No silent rehydrate (convo-057's wrong response) — explicit user choice only, matches Jira / Linear / Notion. **Banner persists across refresh** via `rai.pendingAccountSwap` sessionStorage marker (per-tab, dies on tab close): layout mount re-fires the banner and render-gates the shell until the user picks. Stale markers (sub no longer matches the current token) are cleared automatically.
    7. **Cognito `custom:current_org_id` attribute** — backend `POST /auth/switch-org` endpoint kept (still useful for "remember this as my default" or auto-pick during welcome flow), but the frontend org switcher no longer calls it on every switch. The Cognito claim is now "default org on next fresh login" only; URL slug is the per-tab source of truth.
  - **Unarchive sprint confirm** — Archive page (`projects/[id]/archive/page.tsx`) and sprint detail page (`projects/[id]/sprints/[sprintId]/page.tsx`) both had bare-click "Unarchive" buttons that mutated state on first click. Inline view→confirm card added to both (matches existing Archive/Delete confirm pattern in the same file). Archive page: per-row `confirming` state in `ArchivedSprintCard` toggles the right-side action cluster between [Unarchive] and `Move back? [Confirm] [Cancel]`. Sprint detail page: `confirmUnarchive` state mirrors the existing `confirmArchive`/`confirmDelete` pattern, swapping the single button for a `Move this sprint back to the active list? [Confirm unarchive] [Cancel]` row. Matches [[feedback_confirm_before_sensitive_action]] - no persistent state change on a single click.
  - **Cross-org context bug + 6-item batch (convo-058 follow-ups)** — surfaced during the walkthrough. (1) **Cross-org project list contamination + 404 on click** — root cause: the URL-slug refactor dropped the Cognito attribute write on every org switch but the backend was still reading `currentOrgId` from the JWT claim, so two tabs in two orgs both pinned to whichever org Cognito had. Fix: frontend `api.ts` injects an `X-Org-Id` header derived from the URL slug + memberships; backend `authMiddleware.ts` reads header first, falls back to JWT claim. Pure URL → backend context, every request. (2) **Settings page white-screen** — downstream symptom of (1); also refactored Settings' own `SwitchOrgSection` to use `router.push(orgRoute(...))` instead of the legacy `/auth/switch-org` POST. (3) **Invite page wrong-account UX** — consolidated the duplicate warning text + button into one block with explicit `[Cancel]` + `[Sign out & switch]` buttons; removed the misleading text that mentioned "Sign out" but wasn't clickable; added `cursor-default select-text` to warning divs so it's unambiguous they're text not buttons. (4) **Create another org entry points** — new `Plus`-prefixed entry in the Header org-switcher dropdown + a new "Add another organization" section in Settings, both routing to `/welcome?create=1&from=<slug>`. Welcome page accepts the query params: skips the auto-redirect when `create=1`, renders a `← Back` button that returns the user to the previous org's dashboard via the `from` slug, jumps `CreateOrgSection` straight to the form (skipping the two-path prompt) via new `startWithForm` prop. (5) **Sign-out confirmation toast** — new shared helper `lib/confirmToast.tsx` exposes `confirmToast({title, description, confirmLabel, variant})` returning `Promise<boolean>`. Renders a sonner `toast.custom` with the danger/warning variant colors matching the account-swap banner pattern. Sidebar and Welcome's sign-out flows now confirm before clearing auth. Pattern is reusable for any future destructive single-click action. (6) **Em-dash → hyphen across all backend + frontend TS source** — Windows PowerShell console rendered the UTF-8 em-dash (U+2014) as `ΓÇö` because the default codepage isn't UTF-8. Bulk sed across all `.ts`/`.tsx` files (excluding v1-archive + globals.css). Comments and log strings both cleaned. Cross-platform safe regardless of terminal codepage.
  - **Mobile UX + ticket page revamp + cross-tab loading watchdog (2026-05-28, convo-060)** — happy-path desktop testing confirmed working, walkthrough surfaced mobile + full-page-ticket items. Shipped as one batch:
    1. **Settings org-section reorder** — was Account / Password / Appearance / Current org / Switch org / **Manage subscription** / Other-domain-orgs / Add-another / Danger. Now: Account / Password / Appearance / Current org / **Manage subscription** (sits with Current org since it's billing for the org you're in) / Switch org / Add another / Other-domain-orgs / Danger. Cluster reads as Personal → Current org + its billing → multi-org context → destructive.
    2. **Theme-toggle mobile lag fix** — rapid taps on mobile felt stuck because (a) absent `touch-action: manipulation` triggered ~300ms tap-delay, (b) every flip cascade-repainted ALL `transition-colors` elements (~hundreds on Settings) which mobile GPU can't drain, (c) zero throttle made spam clicks queue paint frames. Fix: 200ms cooldown in `theme.store.ts` `toggle()` (module-scope `lastToggleAt`), `touch-manipulation` class on the Header + Settings theme buttons.
    3. **Mobile kanban redesign** — horizontal kanban is unusable on phone (sideways scroll while dragging cards left/right). Mobile now stacks status columns vertically (`flex-col md:flex-row`); within each column, cards scroll horizontally (`flex-row overflow-x-auto md:flex-col`) so a To-Do with 50 cards doesn't push every other column off-screen. Cards drag UP/DOWN across status sections (dnd-kit direction-agnostic; auto-scroll handles cross-column drag). Coarse-pointer detection in `BoardPage` (`matchMedia('(pointer: coarse)')`) disables double-tap-navigate on touch — synthetic-click duplication was making single taps register as double-clicks and opening the ticket page instead of the side panel.
    4. **Mobile ticket page split fix** — full ticket page's `overflow-hidden` + per-pane `overflow-y-auto` collapsed the main column to a sliver on mobile because the right rail's natural height eats most of the viewport. Mobile now lets the page scroll naturally (`flex-col + overflow-y-auto` on outer, panes lose their own scroll), desktop unchanged.
    5. **ProjectSubNav filter stack on mobile** — Assignee + Type rows were jammed into one horizontal scroll; now stacked (`flex-col md:flex-row`) with vertical dividers `hidden md:block` and both filter groups `flex-wrap`. Avatars + chips wrap naturally on narrow viewports.
    6. **Mobile drawer below header** — opening the hamburger drawer covered the top nav (drawer overlay was `top-0`, z-40, header z-30). Drawer overlay now starts at `top-14` so the header stays sticky and the burger/theme/org-switcher remain tappable while the drawer is open.
    7. **Username always at top of sidebar** — `UserIdentityHeader` extracted as a shared component used by both `GlobalSidebar` and `ProjectSidebar`. Previously the project sidebar dropped the user identity in favor of the project chip; now both show user (name + role) at the top, with project context below in project routes.
    8. **Status dropdown color fix** — the trigger select was bg-flooded (`bg-warning-subtle` etc.) making frequently-changed control look heavy. Now text + border only (`border-warning/50 text-warning font-semibold`); a small colored dot before the label (new `STATUS_META[*].dot` field, e.g. `bg-warning`) carries identity. Header pill on the ticket page got the same dot. Per-option colors in the open `<option>` list need a custom popover (native `<option>` is unstylable cross-browser); parked as a separate item.
    9. **Stuck-loading watchdog (cross-tab race recovery)** — user reported "stuck on loading screen forever" after cross-tab org switch / logout with no banner / no warning. Root cause hypothesis: `isHydrating` gets wedged at `true` when /me's promise doesn't settle (race with token mutation, backgrounded-tab throttle, etc.). New `forceResetHydrate` action on `auth.store` clears `inflightHydrate` + sets `isHydrating: false, hydrateAttempted: true`. New watchdog in `orgs/[slug]/layout.tsx`: when `isHydrating` flips true, arm a 12s timer (slightly above axios's 10s timeout). If still true at 12s, force-reset and let the gate effect re-evaluate (redirects to /auth/login or renders with cached state). Bounded recovery per [[feedback_redirect_loops_forbidden]] — one-shot reset, no retry loop.
    10. **Full-page ticket revamp — document layout (no right rail)** — user feedback: "right side too narrow, left side too empty, the expand-to-full-page felt like a stretched side panel". The side panel stays as-is (good for in-context peek). The full page is now its own surface: sticky header bar (breadcrumb + status pill with colored dot, max-w-4xl centered), title at text-3xl, **horizontal properties strip** (Status / Assignee / Priority / Type / Sprint as 5-column compact grid that wraps on small viewports), then content sections (Description card, Parent, Sub-tickets, Activity), then a subtle metadata footer (Reporter / Created / Updated as horizontal strip), then a Danger-zone card (delete, admin-only) at the bottom. Each property in the strip uses `appearance-none` selects with leading icon/dot + ChevronDown overlay. Right rail entirely removed.
    11. **Drag-and-drop on mobile working again** — previous fix added `touch-manipulation` to all draggable cards which override dnd-kit's `touch-action: none`, so the browser claimed the touch for pan/scroll before the TouchSensor's 250ms long-press could activate. `touch-manipulation` removed from `DraggableCard`; long-press → drag works again, single tap opens panel.
    12. **Mobile nav declutter + floating search FAB** — top nav on mobile was 6 elements crammed in (burger / Logo / search / theme / bell / org switcher). Mobile center search button moved to a floating action button (FAB) at `bottom-12 right-4`, `z-30`, `md:hidden`. The center column is now `hidden md:block` on mobile; left cluster (burger + Logo) and right cluster (theme + bell + org switcher) get full breathing room.
    13. **Sidebar auto-close on header taps** — `useUIStore.closeSidebar()` now fires from notification bell, org-switcher trigger, and search FAB onClick. Theme toggle intentionally excluded (stateless flip the user might do with drawer open). Header takes `closeSidebar` from the store and passes it to `OrgSwitcher` as a prop.
    14. **Parked v3 — Custom DP / logo / avatar for orgs and projects** — added to `upgrades.md` alongside the deterministic-color section. v2 sticks with colored letter squares + `Building2` icons; v3 adds S3 upload + signed URLs + Lambda resize + nullable `logo_url` columns with the existing colored fallback if null.
- ⏳ Full UI test pass (in progress — user resumes manual walkthrough next session).
- ⏳ Seed script.
- ⏳ Full multi-tenant re-test.
- ⏳ Repo split.

**Scope:**

- Retrofit each model to filter by `req.context.org_id` on every query (no exception).
- Verify every controller chains through the auth middleware (no bypass route).
- Project-level role overlay on top of org RBAC.
- **Seed script** (`backend/scripts/seed-dev.ts`) lands here — 2 orgs × 4 roles = 8 test users, plus seeded projects/sprints/tickets/comments for multi-tenant + RBAC test scenarios. Uses Cognito Admin APIs to create users with pre-verified email and known passwords. Appends to existing test-creds file (v1 entries kept).
- **Repo split happens at end of this phase** — once v2 runs end-to-end (signup → org → projects → sprints → tickets all multi-tenant), separate `backend/` and `frontend/` into independent GitHub repos (`rai-backend`, `rai-frontend`). See Phase 0 § "Repo-split work" for full detail.
- v1 feedback items from `v1-feedback-triage.md`:
  - Private project by default
  - Dashboard ↔ project mismatch check
  - Role change reflects immediately (no stale role display)
  - Logout in one tab → other tabs logout immediately on next action
  - Sprint manager scope clarified
  - Disable "create ticket" button when user is not a member of the project
- Per-page shells filled in. Existing v1 page UI updated for multi-tenant context.
- Full re-test of v1 functionality under multi-tenant boundaries.

---

## Phase 3 — Notifications

Notifications subsystem. Full architecture in `dev-notifications.md` (incl. its implementation-status section). Split from billing for clarity per build plan.

**Status (2026-06-09):** core **event-triggered in-app + email** notifications + the frontend (bell, inbox, email preferences) are **✅ done**. Mobile push backend ✅. **Cron/scheduled jobs ✅ wired 2026-06-09** (sprint auto-start, invite cleanup, billing sweep, org purge). Subscription-event triggers per-item below.

**Scope:**

- ✅ Build `backend/modules/notifications/` — `notify()`/`notifyMany()` service + in-app/email/push channels + template registry (migration 014: `notifications` + `notification_preferences`). 15 event types live.
- **SES setup** — prod access already obtained (✅, per user). Verified sender / branded-from-address wiring is tracked in the pre-prod checklist (`upgrades.md`), not blocking this phase.
- ✅ **Mobile push (FCM) — backend done** (built 2026-06; client + creds remain). Shipped:
  - `device_tokens` table (migration 018) + `push` module — `POST /api/v1/devices` register + `DELETE /api/v1/devices` unregister (user-scoped).
  - Real FCM channel adapter (`channels/push.channel.ts`: send-to-token via `firebase-admin`, prune dead tokens on `registration-token-not-registered`/`invalid-*`). Web push NOT needed — web uses polling.
  - `config/firebase.ts` lazy init from `FIREBASE_SERVICE_ACCOUNT` env (no-op until set, so backend boots without it).
  - **Still to do (not backend code):** create the Firebase project + service-account key → `FIREBASE_SERVICE_ACCOUNT`; mobile client registers/renders; write the handoff doc (API contract agreed → `dev-notifications.md` "Mobile push (FCM)").
- ✅ Wire `notify()` into trigger services — tickets (assigned/status/comment/edited/deleted), sprints (completed/archived), projects (archived/unarchived/deleted/member add+remove), orgs (role-changed/removed), invites (accepted). Billing triggers wired in Phase 4.
- ✅ Build `backend/jobs/cron.ts` (node-cron runner) + `sprint-autostart.job.ts` + `invite-cleanup.job.ts` — **done 2026-06-09**. Runner also drives the Phase 4 `billing-sweep` (T-7d/T-1d warnings + expiry → read-only) and `purge-orgs` (lapsed soft-deleted orgs). Sprint auto-start adds the `sprint_started` notification (in-app + email + push). Migration 021 partial indexes. `CRON_ENABLED=false` disables. Full table → `dev-notifications.md` → Scheduled jobs. **Still deferred:** the *opt-in* sprint-start alert at a user-chosen time (needs a `sprint_start_notifications` table — distinct from auto-start).
- ✅ `notification_preferences` table + **Settings → Notifications** UI (per-type email toggles; in-app always on).
- ✅ In-app notifications = **polling** in v2 (bell badge polls unread count every 45s; WebSocket stays v3, `upgrades.md`).

---

## Phase 4 — Billing

Subscription handling. **Scope expanded 2026-06-08: real Razorpay provider ships in v2** (was: NoOp stub + real provider deferred to v3). `BillingProvider` interface stays so a future Stripe/alt swap is clean.

**Status (2026-06-09):** core billing **✅ built** — `plans`+`subscriptions` (migration 019; price in whole ₹ after migration 022), `BillingProvider` interface + **Razorpay** + **NoOp** providers behind an env-driven factory (plan id env-first), the `billing` module (summary / invoices / subscribe / confirm / auto-renew / OTP-gated cancel / signed webhook), the central read-only **write-gate** (`requireOrgContext` → `403 SUBSCRIPTION_EXPIRED`), 30-day trial on org create, signature verification on both pay paths, the expiry **sweep** script, **all billing notifications** (trial-started / expiring 7d+1d / expired / reactivated), receipts download, and the frontend (Settings → Billing page with recurring/one-time choice + auto-renew toggle + OTP cancel + canceled/one-time states + invoices, read-only banner, 403 interceptor, trial banner, feedback). **Automated billing tests green (6).** **Remaining:** GST invoicing (v3), and wiring `billing:sweep` into the scheduled-jobs runner.

**Scope:**

- ✅ `subscriptions`, `plans` tables (see "Subscription Model" below; migration 019).
- ✅ `BillingProvider` interface + **`RazorpayProvider` implementation** (real charges) + **`NoOpBillingProvider`** fallback (no keys ⇒ NoOp; turning on billing is env-only).
- ✅ Two modes: recurring (auto-renew) + one-time (pay-per-period) — user picks at subscribe; auto-renew toggle in Manage.
- ✅ 30-day trial flow (no card required at signup — card-at-signup stays v3 anti-abuse, `upgrades.md`).
- **Razorpay integration requirements:**
  - Razorpay account + **business KYC verification** (gates live mode — start early).
  - **Test-mode keys now** (Phase 4 dev); **live-mode keys at pre-prod** (per deploy checklist).
  - ✅ **Webhook endpoint** for subscription lifecycle events (signature-verified, raw-body route).
  - ⏳ **GST invoicing** — India-mandatory; tax fields on the invoice + GSTIN capture for business customers.
- ⏳ Pre-expiry email warnings via `backend/jobs/subscription-warning-job.ts` (T-7d, T-1d, T-1h).
- ✅ Read-only mode enforcement on subscription expiry (per Q11 lock) — central `requireOrgContext` write-gate; `npm run billing:sweep` flips lapsed trials/periods.
- Owner-leaves policy: last-owner guard, ownership transfer flow.
- ✅ Billing notification wire-up — trial-started, expiring (7d/1d), expired, reactivated.
- **Seat billing = Jira-style Maximum Quantity Billing:** bill = `price × peak active seats this cycle`; mid-cycle adds prorate, removals get no credit. (Promoted into v2 — see `guide-billing.md`; was previously a v3 follow-up.)
- **Still v3 (advanced billing):** dunning/retries, refunds, chargebacks, annual interval, multi-currency, coupons, subscription pause. See `upgrades.md` § v3 Billing Follow-ups.

---

## Phase 5 — Polish

- Theme refresh (colors, dark mode tweaks).
- Sprint page notes feature.
- AI button placement adjustments.
- Mobile-friendly simplified Kanban view (separate from baseline responsive — see `dev-standards.md` §3).
- **Mobile filter modal for ticket pages** — board / backlog / my-work / reports filters today inline along the toolbar; on narrow viewports they overflow. Replace with a "Filters" button that opens a bottom-sheet modal listing all filters, applies on Save. Surfaced 2026-05-27 during walkthrough; deferred from immediate fix because it's a deliberate UX shift, not a CSS tweak.
- **Data export (org-scoped) — ✅ built 2026-06-08 (pending deploy).** Q14 portability. `GET /orgs/:id/export?format=json|xlsx` (owner/admin), Settings "Export your data" section; Excel via `exceljs` (one sheet per entity). Covers Members/Projects/Sprints/Tickets/Comments.
- **Org data import — back to v3 (2026-06-08).** Counterpart to export: ingest an exported bundle with id remapping + conflict handling. Deferred (uncommon + the hard part); export-only covers the launch "leave with my data" need. See `upgrades.md` § Org-level data import.
- **User-facing entity recycle bin / restore — back to v3 (2026-06-08).** Soft-delete (deleted_at) for projects/sprints/tickets within a retention window + a "Recently deleted" view. Deferred to v3 (not launch-important); only the **org-level** recycle bin ships in v2 (built 2026-06-08, see § Go-to-market lock). See `upgrades.md` § User-facing restore.
- R&D notes — other non-IT use cases.

---

## Phase 6 — Product parity additions

Two items promoted out of `upgrades.md` v3 parking lot on 2026-05-28 — user reclassified them as core product work, not post-launch polish. Schedule alongside Phase 3-5 work (or run as a dedicated phase, devops capacity permitting). Full specs live in `upgrades.md` to avoid duplication.

- **Type-specific ticket fields (Jira parity)** — ✅ **built 2026-06-08 (pending deploy)**. Migration 013 (nullable columns on `tickets`: `epic_name`/`epic_color`, `story_points`, `acceptance_criteria`, `steps_to_reproduce`, `environment`). Type-conditional sections in CreateTicketModal + ticket detail page + TicketPanel via shared `TicketTypeFieldsForm`/`TicketDetailsCard`; backend hard-coded type→fields mapping, type-change clears stale fields. Story-point burnup chart still a future follow-on. See `upgrades.md` § Type-specific ticket fields.
- **Custom DP / logo / avatar — cut back to v3 (2026-06-08).** Not launch-important; the S3 + CloudFront + Lambda-resize subsystem is too much for the pre-prod push. Deterministic colored letter-squares stay as the v2 identity. See `upgrades.md` § Custom DP / logo / avatar.

---

## Phase 7 — Account security hardening

Promoted out of `upgrades.md` v3 parking lot on 2026-06-08 — user pulled the core account-security set into v2 since this is the final pre-prod build. **Mostly Cognito configuration + UI, low engineering.** Full specs stay in `upgrades.md`; this is the v2 build list.

- **MFA / 2FA (TOTP + SMS)** — toggle on in the Cognito user pool (built-in). Build = enrollment UI in Settings + challenge handling in the login flow. Push-based MFA pairs with the mobile app. See `upgrades.md` § MFA / 2FA.
- **Active-sessions UI** — Settings → "Your active sessions". Powered by Cognito `AdminListUserAuthEvents` (data already captured); build is the UI + a "revoke this session" action (`AdminUserGlobalSignOut` / per-session revoke). See `upgrades.md` § Active sessions UI.
- **Suspicious-login detection** — enable Cognito **Advanced Security tier** ($0.05/MAU): adaptive auth, risk scoring, compromised-credential detection. Config + threshold tuning, no app code. See `upgrades.md` § Suspicious activity detection.
- **OTP gate on destructive actions** — ✅ **Done** (own email-OTP, decoupled from MFA). Gates **org delete, ownership transfer, project delete** behind a single-use 6-digit code emailed to the caller (the `otp` module — `POST /otp/request` mints + emails; the action endpoint re-verifies `otpCode`). Replaces the typed-name/typed-email confirmation for these three flows. *Deviation from the original plan:* we did **not** wait on Cognito MFA enrollment — a self-issued email code ships the gate now without the MFA dependency. Sensitive **billing** actions (cancel subscription, change billing email) will reuse the same `otp` allowlist when Phase 4 lands — add an action key + wire the controller. Full spec: `upgrades.md` § OTP gate for all destructive actions.

**Sequencing note (superseded):** the original plan made the OTP gate depend on MFA enrollment landing first. The shipped email-OTP removes that dependency — the gate is live independent of MFA. The Cognito-MFA challenge remains a future hardening option (parked in `upgrades.md`).

---

## Staging deploy — devops checklist

Devops-only steps. Repo split happens first so staging exists on independent infra. Frontend env template at `frontend/.env.example` lists every `NEXT_PUBLIC_*` var to set at build time.

1. Repo split — `rai-backend` + `rai-frontend` in separate GitHub repos.
2. Provision RDS Postgres (free tier OK for staging).
3. Backend on EC2 + Docker — env vars from `backend/.env.example`, DB connection string, Cognito creds.
4. Frontend on S3 + CloudFront — set `NEXT_PUBLIC_*` vars at build time (template: `frontend/.env.example`).
5. Add staging URL to Cognito app client's callback + sign-out URLs (same pool as local — internal use only).
6. CloudWatch logs + SNS alert pipeline (RF-8 item).
7. **Request SES production-access NOW** — AWS review takes 24-48hr; blocks Phase 3 notifications otherwise.
8. Deploy → backend startup auto-runs migrations → frontend deploys.

Notes:
- **Migrations run on backend startup** (`server.ts` → `runMigrations()` → tracked in `schema_migrations` table). Fresh RDS + deploy = all migrations apply automatically.
- **Lazy-sync handles user-not-in-staging-DB** (`authMiddleware.ts` line 116-122). Same Cognito pool means existing users sign in cleanly on the fresh staging DB — backend creates the row on first authenticated request.
- All v2 schema changes from this point forward are additive (new tables for notifications + billing). No breaking migrations expected; standard "edit local → push to RDS via auto-runner" workflow.
- Health endpoint exists (`/health`) — wire to ALB/CloudFront health check.
- Razorpay keys aren't needed yet — billing isn't built. Test-mode keys land when Phase 4 starts.

## Post-deploy verification (QA, not devops)

After devops finishes the deploy, before any external team uses staging:

- **Smoke test:** login + create org + create project + send invite + accept invite.
- **Cross-org isolation probe:** sign in as Org-A user, hit `/api/v1/orgs/<Org-B-id>/projects` and 4 other tenant-scoped endpoints; all must return 403/404. ~10 minutes. This is a security wall check, not a feature test.

---

## Pre-prod work (before prod cutover)

This is the deferred checklist for things needed *before flipping the switch to prod*. Two sub-sections: **paperwork/infra** (most items) and **security testing** (separate so it doesn't get skipped).

### Infra + paperwork

- DNS + ACM cert for prod domain.
- Razorpay **live-mode** keys (test keys come earlier with Phase 4).
- Privacy Policy + Terms of Service — legal review.
- **Email deliverability (critical)** — exit SES sandbox (request production access, ~24h AWS review), add SPF / DKIM / DMARC DNS records, wire Cognito → SES with branded sender. Without it invites + password-resets land in spam or fail. See `upgrades.md` § Pre-production email/sender hardening.
- **Org-level soft-delete + 30-day purge (critical)** — ✅ **built 2026-06-08 (pending deploy)**. Migration 012 (`deleted_at`/`deleted_by` + partial index); `DELETE /orgs/:id` now soft-deletes; `POST /orgs/:id/restore` + `GET /orgs/deleted`; `npm run purge:orgs` script (wire to scheduler in Phase 3); "Recently deleted" restore UI on `/welcome`. Subscription freeze/resume/cancel left as a hook for Phase 4 Billing. See `upgrades.md` § Org-level soft-delete.
- **DB backups + rehearsed restore (critical)** — RDS automated backups / point-in-time recovery, with a restore actually tested once.
- **Critical-error alert pipeline + uptime ping** — CloudWatch + SNS → email on prod failures (RF-8), plus a simple external health-endpoint ping. Don't run paid prod blind.
- Customer support channel set up and monitored (`systems@novetum.com` per [[reference_novetum_role_mailboxes]]).
- Onboarding first-run UX — what new org owner sees post-create (decided during Phase 4 billing; finalized here).
- Release notes / product docs — for internal team and mobile team consumption.
- Full internal team review pass on staging before flipping to prod.
- 30-day trial banner + counter (added during Phase 4 billing; finalized here).
- Mobile team handoff doc — Postman collection or short auth-flow walkthrough so mobile devs aren't reverse-engineering from frontend code.
- **Rate-limiter retuning for prod** — current `1500 req / 15min per IP` works for dev/staging where there's effectively one user. Prod needs (a) per-user limit keyed off `req.user.id` post-auth (corporate NAT means many users behind one IP), (b) per-endpoint differentiation (tighter on `/auth/*`, looser on reads), (c) probably higher global ceiling (~3000-5000/15min).

### Security testing (do NOT skip)

A security testing pass is mandatory before flipping to prod. Anything that touches multi-tenant data needs explicit verification, not just "it works on my dev tab." Items:

- **Cross-org isolation full audit** — not the 10-minute staging smoke probe, but a full sweep on every tenant-scoped endpoint. For each `/orgs/:id/...` and every endpoint that reads `req.user.currentOrgId`: sign in as Org A's user, attempt to read/write Org B's resources via crafted IDs in URL, body, query. All must return 403/404. Document the test matrix.
- **Cognito auth flow audit** — token expiry behavior, refresh-token rotation, federated-link race conditions, password-reset flow, sign-up email-verification flow. Trace each against `dev-standards.md` §8 (AuthService) + `guide-rbac.md`.
- **RBAC matrix verification** — for each role (owner / admin / PM / user), verify the full action matrix in `guide-rbac.md` is correctly enforced on the backend. Frontend gates are convenience; backend must reject regardless of what the UI hides.
- **OWASP Top 10 review** — at minimum: SQL injection (we use parameterized queries everywhere — verify), XSS (React escapes by default — verify no `dangerouslySetInnerHTML`), CSRF (Bearer-token auth is immune by design — verify no cookie-fallback paths), broken authentication (Cognito), security misconfig (helmet headers, CORS), insecure dependencies (`npm audit`).
- **Dependency vulnerability scan** — `npm audit --production` on both backend + frontend. Resolve high/critical findings before prod.
- **Secret scanning** — `gitleaks` or `trufflehog` across the repo to verify no credentials, tokens, or keys are committed. Especially in `_v1-archive/` paths.
- **Rate limit testing** — verify rate limiter trips at expected thresholds and the user-visible message is clear, not a stack trace.
- **TLS / HTTPS verification** — ACM cert valid, redirect HTTP→HTTPS at the edge, no mixed-content warnings.
- **Cognito password policy verification** — minimum length, complexity, lockout behavior match the policy locked in `dev-standards.md`.
- **Session management** — sign-out actually invalidates server-side (we use Cognito GlobalSignOut where the scope allows — verify on staging).
- **Final cross-org isolation full audit** (bullet repeated from above — listed in both places intentionally so it doesn't get checked off prematurely).

**v3 (not in v2):** GitHub SSO, SAML / OIDC, native mobile app, comprehensive audit logging, Microsoft Teams plugin, internal admin panel, real billing provider (Razorpay full hardening), push notifications, manage-devices UI, vanity subdomains. All tracked in `upgrades.md`.

---

## Coding kickoff workflow (per phase)

For each phase, the loop is:

1. **Shell.** Build the page structure for the phase (no mock data; placeholders where data will load). User reviews the shell.
2. **APIs.** Build the backend endpoints and DB work the shell will consume.
3. **Wire.** Connect shell to APIs.
4. **Test end-to-end.** User exercises the functionality, flags changes.
5. **Fix + lock.** Adjustments, re-test, next phase.

Within a phase the shell + API loop is tight (not strictly sequential — close coordination once shell is approved). Shell-first review is the user gate before backend work commits to a contract.

---

## Deferred Features & Alternatives

Parked features and alternative implementations live in **`upgrades.md`**. Two sections there:
- **Upcoming Features** — features parked during decision discussions (code-based invites, RLS layered on middleware, vanity subdomains, MFA, Redis-backed JWT revocation, active sessions UI, etc.).
- **Alternative Implementations** — different ways to do things we're already doing, captured for future swap evaluation (AWS Cognito instead of self-built JWT, BroadcastChannel instead of `storage` event, httpOnly cookie for access token instead of localStorage, etc.).

That doc is the single source of truth — `v2-plans.md`, `v2-decisions.md`, and `dev-standards.md` reference it instead of duplicating.

---

## Architecture Notes

### Database

- **Single DB** with `org_id` on all tenant tables; verify indexes after schema change.
- **Row-Level Security (RLS)** in Postgres — under consideration as a second line of defense after middleware.
- Future-proofing: schema uniformity allows per-org sharding or per-org DB migration if a customer demands it.

### URL strategy

**Decision (Q2): path-based, `rai.app/orgs/<slug>`.** Subdomain (`acme.rai.app`) deferred to v3 (parked in `upgrades.md`).

Rule for all routes and middleware:

- **`org_id` is sourced from the JWT, never from `req.params`.** Auth middleware extracts `org_id` from the JWT and attaches it to `req.context`.
- The URL slug is **display-only** — used for routing, breadcrumbs, and shareable links. If a route includes a slug, middleware must verify it resolves to the same `org_id` as the JWT, otherwise 403.
- Every tenant-scoped query filters on `req.context.org_id`. Never on a value derived from the URL.

Why: trusting URL params for tenancy means a user can edit `/orgs/acme/...` to `/orgs/competitor/...` and the backend would happily serve competitor data. JWT-as-source-of-truth closes that door, and keeps the schema/auth code identical when we migrate to subdomains later.

### Multi-org session model

**Decision (Q1): one user → many orgs.** Schema: `user_orgs(user_id, org_id, role, joined_at, PRIMARY KEY(user_id, org_id))`. JWT carries `current_org_id` claim. Org switch reissues a new JWT.

**Auth middleware chain (per-request, ~3ms with indexes):**

1. `verifyJwt` — signature + expiry
2. `loadUser` — fetch user record
3. `checkOrgMembership` — re-check `user_orgs(user_id, current_org_id)`. Handles mid-session removal (admin kicks user → next request 403s, doesn't wait for JWT TTL).
4. `checkSubscription` — read `organizations.subscription_status`. Active/trial → pass; expired + admin → 402 redirect to billing; expired + non-admin → 402 "contact your admin to renew". Grace-period specifics → Q11.
5. Attach `req.context = { userId, orgId, role, subStatus }`.

Steps 3 and 4 are critical — the JWT's membership/subscription claims are *not* trusted blindly.

**Middleware structure:** each step is its own small (~10–30 line) function in a dedicated `src/middleware/auth/` folder, unit-testable in isolation, composed into the chain. Every tenant-scoped router mounts the full chain — no bypass route. Integration tests cover every gate (expired JWT → 401, non-member → 403, expired sub → 402, removed mid-session → 403).

**Cross-tab session sync:** `storage` event on auth-related localStorage keys (`auth-token`, `current-org-id`). Login / logout / org-switch in one tab fires the event in all other tabs → each tab clears React Query cache and refetches. One mechanism, three problems solved. `BroadcastChannel` is the upgrade path if richer cross-tab messages are needed later.

**Cookie caveat:** `storage` events fire only for localStorage. If JWT later moves to an httpOnly cookie, add a non-sensitive `auth-state-version` flag in localStorage that gets bumped on auth changes — tabs listen for that flag and re-validate via API. Note for the day cookie storage is reconsidered.

**Switcher UX:** right-side profile dropdown listing the user's orgs (with "show more" if >10). Click → call `/api/v1/auth/switch-org` → server returns new JWT → frontend stores it, clears React Query cache, refetches. No login form. Slack/GitHub-style behavior.

**Auth provider: AWS Cognito (locked).** Full lock-in details in `v2-decisions.md` Q1. Summary:

- **User pool:** one Cognito user pool, shared across all orgs. `current_org_id` lives as `custom:current_org_id` on each user (mutable; updated on every org switch).
- **Token TTLs:** 60 min access + 60 min ID + 30 day refresh (Cognito defaults; tunable per app client). Cognito handles rotation, families, replay detection, multi-device, concurrent-refresh dedup internally — no `refresh_tokens` table on our side.
- **Storage:** Amplify SDK manages tokens — localStorage for web by default (configurable to cookie — see `upgrades.md`), iOS Keychain / Android Keystore for mobile.
- **Backend verify:** `aws-jwt-verify` validates token signatures against Cognito's JWKS endpoint. Same middleware code path whether the token comes from the `Authorization` header or a cookie.
- **Login:** `Auth.signIn(email, password)` on the frontend. Cognito issues access + ID + refresh tokens.
- **Logout:** `Auth.signOut()` clears local + revokes refresh server-side. `Auth.signOut({ global: true })` revokes all devices — sub-second, no Redis needed.
- **Org switch:** `POST /api/v1/auth/switch-org` → backend calls `AdminUpdateUserAttributes` to update `custom:current_org_id` → frontend triggers `Auth.currentSession()` refresh → new ID token has new claim.
- **Cross-tab sync:** `storage` event on Amplify's auth-related localStorage keys.
- **Cognito gives us out-of-the-box:** password reset, email verification, account lockout, password strength enforcement, refresh-token rotation, multi-device, concurrent-refresh dedup. MFA, SSO, and suspicious activity detection become Cognito toggles when those features land — no engineering work.
- **No `refresh_tokens` table** — Cognito owns it. Our `users` table has no password column (Cognito owns it); rows are profile data keyed by Cognito's `sub` UUID.
- **Local dev pattern:** shared `rai-dev` Cognito pool for normal local dev; `MockAuthService` implementing the `AuthService` interface (bcrypt + local Postgres) for unit tests; dedicated `rai-ci` pool that resets between CI runs.
- **Plug-and-play swap target preserved:** all auth logic behind `AuthService` interface (see `dev-standards.md` Section 8). v2 ships `CognitoAuthService`. Self-built JWT (`JwtAuthService`) is documented in `upgrades.md` as the alternative implementation if we ever leave AWS.

### Tenant isolation — middleware vs RLS

Decision pending. Two approaches under consideration:

1. **Middleware-only:** auth middleware extracts `org_id` from JWT, attaches to `req.context`, every query helper enforces `WHERE org_id = $orgId`. Easier to debug, but a missed `WHERE` clause = data leak.
2. **RLS:** `SET app.current_org_id = $orgId` per request, Postgres policies enforce. Stronger guarantees, more setup overhead, harder to debug "why is this empty".

Likely path: start with middleware + shared query helpers, add RLS later as defense-in-depth.

### Service layer

Considering:
- `TenantService` — resolve current org, validate membership
- `AuthService` — auth + email verify + invite tokens
- `BillingService` — subscription state, gating (later phase)

### Auth provider — future

- Single Cognito user pool, with `org_id` (and possibly org role) as custom attributes / group claims.
- One pool per org is rejected — doesn't scale, complicates federation.

### Hosting / DB migration timing

Question: move Docker Postgres to RDS now, or after org changes?
**Current thinking:** do org schema changes on Docker Postgres first, validate on staging, then migrate to RDS as a separate, isolated operation. Don't compound a schema overhaul with an infra migration.

---

## Subscription Model (locked at Q10/Q11)

**Trial:**
- Subscription required to use the product. **30-day free trial** on org creation, **no card required.** Advertised as "sign up, no card, 1 month free."
- Email verification (Cognito-managed) required before `orgs.create` can be called.
- No self-serve trial extension — `internal_admin` panel handles it (audit-logged action).

**Pricing:**
- **Per-seat per member.** Seat = `org_members.status = 'active'`. Pending invites and removed users do not count. Re-add of a removed user = 1 seat.
- **Single plan, fully unlocked** (no Free/Pro/Enterprise tiers in v2).
- **Monthly only** (annual interval → v3). **INR only** (multi-currency → v3).
- **Org pays one combined invoice** (`active_seats × price_per_seat`). Individual members never have a payment method. Per-seat is pricing math, not per-user invoicing.
- Mid-cycle seat add: v2 has no money flow; v3 = proration via provider's native subscription-quantity API.
- Minimum 1 seat (the owner).

**Expiry:**
- On trial / subscription end → **indefinite read-only** until paid (or v3 retention policy kicks in via Q14).
- Pre-expiry emails at T-7d, T-1d, T-1h.
- **Blocked under read-only:** create/edit/delete tasks, create/edit/close sprints, change status, assign, invite members, change org settings.
- **Still works under read-only:** login, view, export data, renew, cancel, profile edits.
- Reactivation: instant on payment.
- Cancellation: end-of-period (cancel mid-cycle = full access through cycle end).

**Payment provider abstraction:**
- **`BillingProvider` interface** with pluggable implementations. Interface methods: `createCustomer`, `createSubscription`, `updateSeatCount`, `cancelSubscription`, `handleWebhook`.
- v2 ships **`NoOpBillingProvider`** (writes to DB only — no real billing happens in v2).
- v3 swap target: **`RazorpayBillingProvider`** (India + INR + UPI + GST built-in). `StripeBillingProvider` documented as alternative for non-India expansion.
- App talks to interface, not provider. v3 swap = one DI line + webhook endpoint.

**Schema (v2):**

```sql
subscriptions (
  id, org_id,
  status,                   -- trialing | active | past_due | canceled
  plan_id,
  trial_started_at, trial_ends_at,
  current_period_start, current_period_end,
  canceled_at,              -- set on user-initiated cancel; access until current_period_end
  billing_email,            -- nullable; defaults to owner.email
  razorpay_customer_id,     -- nullable, v3
  razorpay_subscription_id, -- nullable, v3
  stripe_customer_id,       -- nullable, v3 alt
  stripe_subscription_id,   -- nullable, v3 alt
  created_at, updated_at
)

plans (
  id, name,                 -- v2: single 'Standard' plan
  price_per_seat_inr,       -- whole rupees (₹); paise only at the Razorpay call
  currency,                 -- v2: 'INR' only
  billing_interval,         -- 'monthly' | 'annual' (v2: only 'monthly' active)
  is_active,
  created_at
)
```

- **No `seat_count` column on `subscriptions`** — derived live from `org_members`. v3 will snapshot into an `invoices` table at billing time.
- UNIQUE constraint: at most one row per `org_id` with `status IN ('trialing','active','past_due')`. Historical canceled rows allowed.
- `billing_profiles` table (GSTIN, billing state, address) → v3 (needed for GST invoicing).

**Owner-leaves policy:**
- Last owner cannot leave without ownership transfer.
- Stuck cases (fired/ghosted): `internal_admin` can force-reassign.
- Billing contact defaults to owner.email; overridable via `subscriptions.billing_email` (CFO / accounts email).

**v3 follow-ups parked in `upgrades.md`:** GST/Razorpay specifics, dunning, refunds, chargebacks, annual interval, multi-currency, discount codes, subscription pause, mid-cycle proration final lock, reactivation-after-cancel window, `billing_profiles` table.

---

## Internal Admin Panel — deferred to v3

**Moved from v2 → v3** late in the Q10/Q11/Q14 session. Reasoning: v2 customer base is internal team + a few initial orgs; direct DB queries + `support@…` shared inbox handle support volume at this scale. Build the admin panel when v3 ships card-on-file (real billing → real CS volume).

Full spec captured in `upgrades.md` under "Internal Admin Panel (v3)".

---

## Open Questions

All v2 questions resolved in `v2-decisions.md` except the remaining deferred batch:
- **Q12** — Service layer decomposition (build BillingService now or later? The locked subscription schema makes this easier to answer.)
- **Q13 ID format** — UUID everywhere vs mixed (independent of billing).
- **Q14** — Org deletion / data retention (closes the "indefinite read-only → eventual cleanup" loop from Q11).

---

## Notes Captured Verbatim (from planning convo)

> single db with org_id in all tables with index check indexes once
>
> Use **Row-Level Security (RLS)** in PostgreSQL ?
>
> TenantService / AuthService / BillingService (later) ?
>
> as per archietctuer and all am thikning is keep room for improvemnts but cautiously


---

## Appendix — Archived & Merged Docs

Consolidated into this file on **2026-06-02** to cut doc sprawl. Kept verbatim for historical traceability; each block keeps its original `A#` heading so the merged origin stays obvious.

## A1 · v1 Backend Phase Plan  _(was `backend-phases.md`)_
_v1-era build sequencing. Superseded by the Phase 0–5 plan above; kept for reference._

**Rai — Backend Build Phases.** What was built in each phase, key decisions made, and what's coming next. Frontend phases are documented separately in `guide-overview.md`.

### PHASE 0 — Corrective Migrations ✓ DONE
The original migrations (001–009) drifted out of sync with what the frontend
actually expects. Phase 0 fixes all mismatches before any feature module is
built on top. These run automatically on server start via runMigrations().

What changed:
  010  projects: rename prefix → key, add archived BOOLEAN
  011  tickets: rename ticket_number → key, add type/description/parent_id,
               fix status enum (add 'in_review'), fix priority enum (add 'lowest')
  012  sprints: add notes column, remove 'archived' from status enum
  013  drop ticket_details table (description now lives on tickets directly)
  014  drop backlog table (backlog = tickets WHERE sprint_id IS NULL — no table needed)
  015  create project_members table (project_id + user_id, unique constraint)

DB state after Phase 0:
  Tables: users, projects, project_members, sprints, tickets, comments, schema_migrations
  Gone:   backlog, ticket_details

### PHASE 1 — Auth ✓ DONE
Endpoints:
  POST /api/v1/auth/register  — create account, returns JWT + user
  POST /api/v1/auth/login     — authenticate, returns JWT + user
  GET  /api/v1/auth/me        — verify token, returns current user from DB

Key decisions:
  - bcrypt cost factor 12 for password hashing
  - JWT payload contains id, email, role_type only — enough for all RBAC checks
  - /me re-fetches from DB (not decoded from token) — catches deleted/updated users
  - role_name defaults to 'User' on register (bug fixed: was '' before)
  - Token stored in localStorage on frontend, attached as Bearer header on every request

Shared infrastructure built here:
  - authMiddleware.ts — JWT verify, attaches req.user
  - errorHandler.ts   — global unhandled error → 500
  - rateLimiter.ts    — 100 req/15min/IP

### PHASE 2 — Users ✓ DONE
Endpoints:
  GET    /api/v1/users/:id/role  — list all org members (any authenticated user)
  PATCH  /api/v1/users/:id/role  — update role_type + role_name (admin only)
  DELETE /api/v1/users/:id       — delete account (admin only)

Key decisions:
  - requireRole() middleware factory built here — reused by all future modules
    Usage: requireRole('admin') or requireRole('admin', 'project_manager')
  - id returned as string — frontend Member type expects string IDs
  - initials computed from name (first letter of first + last word)
  - Self-protection: admin cannot change their own role or delete their own account
  - toMember() helper shapes raw DB row into the Member response shape

### PHASE 3 — Projects ✓ DONE
Endpoints:
  GET    /api/v1/projects                       — list projects (visibility-filtered)
  POST   /api/v1/projects                       — create project (admin only)
  GET    /api/v1/projects/:id                   — full project detail
  PATCH  /api/v1/projects/:id                   — update project (admin only)
  DELETE /api/v1/projects/:id                   — delete project (admin only)
  POST   /api/v1/projects/:id/members           — add member (admin only)
  DELETE /api/v1/projects/:id/members/:userId   — remove member (admin only)

Complexity handled:

  GET /projects/:id (the hard one):
    The full Project shape the frontend expects is deeply nested:
    sprints → tickets → assignee/reporter, backlog tickets, member list, stats.

    Approach: 4 separate queries (project, members, sprints, tickets) assembled in JS.
    Not one giant JOIN — that would produce duplicate rows and be harder to debug.
    Members + sprints + tickets run in parallel via Promise.all.

    buildFullProject() in projects.types.ts handles all assembly:
    - Builds id→key map once, then each ticket can look up parentKey in O(1)
    - Filters tickets for subTicketKeys per ticket (acceptable for internal tool scale)
    - Groups tickets into sprints by sprint_id, null sprint_id → backlog
    - comments: [] intentionally — comments load via GET /projects/:id/tickets/:key

  Visibility filtering:
    Pushed into SQL WHERE clause (not filtered in JS after fetching).
    Admin: $1 = true short-circuits the WHERE, returns all projects.
    Others: public OR EXISTS(membership check).

  Dynamic PATCH:
    Builds SET clause in JS — only fields present in request body are updated.
    COALESCE can't handle intentionally setting a field to null, so this is safer.

  Transaction on create:
    pool.connect() → BEGIN → INSERT project → INSERT project_member → COMMIT
    Rolls back both if either fails — creator is always a member or neither exists.

  Archived projects:
    Any PATCH on an archived project returns 403. Archive action itself
    (PATCH { archived: true }) works on unarchived projects — once archived, frozen.

### PHASE 4 — Sprints ✓ DONE
All sprint routes nested under /projects/:id/ (same router as projects).

Endpoints:
  POST   /api/v1/projects/:id/sprints              — create sprint (admin + PM)
  PATCH  /api/v1/projects/:id/sprints/:sprintId    — update / start / complete sprint (admin + PM)
  DELETE /api/v1/projects/:id/sprints/:sprintId    — delete sprint (admin only)

Key decisions:

  Status transitions (planned → active → completed, never backwards):
    - planned → active: getActiveSprint() check first — only one active sprint per project.
      If start_date wasn't set on create, it's set to NOW() automatically.
      Returns 409 if another sprint is already active.
    - active → completed: TRANSACTION (completeSprintWithRollback) — sets status=completed,
      sets end_date=COALESCE(end_date, NOW()), moves all tickets where status != 'done'
      to backlog (sprint_id = NULL). Done tickets stay in the completed sprint (for reports).
    - Any other transition (e.g. reverting to planned, re-activating completed) returns 400.

  Delete (planned only):
    - Active or completed sprints cannot be deleted — they have real history.
    - TRANSACTION (deleteSprintWithRollback): moves ALL sprint tickets to backlog first,
      then deletes the sprint.

  Dynamic update:
    - Same SET builder pattern as projects — only provided fields are updated.
    - Empty name string after trim → 400 (name cannot be empty).
    - goal can be set to null to clear it.
    - Editing allowed on planned + active sprints; locked once completed (canEdit = !isCompleted && canManage).

  Sprint name uniqueness:
    - sprintNameExists() checks LOWER(name) per project before INSERT.
    - Returns 409 with specific message if duplicate found.

  Notes field — intentionally deferred:
    - `notes TEXT` column exists on the sprints table and backend accepts it via UpdateSprintBody.
    - Frontend Notes card removed from sprint page. The field is not exposed in any UI.
    - Planned as a per-user "quote-style" note system (like sprint-level comments, shown as
      "note content — author name"). Will be built as its own feature in a later phase with
      a dedicated sprint_notes table (sprint_id, user_id, content, created_at).

  Bugs fixed post-build:
    - createSprint INSERT was missing created_by (NOT NULL column) — caused 500 for all sprint creates.
    - All sprint/ticket onError hooks were hardcoded — now read err.response.data.error.

  Archived project guard:
    - create/update on archived project returns 403 (same as project PATCH).
    - delete has no archived guard — you can clean up planned sprints even on archived projects.

### PHASE 5 — Tickets + Comments ✓ DONE
Tickets router mounted separately at /api/v1/projects alongside the project router.
Both routers handle /:id/* routes — they fall through to each other.

Endpoints:
  GET    /api/v1/projects/:id/tickets/:key                          — single ticket WITH comments
  POST   /api/v1/projects/:id/tickets                               — create ticket (all roles)
  PATCH  /api/v1/projects/:id/tickets/:ticketId                     — update ticket (all roles)
  DELETE /api/v1/projects/:id/tickets/:ticketId                     — delete ticket (admin + PM)
  POST   /api/v1/projects/:id/tickets/:ticketId/comments            — add comment (all roles)
  DELETE /api/v1/projects/:id/tickets/:ticketId/comments/:commentId — delete comment (RBAC below)

Key decisions:

  Ticket key generation (e.g. RAI-1, RAI-2):
    TRANSACTION with PostgreSQL advisory lock per project_id — serializes concurrent creates.
    MAX(CAST(SPLIT_PART(key, '-', 2) AS INT)) + 1 gets the next number.
    Advisory lock released at transaction end, so lock is held only for the INSERT window.

  GET /:key vs project endpoint:
    Project endpoint (GET /projects/:id) returns comments: [] for all tickets — by design.
    GET /:key returns the full ticket with real comments + author join.
    Frontend ticket page uses useTicket() alongside useProject() — useTicket for comments,
    useProject for all other ticket metadata.

  Sub-tickets:
    parentKey in create payload → getTicketIdByKey() to resolve parent ticket id.
    getSubTicketKeys(ticketId) fetches sub-tickets after every create/update for the response.

  Dynamic PATCH:
    Same SET builder pattern. assigneeId/sprintId can be null (clear field) or string ID.
    All authenticated users can update any ticket field.
    Only admin + PM can delete tickets.

  Comment delete RBAC:
    Admin + PM can delete any comment.
    Regular users can only delete their own (user_id === req.user.id check).

  Archived project guard:
    create ticket, update ticket, add comment → 403 on archived project.
    delete ticket, delete comment — no archived guard (cleanup allowed).

  Frontend fixes applied alongside this phase:
    - useComments.ts: URLs fixed to /projects/:id/tickets/:ticketId/comments (were missing /projects/:id)
    - useComments.ts: now accepts ticketKey param; invalidates ['projects', id, 'tickets', key]
    - Ticket page: uses useTicket() query for comments section (fullTicket?.comments)

### UI FIXES (post-Phase 5, no backend change)
Board column sync:
  useEffect([sprint?.id]) → useEffect([ticketsKey]) where ticketsKey is
  sprint.tickets.map(t => `${t.id}:${t.status}`).join(',').
  Board now re-syncs after ticket creation and status changes from other pages.

Backlog sprint ordering:
  Sprints now sorted active → planned → completed before render.
  isInitiallyOpen() opens the active sprint if one exists; falls back to first planned.

TicketPanel redesign:
  - Added useTicket(project.id, ticket.key) inside panel → comments now load.
  - useAddComment / useDeleteComment now receive ticketKey (were missing it → wrong cache key).
  - Removed compact meta row at top; replaced with always-visible details sidebar showing
    Status, Type, Priority, Assignee, Reporter, Sprint, Created, Updated, Delete.
    Previously these were only visible when the panel was expanded.

### PHASE 6 — Search + My Work  ← NEXT
Endpoints:
  GET /api/v1/search?q=       — search tickets across visible projects
  GET /api/v1/me/tickets      — tickets assigned to current user

Search:
  - Full-text search on ticket title + key (ILIKE %q%)
  - Only returns tickets from projects the user can see (visibility/membership filter)
  - Returns SearchResult shape: id, key, title, type, status, priority, assignee,
    projectId, projectName, projectKey
  - Minimum query length: 2 chars (enforced in frontend, validated in backend)

My Work:
  - Returns MyWorkItem[]: { ticket, project (summary), sprint (partial) }
  - Only tickets assigned to the current user (assignee_id = req.user.id)
  - Joins project and sprint info per ticket


## A2 · v1 Feedback Triage  _(was `v1-feedback-triage.md`)_
_v1 user feedback, already triaged into v2 scope; kept for provenance._

**Source:** User-reported v1 issues + suggestions captured 2026-05-16. 21 items total.

**Workflow:** discuss in chat → user gives verdict → log here with status + rationale + implementation note. At build time, this doc is the canonical "what was decided about v1 feedback" reference — grouped reads (e.g. "everything about the project overview page") sit together for sequential implementation.

**Statuses:**
- **ACCEPT** — landing in v2 build. Implementation note captured.
- **REJECT** — not doing; rationale captured so it doesn't re-surface in review.
- **CARRY-OVER** — already correct in v1; just need to preserve as-is in v2 rewrite.
- **DEFER-V3** — push to a later release.
- **SETTLED-ELSEWHERE** — already covered by a locked decision (Q/RF/RBAC); pointer captured.
- **TBD** — still pending discussion in this walk-through.

---

### Decided

#### Item 1 — Layout shift when switching project-settings options
**Status:** REJECT
**Rationale:** User reconsidered — "layouts seem fine."

#### Item 2 — Home dashboard: My Tasks + Team Activity + All-Projects-Progression in three rows
**Status:** REJECT
**Rationale:**
- "My Work" tab already covers personal-tasks view.
- "Team" tab exists; team activity surfaces per-project, so a global team-activity page would duplicate without adding signal.
- "All projects progression" isn't a single computable number — each project has variable sprint counts, scope, completion criteria. No meaningful aggregate.

#### Item 3 — Project status visible on dashboard
**Status:** REJECT
**Rationale:** Same as item 2 — project status isn't computable as a single aggregate signal. Per-project view already shows it.

#### Item 4 — Show members in overview tab
**Status:** CARRY-OVER
**Rationale:** Already present in v1 overview. Preserve as-is in v2.

#### Item 5 — Show project creator + PM(s) in overview tab
**Status:** ACCEPT
**Implementation note:** Add a small line on the Project Overview page:
- `Created by: [Creator name]`
- `PM(s): [PM1, PM2, ...]` — list all PMs if multiple.
Lands during v2 frontend build under the project module. Reads `tickets.created_by` equivalent for project (i.e. `projects.created_by`) + project PM membership list.

#### Item 6 — Sprint creation modal closes on click-outside (originally reported as hover-outside)
**Status:** REJECT
**Rationale:** Original report misread the behavior — it's click-outside-dismisses, not hover-outside. Click-outside-dismiss is standard modal behavior for short forms (sprint name + start + end + goal); acceptable as-is.
**Future flag (not blocking):** if revisiting modal dismiss behavior for longer create-forms (ticket create with many fields), consider per-modal policy — short forms can keep click-outside-dismiss, longer forms might warrant "confirm leave?" prompt. Decide per-modal as we hit each surface during v2 build.

#### Item 7 — Can't edit sprint dates after creation
**Status:** ACCEPT
**Rationale:** v1 doesn't expose an edit UI; v2 adds it. Authority already implicit in Q5 (PM has sprint lifecycle authority on managed projects).
**Implementation note:**
- Sprint settings / edit modal exposes start_date + end_date fields.
- Who can edit: admin + PM-in-project + PM-on-public-project (same rule as other project-level edits, per `guide-rbac.md`).
- Editable states: not-started (both dates) and active (both dates).
- **Locked state: completed sprints — dates not editable in v2.** v3 will revisit (likely with audit trail).
- Validation: `end_date > start_date`.
- Schema add: `sprints.updated_by BIGINT REFERENCES users(id)` for audit trail.
- `guide-rbac.md` updated with Sprint actions sub-table.

#### Item 8 — Default sprint creation prompt says "(TEST Sprint)"
**Status:** REJECT
**Rationale:** Original misread the behavior. Actual v1 default prompt shows the project name, not "TEST Sprint." No change needed.

#### Item 9 — Strikethrough text in Done section for completion satisfaction
**Status:** REJECT
**Rationale:** Strikethrough on done-section text is not a good visual choice — makes content harder to read, looks like deleted content rather than completed work. Existing "Done" column visualization in Kanban already conveys completion.

#### Item 10 — Allow creating a ticket directly in "done" status
**Status:** ACCEPT
**Rationale:** Covers the real-world case where work was completed before being tracked ("I fixed it in the moment, want to log it for history"). No reason to force "todo → in progress → done" theater.
**Implementation note:**
- Ticket creation form has a status dropdown.
- Default value: `todo` (current v1 default stays).
- Selectable values: `todo`, `in_progress`, `done`.
- Permissions: standard ticket-create rule (any project member can create); creating directly in `done` doesn't require elevated rights — it's still creating, not modifying someone else's ticket.

#### Item 11 — Priority icon legend
**Status:** REJECT in-app legend; ACCEPT as user documentation
**Rationale:** In-app priority icon legend would clutter the UI. Existing priority filter handles discoverability inside the app. Icon meanings + other "how to use" content belong in a separate user guide doc.
**Action item:** during the post-build documentation cleanup phase, create `team/user-guide.md` (or similar) covering icon meanings, filter usage, keyboard shortcuts, etc. Not building this now; logged as a deliverable for the doc-cleanup phase (post-prod step 10).

#### Item 12 — "Create ticket" → "Add ticket" wording change
**Status:** REJECT
**Rationale:** Both terms work; "Create" stays. Cosmetic synonym change doesn't justify churn.

#### Item 13 — Slide-left animation needs improvement in ticket selection
**Status:** DEFER-TO-BUILD
**Rationale:** Animation is clean enough as-is in v1. Revisit during the v2 app shell phase if it still feels off in the new shell context.

#### Item 14 — "type: all types" → "type: all"
**Status:** ACCEPT
**Implementation note:** Filter label renames from "All types" to "All". Tiny UI string change. Applies wherever "All X" filters render redundantly (audit other filter labels for the same pattern during build).

#### Item 15 — Use non-rounded squares for report color indicators
**Status:** REJECT
**Rationale:** Slightly rounded edges look better than hard squares. Current rounded shape stays.

#### Item 16 — Project click: show options below instead of new screen
**Status:** REJECT
**Rationale:** Projects have many pages (overview, board, sprints, reports, settings, members) — a separate dedicated screen is the right UX. Inline expansion would crowd the project list view.

#### Item 17 — Completed sprint should not auto-archive
**Status:** ACCEPT
**Implementation note:**
- **Sprint lifecycle states:** `planned` → `active` → `completed` (default end state) → `archived` (only if manually archived).
- **Completed sprints** stay in the sprint list with a "Completed" tag, sorted at the end of the active sprints list (chronological).
- **Archive** is a deliberate manual action separate from completion. Manual archive moves the sprint out of the regular list into the archive section.
- Schema: either extend `sprints.status` enum to include `archived`, OR add `sprints.archived_at TIMESTAMP NULL` flag separate from status. Final shape locked at schema design phase.

#### Item 18 — Archive confirmation + retrievability (project + sprint)
**Status:** ACCEPT
**Implementation note:**
- **Confirmation dialog** required when archiving a project AND when archiving a sprint.
- **Unarchive supported:**
  - Project unarchive: from the project settings page (admin + PM-in / PM-on-public).
  - Sprint unarchive: from the sprint page (admin + PM-in / PM-on-public).
- Authority for archive AND unarchive: admin + PM-in / PM-on-public. Matches the project-edit rule from `guide-rbac.md`.
- `guide-rbac.md` updated with archive + unarchive rows.

#### Item 19 — Auto-start sprint on assigned date + opt-in notification
**Status:** ACCEPT
**Implementation note:**
- **Auto-start mechanism:** node-cron job running inside the backend container every 5 minutes. Queries `sprints WHERE start_date <= NOW() AND status = 'planned'` → flips to `active`. Same pattern reused for other v2 scheduled tasks (subscription pre-expiry emails per Q11, invite expiry cleanup per RF-12).
- **No default notification on auto-start** (could fire at midnight, outside working hours).
- **Opt-in notification path 1 (preferred):** at sprint creation, a "Notify me when this sprint starts" option with a time picker (e.g., "alert at 9 AM on start day").
- **Opt-in notification path 2 (recovery):** on the sprint page, a notification icon → modal with "Enable notification when sprint starts" + time picker. For users who forgot to opt in at creation.
- Notifications delivered via the Phase D notification system (in-app + email).
- Standards.md gains a "Background jobs (scheduled tasks)" entry codifying node-cron as the v2 pattern.
- v3 alternative (AWS EventBridge + Lambda for distributed scheduling) parked in `upgrades.md`.

#### Item 20 — Project settings visibility + members page restructure
**Status:** ACCEPT
**Implementation note:**
- **Settings visibility:** project settings page visible to all project members (read-only for users; editable for admin + PM-in / PM-on-public). Subject to project visibility per `guide-rbac.md` (private project = members only see settings; public project = all org members can see read-only).
- **Members section moves out of settings:** v1 has members inside the settings page. v2 introduces a separate "Members" page in the project's left menu. Settings page becomes focused on project metadata / visibility / danger zone, members page becomes the dedicated team management surface.
- `guide-rbac.md` updated with explicit "View project settings" row (open to all project members per visibility rules).

#### Item 21 — Danger zone naming + confirmation dialogs
**Status:** MIXED — REJECT rename, ACCEPT confirmation dialogs
**Rationale:**
- **"Danger zone" stays** — industry-standard term (GitHub uses it; users recognize it on sight).
- **Confirmation dialogs required for** project archive (covered by item 18) AND project delete (new).
- **Project delete confirmation pattern:** typed-slug confirmation gate (user must type the project slug to enable the Delete button) — same pattern GitHub uses for repo deletion. Prevents accidental clicks.
- **Project delete authority (locked):** admin + owner ONLY. PMs cannot delete projects even those they manage. PMs retain archive authority (reversible). Reason: project deletion is permanent and removes all child data; responsibility sits at the org level.

---

### All 21 items decided — walk-through complete

(Originally listed pending items 13-21 below were moved up into the Decided section as each one locked.)

---

### How items map to other docs

When an item locks RBAC, schema, or strategic-architecture pieces, the lock goes in the appropriate doc and a pointer is added here:

- Items 17 / 18 / 21 → likely update `guide-rbac.md` (project delete / project archive authority TBD rows) + `v2-decisions.md` (if archive semantics need a new strategic entry).
- Items touching UI/UX only → captured here in the item itself; implementation lands during v2 build (frontend shell phase).
- Items that surface new requirements not covered by Q1–Q16 or RF-1 to RF-16 → escalate to the user before locking.

---

### After this walk-through completes

Per the locked plan in `memory/project_v2_multitenant.md`:
1. Overall app + infra review + structural cleanup.
2. Phase re-sequencing (phase letters re-enter here).
3. Build kickoff: frontend shell → APIs → phase-wise testing → happy-path testing → automation/edge-case testing → `/security-review` → fix → ship staging → prod → doc cleanup.


## A3 · v2 Rapid-Fire Decisions (RF1–16)  _(was `v2-rapid-fire.md`)_
_The quick-fire RF resolutions; companion to `v2-decisions.md`._

Edge-case scenarios and operational questions raised by the team after Q1–Q16 strategic decisions locked. Format: question as raised by the team, short direct answer. Full reasoning + options/tradeoffs for each locked item is in `v2-decisions.md` under the matching RF-N entry.

---

### Decided

#### RF-1. Multi-device and multi-tab session sync

Multi-device org switching — if user switches org in one device/browser, should other active sessions also update automatically or remain isolated?
If org is switched in one browser tab, should other open tabs auto-refresh context or detect mismatch?

For tabs in the same browser, yes — we use a `storage` event listener that fires when Amplify writes to localStorage. Logout / org switch / role change in one tab reflects immediately in all others. For different devices (web ↔ mobile, web ↔ different browser), no active push — each device discovers the change on its next API call via the 401/403 interceptor. Mobile and web are fully separate sessions, each holding their own Cognito tokens. Active cross-device push via WebSocket and an "active sessions" UI are v3 features; v2 covers cross-device lazily.

---

#### RF-2. Cognito API rate limits and retry strategy

Token refresh storm possibility — if many users switch orgs simultaneously, do we expect Cognito/API rate limiting concerns?
If frequent AdminUpdateUserAttributes calls hit throttling, what retry/backoff strategy should backend follow?

Every Cognito write SDK call is wrapped in a `withCognitoBackoff` helper that retries up to 3 times (100ms → 300ms → 1s with ±20% jitter) only when Cognito returns `TooManyRequestsException` — normal calls have zero overhead. The frontend disables the org switcher button for ~500ms after click to prevent rapid-fire writes. The 25/sec `AdminUpdateUserAttributes` limit is a soft limit; if we ever see throttling at scale, AWS Service Quotas routinely raises it to 250/sec or higher with a free support ticket. Multi-region pools and refresh-storm handling are deferred to v3.

---

#### RF-3. Auth and security audit logging

Audit/security logs — should org switching, failed auth attempts, suspicious tenant access, and permission escalations be centrally logged for enterprise auditing later?
What monitoring/logging strategy is planned for auth-related operations?
How will org switches be audited; is suspicious login monitoring planned?

Dedicated audit logging (immutable `audit_log` table, structured event schema, retention policy, compliance query UI) is deferred to v3. For v2 we rely on the existing baseline: the standard request logger captures org switches and role changes as regular API calls; Cognito automatically tracks failed logins, MFA challenges, and sign-in IP/device for ~30 days via `AdminListUserAuthEvents` for free; DB `created_at` / `updated_at` on the key tables show when rows changed. Issues are handled manually via the support inbox at v2 scale. Suspicious-activity detection (login from new IP/device prompting MFA) is parked separately in `upgrades.md` as the Cognito Advanced Security tier toggle.

---

#### RF-4. No-org post-signup UX

After signup/verification, if no org is mapped yet, should user stay in waiting state, onboarding flow, or restricted dashboard?

After signup + Cognito email verification, a user with zero org memberships lands on an empty-state screen with exactly two paths: **Create organization** (form for name + slug, user becomes owner, redirect to org dashboard) or **Wait for invite** (text affordance — "Ask your team admin to invite your verified email"). There's no browse-and-request-to-join flow, so joining requires either creating your own org or clicking an invite link. The same empty-state screen is also what existing users see if they leave / are removed from their last org. Invite links clicked while logged in skip the empty-state entirely and join the org directly. Pieces of this were already touched in Q1, Q6, Q7 — RF-4 just consolidates the full flow.

---

#### RF-5. Many-orgs UX (org switcher scaling)

If one user belongs to a very high number of orgs, do we need pagination/search/priority ordering for org selection UX?

The top-right org switcher renders the 8 most recently accessed orgs by default. If the user has more, a "Show more" button at the bottom loads 8 additional orgs per click (16, 24, 32, …). At 20+ orgs total, a search input appears at the top of the dropdown for client-side fuzzy filtering over the user's full list. Recency ordering comes from a `last_accessed_at` timestamp on `user_orgs` (updated on each org switch — one line in the switch endpoint). A hard cap of **100 orgs per user** is enforced at the accept-invite and create-org paths, env-configurable via `MAX_ORGS_PER_USER` so `internal_admin` can override for genuine power-user cases. Server-side pagination, true fuzzy search, pinning/favorites, and weighted recency are v3+.

---

#### RF-6. Rapid org-switch race conditions

How do we prevent race conditions during rapid org switching?
Do we serialize org switch requests? Should frontend disable repeated switching until completion? Could old token refresh responses overwrite newer state?

Frontend disables the switcher entirely (greyed out, non-clickable) for the full duration of an in-flight switch — from the moment the user clicks until the Cognito write + token refresh + dashboard refetch all resolve. RF-2's 500ms debounce stays for fast-double-click protection; this adds the longer "no second click while the first is still landing" guarantee. Old in-flight switch requests are cancelled via `AbortController` if the disable is ever bypassed. No backend serialization lock — fully frontend-side, ~15–20 lines. Solves five concrete failure modes: Cognito attribute landing on the wrong org if response order flips; token in localStorage and UI display diverging; brief flash of old-org data on the new dashboard; `last_accessed_at` ordering glitches; other tabs flickering through stale states via the `storage` event. Per-user backend lock (Redis or DB advisory) is parked in `upgrades.md` for the day SDK/CLI clients exist that can bypass the UI guard.

**Companion rule (codified in `dev-standards.md` §3):** every TanStack Query `queryKey` for tenant-scoped data starts with the active `orgId` as its first segment (`['org', orgId, 'projects']`, etc.). This is what makes the dashboard-data-flash scenario impossible — a stale in-flight response from the previous org lives under a different cache key, so it can't overwrite the new org's view.

---

#### RF-7. SSO providers → user_orgs mapping

How will future SSO providers (Google, Microsoft, SAML) map into Rai org memberships?
Will email-based mapping be used? Will org invitations still control membership? How will enterprise IdP onboarding work?

Email is the canonical identity in both flows — SSO and password produce a single `users` row keyed by email, mapped to the same `users.id` (= Cognito `sub`). v2 ships **Google + Microsoft** as SSO providers (Cognito user-pool toggle + Amplify button, ~3–4 hours per provider). **GitHub deferred to v3** alongside SAML/OIDC. Org membership is always gated by invites or self-create — SSO only authenticates *who you are*, never grants org access. SSO users skip email verification (Cognito marks federated emails as `email_verified=true` automatically, so Q7's "verify before any org action" gate passes immediately). Dual-mode accounts work natively via Cognito's "Trust provider for email" setting — if a user signs up with password then signs in with Google on the same verified email, the federated identity auto-links to the existing `users` row; if they signed up with Google and later want password access, a "Set a password" option in Settings (`AdminSetUserPassword`) enables it. Shadow-account hijack is closed by Q7 — only verified native accounts auto-link, so an attacker can't pre-register an unverified `victim@gmail.com` and claim the victim's identity via Google. All emails are treated identically at v2; no work-mail special handling, no domain-based auto-org-join. Domain → org binding and SAML/OIDC per-org federation stay parked for v3.

---

#### RF-8. DB ↔ Cognito sync failure reconciliation

If DB membership update succeeds but Cognito attribute update fails (or vice versa), what rollback/reconciliation strategy should exist?

A real cross-system transaction doesn't exist — Postgres can't include a Cognito API call in its transaction, and Cognito doesn't support 2-phase commit. So we approximate one. **Universal rule: Cognito-first, bounded retry on both sides, best-effort compensation if the second side fails.** Each flow runs the Cognito write inside `withCognitoBackoff` (RF-2), then the DB write inside a parallel `withDbRetry` helper. If the DB write exhausts retries, the Cognito write is attempted to be reverted (delete the user on signup failure, set the attribute back to its previous value on org-switch / email-change failure). If the revert also fails, a structured log event fires and an alert pipeline (pino → CloudWatch → SNS → email) notifies for manual cleanup. Account deletion is the one flow where compensation isn't viable — `AdminDeleteUser` is destructive — so the path is retry DB, ops alert + manual SQL cleanup on failure (user is already locked out from Cognito side, so no security risk during the manual gap). All writes are treated as critical; there's no background-write category. Membership changes are DB-only and need no reconciliation. Saga, outbox, and 2PC are all parked for v3 if cross-system mismatches ever happen at meaningful rate.

---

#### RF-9. Session and permission consistency mid-flight

User removed from org while actively using application — middleware DB validation already handles this, but should frontend immediately force logout / org switch when API starts failing?
Concurrent org role modification — if admin changes user role during active session, should permission changes reflect immediately or after token refresh?

Backend is already done — Q3 middleware re-validates `user_orgs(user_id, current_org_id)` + reads `role` fresh on every request. So mid-session removal returns 403 on the very next API call (no token-expiry wait), and role changes take effect immediately for any role-gated endpoint. RF-9 is purely about the **frontend reaction** to those 403s. Two specific error codes are added to the 403 response shape: `MEMBERSHIP_REVOKED` and `INSUFFICIENT_ROLE`. The frontend axios interceptor catches each. **Membership revoked:** first 403 shows a sticky top banner ("You no longer have access to [Org Name]" + "Switch org" button), current page stays loaded with already-fetched data, subsequent 403s within the same revoked org are silent (banner already up), next navigation click redirects to the org list / switcher page where the user picks an org themselves (or the empty-state per RF-4 with Join-org / Create-org options if zero orgs left). **Role change:** sticky banner ("Your role in [Org] has changed to [new role]") + all UI stays as-is (no hiding admin links), and when the user clicks into a route their new role can't access, the standard access-denied page renders from the backend `403 INSUFFICIENT_ROLE`. **Cross-tab:** RF-1's `storage` event listener propagates the same banner to other tabs. **Cross-device:** lazy detection — next API call on each device surfaces its own banner. Net new code: ~30 lines of interceptor + one banner component + two error-code constants. No forced logout, no aggressive token refresh, no permission-aware UI rewrites.

---

#### RF-10. Subscription expiry session behavior

Organisation deletion/deactivation scenario — if org becomes inactive / subscription expires while users are logged in, how should active sessions behave?

Q11 already locked the org-level state (indefinite read-only on expiry, pre-expiry email warnings, end-of-period cancellation). RF-10 is purely the user-side UX overlay. **Same banner-first pattern as RF-9**, just with subscription-expiry semantics: a sticky top banner reads "Your subscription expired on [date]. The organization is now in read-only mode," with a "Reactivate subscription" button for org admins (routes to billing page per Q11's reactivation flow) and "Contact your organization admin to reactivate." copy for non-admins. Reads keep working everywhere — browsing tickets/sprints/projects/comments is unaffected per Q11's indefinite read-only guarantee. Writes return `403 SUBSCRIPTION_EXPIRED` from a new tenant-scoping middleware extension that checks `subscriptions.status` for the active org and rejects writes (POST/PUT/PATCH/DELETE) when status is `expired`. If a user is mid-edit when expiry fires, the save click returns the 403, the frontend axios interceptor shows a specific toast ("Cannot save — subscription has expired") and mounts the sticky banner. UI stays as-is — no proactive disabling of write buttons, no hiding "Create" CTAs (same philosophy as RF-9: click → error → toast + banner). Cross-tab same-browser propagation extends RF-1's `storage` event listener with a `subscriptionExpired` event (~5 lines on top of the existing listener); cross-device is lazy per-device detection. Net new code: ~10 lines on top of RF-9's `PermissionBanner` component + axios interceptor — reuses the same component with a third copy variant.

---

#### RF-11. Active-org deleted while user is logged in

If user's currently active org is deleted/removed, should system auto-switch to another available org or force org selection screen?

Same banner-first pattern as RF-9 and RF-10, with one deliberate divergence: any subsequent API call (not just writes) triggers a redirect to the org switcher, because the org row literally no longer exists. New error code `ORG_DELETED` on the standard 403 envelope. Q3 middleware already joins `user_orgs` → `organizations`; when the org row is gone, the join returns 0 rows and the middleware returns `403 ORG_DELETED`. Frontend axios interceptor catches the code, mounts a fourth `PermissionBanner` variant ("This organization has been deleted. Switch to another org to continue."), shows a toast, and redirects to the org switcher / list page (or RF-4's empty-state if the user has no other orgs). Reads can't keep working from cache because React Query's focus/mount refetches will 403 on their own — "stays on page" is best-effort, same caveat inherited from RF-9. The **deleter's own session** doesn't go through this flow — the delete endpoint returns success and the frontend explicitly navigates them to the switcher. The banner-flow is only for *other* sessions / tabs / devices of the deleter, and for all other admin/owner sessions in the same org. Cross-tab same-browser extends RF-1's `storage` event listener with an `orgDeleted` event. Cross-device is lazy per-device detection on next API call. **v2 scope:** Q14 locked v2 as indefinite retention (no auto-deletion), so the only path that triggers RF-11 in v2 is **another admin/owner hitting the self-serve 2FA hard-delete button** in settings. v3+ retention-expiry deletion gets pre-deletion emails at T-30/T-7/T-1 so users have warning before this banner ever appears. Net new code: ~5 lines on top of RF-9/RF-10 infrastructure — one error code, one banner variant, one storage event name, one redirect line in the interceptor.

---

#### RF-12. Invite edge cases

Invite edge cases — duplicate invites to same email, expired invite tokens, invite accepted after the user was already removed from org once.

Q6 covers the happy path (single token, two paths, 7-day single-use). RF-12 locks the surrounding edge cases without changing Q6's TTL or shape. **(1) Duplicate invite to same pending email — newer supersedes older.** Admin A invites `bob@x.com` → token T1 stored. Before Bob clicks, Admin B (or A again) invites the same email → T2 created and T1 is marked `revoked_at = NOW()` in the same transaction. T1 dies; T2 is the only live token. Mental model: latest admin intent wins, including the case where the role on T2 differs (admin upgraded `user` → `project_manager` mid-flight). **(2) Pre-flight "already a member" check.** Invite endpoint first resolves email → `user_id` (via Cognito `AdminGetUser` by email, or local `users.email` lookup) → checks `user_orgs(user_id, current_org_id)`. If row exists, return friendly `409` "bob@x.com is already a member of this org." No email sent, no `invites` row created. ~3 lines of guard at the top of the endpoint. **(3) Revoke pending invite (cancel).** Team page surfaces a "Pending invites" section (bottom of member list, or filterable) showing all `invites` rows where `used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`. Each row has a "Cancel" button → sets `revoked_at = NOW()`. Revoked tokens behave identically to expired ones on click — the friendly "this invite has expired / been canceled — ask for a new one" page from Q6 covers both. Handles wrong-role typos, wrong-email typos, and changed-mind cases without needing an "edit invite" feature. **(4) Accepted-after-removal stays handled by Q6's single-use.** Bob accepted → `used_at` set → admin removed Bob → original email link in Bob's inbox already shows "expired/used" page on click (because `used_at IS NOT NULL`). A fresh invite is a fresh `invites` row, fresh token — no special path. **(5) Schema add:** `invites.revoked_at TIMESTAMP NULL` column joins Q6's existing `(token, org_id, role, invited_email, invited_by, expires_at, used_at)` schema. Token validity check becomes `used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`. **(6) Email + in-app messaging:** invite email body mentions "This invite expires in 7 days." In-app toast on send: "Invite sent to bob@x.com — expires in 7 days." **(7) Subscription-expired interaction:** POST `/invites` is a write, so RF-10's middleware returns `403 SUBSCRIPTION_EXPIRED` automatically — admins can't send new invites while the org is in read-only. No RF-12-specific change. Net new code: ~30 lines (pre-flight guard, supersede logic in invite-create, revoke endpoint, pending-invites list endpoint, Team page pending-invites UI section).

---

#### RF-13. Token refresh stale window during org switch

Since org switching depends on successful frontend token refresh, how do we handle temporary stale-token windows or refresh failures?
Should frontend block further API calls until refresh succeeds? Is there a fallback? How do we guarantee consistency between active org and current token?
If token expires exactly while switch-org request is in progress, how should recovery/retry flow behave?

Q1 made the token's `custom:current_org_id` claim the source of truth for active org. RF-8 covered the backend two-step (Cognito attribute write + DB `last_accessed_at` write) with `withCognitoBackoff` + `withDbRetry`. RF-13 closes the third step — the frontend's `Auth.currentSession({forceRefresh: true})` call that mints a new ID token with the updated claim. **UI flip is gated on this refresh completing AND the new token's claim equaling the requested orgId**; the switcher stays in a "switching..." state until both are confirmed (typically <500ms, well within Cognito's eventual-consistency window between attribute-write and next-token-issue). Two-layer retry on refresh failure: **Layer 1 = 3 internal automatic refresh retries** (100ms / 300ms / 1s backoff with ±20% jitter, mirroring RF-2's `withCognitoBackoff` pattern on the frontend via a new `frontend/src/lib/cognito-retry.ts` helper). **Layer 2 = user-facing "Org switch unsuccessful — Retry?" banner.** After 3 user-facing Retry clicks all fail, banner adds a "Contact support" button below the Retry. No forced logout — the old token still says orgA so the user keeps working in orgA safely; their session remains valid. **Compensation on refresh failure (closes the silent-switch trap):** when Layer 1 exhausts, frontend calls `POST /api/v1/auth/switch-org/revert` → backend reverts the Cognito attribute back to orgA + restores `user_orgs.last_accessed_at` to its prior value (captured *before* the switch ran). Without this compensation, Amplify's background auto-refresh ~50 minutes later would silently mint a new token with the orgB claim and flip the user's UI mid-work — exactly the "profile orgB / data orgA" state the design avoids. Revert uses the same `withCognitoBackoff` + `withDbRetry` helpers as the forward path. If revert succeeds → state fully resyncs to orgA, banner shows "Retry?" only. If revert fails after retries → RF-8 SNS alert fires for ops to manually reconcile, banner shows Retry + Contact Support immediately (since auto-recovery is broken). **Atomic UI update mechanism** is RF-6's `['org', orgId, ...]` queryKey convention — when orgId changes, React Query invalidates every tenant-scoped query in one shot. Profile, header, dashboard, sidebar all flip simultaneously; no race where one panel updates before another. **Token-expired-mid-switch** (rare separate edge): if the backend `/switch-org` call itself returns 401 because the outbound ID token expired during the request, the standard axios refresh-on-401 interceptor handles it — refresh the token, retry the switch endpoint once. If that refresh fails too, refresh-token is genuinely expired → normal session-timeout redirect to login (not switch-specific). Net new code: ~50 lines (frontend cognito-retry helper + claim-verification + retry banner + Contact Support escalation tracking + revert endpoint + capture-prior-state for revert).

---

#### RF-14. Per-request membership validation scaling

Will per-request DB membership validation become a scaling bottleneck later?
Do we plan any future optimisation — redis cache, shorter token TTL, membership cache, read replicas?

Per-request footprint after RF-9 / RF-10 / RF-11 / RF-12 / RF-13 absorbed work into the auth chain: **2 DB queries** for any tenant-scoped endpoint. (1) `loadUser` selects from `users` by `cognito_sub`. (2) Combined membership + subscription + org-existence check via LEFT JOIN of `user_orgs` + `organizations` + `subscriptions` filtered by `(user_id, org_id)`. With proper indexes both run sub-millisecond at v2 scale (single Postgres, internal team + initial customers, well under 50 req/sec). Not a bottleneck for v2. **v2 actions locked now (cheap-to-add, ugly-to-retrofit):** (a) full index list locked at first migration — `users(cognito_sub)` UNIQUE, `user_orgs(user_id, org_id)` UNIQUE composite, `user_orgs(org_id)` for tenant scoping, `user_orgs(user_id, last_accessed_at DESC)` for RF-5's recency dropdown, `organizations(slug)` UNIQUE, `subscriptions(org_id)` UNIQUE, `invites(token)` UNIQUE, partial index on `invites(invited_email, org_id) WHERE used_at IS NULL AND revoked_at IS NULL` for RF-12's pre-flight + supersede; (b) `MembershipResolver` interface introduced in v2 (`backend/modules/auth/membership.resolver.ts`) — middleware calls `resolver.resolve(userId, orgId)`, v2 ships only `DbMembershipResolver` implementing the query above. Mirrors Q1's `AuthService` and Q12's billing-adapter pattern, so v3's Redis layer drops in as a `CachedMembershipResolver` decorator without touching middleware. **v3 trigger criteria (mechanical, not a debate):** activate RF-14/RF-15 work when *any* of — p99 auth middleware latency sustained >10ms over a 24h window, OR concurrent active users >500 sustained, OR DB connection pool saturation traceable to middleware queries — fires first. **Deferred to v3 (parked in `upgrades.md`):** Redis cache for membership lookups, read replicas for the membership query, shorter token TTL strategy, cache TTL tuning, cache invalidation strategy (RF-15). **RF-15 stays formally bound to RF-14** — invalidation only matters once caching exists, so RF-15 activates together with the v3 Redis work and not before. Net code in v2: ~5 lines (interface + the one concrete class) + the index list in migrations.

---

#### RF-15. Cache invalidation strategy (future Redis)

Cache consistency (future Redis optimisation) — if org membership is cached, how do we invalidate cache immediately after org removal or role update?

Bound to RF-14 — v3 work. Activates together with the Redis membership cache once RF-14's trigger criteria fire. v2 has no cache to invalidate. Parked in `upgrades.md` alongside RF-14's deferred items.

---

#### RF-16. Cognito swap future-proofing (preserving users.id)

If Cognito is swapped later (Auth0 / custom IdP), how will user identity mapping with existing `users.id` (which equals Cognito `sub`) be preserved safely?

Q1 already abstracts the API surface behind the `AuthService` interface — swap = new implementation + one DI line change for code. RF-16 closes the DB-level coupling that Q1's abstraction can't fix: today `users.id` *is* the Cognito sub (Q13), so swapping providers would orphan every FK pointing at `users.id` (membership rows, `created_by`, `assigned_to`, every author/owner column). Fix is the industry-standard decouple: **`users.id` becomes our internally-generated UUID v7** (revising Q13 — was UUID v4 from Cognito) and **a new column `users.external_auth_id VARCHAR NOT NULL UNIQUE`** stores whatever the current provider calls this user (Cognito `sub` today, Auth0 `user_id` or Clerk `user_id` tomorrow). `loadUser` queries by `external_auth_id` resolved from the JWT, returns `users.id` to the rest of the app. All FKs in the system reference `users.id` — stable across provider swaps forever. Provider-specific bits (`custom:current_org_id` attribute, `email_verified` claim, federation config, admin SDK calls like `AdminGetUser` / `AdminUpdateUserAttributes`) stay inside `CognitoAuthService` and are abstracted via the existing interface — `AuthService.verifyAccessToken()` returns a **normalized shape** (`{externalAuthId, email, emailVerified, currentOrgId}`) so middleware never reads raw provider claims. New rule codified in `dev-standards.md` §8: **no raw provider SDK imports outside the concrete `AuthService` implementation** — review-rejected if a controller imports `@aws-sdk/client-cognito-identity-provider` directly. Swap-day work becomes (a) write the new provider's `AuthService` impl, (b) one DI wiring change, (c) per-user migration script that creates each user in the new provider, captures the new external ID, copies `current_org_id` to the new provider's metadata system (Auth0 `app_metadata`, Clerk `privateMetadata`, etc.), and runs `UPDATE users SET external_auth_id = $new WHERE id = $userId`. No FK touched, no application code changed beyond DI. Days of work, not months. Touch-point migration map captured in `v2-decisions.md` under RF-16 for swap-day reference. Net code in v2: 1 column + 1 UNIQUE index + `loadUser` queries by `external_auth_id`. ~3-line schema change.

---

### Rapid-fire round status

**✅ All 16 entries locked (RF-1 through RF-16). RF-17 absorbed by Q3.**

After-rapid-fire work begins next session: v1 functional issue triage → app + infra review → roles/RBAC dedicated pass → phase re-sequencing → build kickoff.

---

### Already decided in Q1–Q16

#### RF-17. Tenant data isolation — PostgreSQL Row Level Security (RLS)

Tenant data isolation safety — should we eventually consider PostgreSQL Row Level Security (RLS) for stronger tenant isolation guarantees?

Yes — already locked in **Q3** (`v2-decisions.md`). v2 uses middleware-only tenant isolation; RLS is the parked defense-in-depth upgrade and lives in `upgrades.md` → "Row-Level Security (RLS) as defense-in-depth on top of middleware."

---

### How to use this doc

- **One entry per rapid-fire question.** Team-raised phrasing kept verbatim at the top of each entry so the doc is searchable against the original questions.
- **Short answers.** This file is for quick scanning and team sharing. Full reasoning / options / tradeoffs / discussion notes for locked items live in `v2-decisions.md` under the matching RF-N entry.
- **Pending items are listed in queue order.** As we lock each one, move it from "Pending discussion" to "Decided" and fill in the answer.
- **IDs are stable.** RF-1, RF-2, … are stable references across docs. Never renumber.
