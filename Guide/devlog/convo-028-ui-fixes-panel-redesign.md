# convo-028 — UI fixes: board sync, backlog ordering, TicketPanel redesign

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fixed multiple UI issues reported after Phase 5:

1. Board columns not updating after ticket creation / status changes
2. Backlog showing oldest sprint at top (expanded), not active sprint
3. TicketPanel showing no comments; meta fields (reporter, sprint, dates) hidden until expand
4. TicketPanel comment hooks missing ticketKey (so invalidation was broken)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — Board column sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Root cause:
  useEffect([sprint?.id]) only fires when the active sprint changes identity,
  not when tickets are added/removed/moved within it.

Fix:
  Replaced [sprint?.id] with [ticketsKey] where:
    ticketsKey = sprint?.tickets.map(t => `${t.id}:${t.status}`).join(',') ?? ''

  This string changes whenever:
  - A new ticket is added to the active sprint
  - Any ticket's status changes (e.g. via ticket detail page dropdown)

  The effect re-runs and resets columns from server data.
  DnD optimistic updates still work: they fire immediately, API confirms/reverts,
  then on success the project refetches, ticketsKey changes, effect re-syncs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — Backlog sprint ordering
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Root cause:
  DB returns sprints ordered by created_at ASC → oldest sprint is first.
  isInitiallyOpen() opened project.sprints[0] (oldest), not the active sprint.

Fix:
  1. Sort sprints before render: active → planned → completed.
     Uses STATUS_ORDER map: { active: 0, planned: 1, completed: 2 }.
     Sorted into sortedSprints; used for both rendering and isInitiallyOpen fallback.
  2. isInitiallyOpen now:
     - If highlightSprint param is set: open that sprint (navigation from sprint detail page)
     - Else if active sprint exists: open the active sprint
     - Else: open the first sprint in sorted order (oldest planned)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — TicketPanel redesign (Jira-style always-visible sidebar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Root cause (comments empty):
  TicketPanel derived `ticket` from project data, which always has comments: [].
  The panel never called useTicket() which is the only query that returns real comments.
  Also: useAddComment / useDeleteComment were missing ticketKey (3rd param) so
  cache invalidation targeted the wrong query key.

Fix:
  - Added useTicket(project.id, ticket.key) inside the panel.
  - Comments section now reads from fullTicket?.comments ?? [].
  - useAddComment and useDeleteComment now receive ticket.key as 3rd arg.

Root cause (fields hidden):
  metaSidebar with reporter, sprint, dates was only rendered when expanded === true.
  Users had to click the expand button to see basic ticket info like reporter and dates.

Fix (layout redesign):
  - Removed the compact meta row (inline selects at top of mainContent).
  - Renamed metaSidebar → detailsSidebar; always rendered (no expanded condition).
  - detailsSidebar contains: Status, Type, Priority, Assignee, Reporter, Sprint, Created,
    Updated, Delete button — all labeled, all visible in the default side panel view.
  - Expanded button still works: makes the panel full-width for more reading/writing space.
  - Panel width bumped from 700px → 780px to accommodate the always-visible sidebar
    without cramping the content area.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLARIFICATIONS (no code change)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DnD restriction (user role):
  Regular users can only drag tickets assigned to them. This is correct by design.
  Admin/PM can drag any ticket (isUser = false → disabled = false for all cards).
  A user seeing "drag doesn't work" is likely trying to drag someone else's ticket.

Assignee list only shows admin:
  The assignee dropdown shows project.members — only users who have been added to the
  project via Settings → Members. If only admin is a member, only admin appears.
  Other org users must be added as members first.

Description attribution:
  Jira shows "edited" on descriptions via a dedicated history/audit log table.
  Not currently tracked in this project (updated_at field on ticket covers it loosely).
  Can be added as a future feature if needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
frontend/app/(app)/projects/[id]/board/page.tsx      — ticketsKey dep for useEffect
frontend/app/(app)/projects/[id]/backlog/page.tsx    — sortedSprints, fixed isInitiallyOpen
frontend/components/shell/TicketPanel.tsx            — useTicket for comments, ticketKey
                                                       passed to comment hooks, always-visible
                                                       details sidebar, removed compact meta row

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: Phase 0–5 ✓, UI fixes ✓
Next: Phase 6 — Search + My Work
