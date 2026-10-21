# Convo 019 — Functional Gaps Complete

**Date:** 2026-04-11  
**Type:** Implementation

---

## Summary

Completed all remaining functional gap implementations started in convo-018. Frontend is now fully wired for API integration.

---

## Files changed

### `frontend/components/modals/CreateTicketModal.tsx`
- Always show sprint selector regardless of sprint count (no more "no sprints" warning)
- First option: `Backlog (no sprint)` with `value=""`
- Defaults to active sprint if one exists, otherwise planned, otherwise backlog
- Removed `if (!sprintId) { return; }` guard — empty sprintId = backlog
- Submit button no longer disabled when no sprints
- Payload: `sprintId: sprintId || undefined` (undefined = goes to backlog)
- Only non-completed sprints shown in select

### `frontend/app/(app)/projects/[id]/backlog/page.tsx`
- `SprintSection` now has Start/Complete sprint buttons (admin/PM only)
  - Start: shown for planned sprints when no active sprint exists
  - Complete: shown for active sprints; tooltip warns incomplete tickets return to backlog
- New `BacklogSection` component at bottom — shows `project.backlog` tickets (sprintId = null)
  - Collapsible, open by default
  - Admin/PM: "Move to sprint" select per ticket (calls `useUpdateTicket`)
  - "Add ticket" button opens CreateTicketModal
- Empty state only when `project.sprints.length === 0 && backlog.length === 0`
- Ticket count in header now includes backlog tickets
- Uses `useStartSprint`, `useCompleteSprint` from `useSprints`
- Uses `useAuthStore` for `canManage` gate

### `frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx`
- Added `useStartSprint`, `useCompleteSprint` hooks
- Start sprint button: planned sprints, admin/PM, only when no active sprint exists
- Complete sprint button: active sprints, admin/PM (shown alongside Edit button)
- `canManage = admin || PM` derived separately from `canEdit` (which requires active + canManage)
- `hasActiveSprint` derived from `project.sprints.some(s => s.status === 'active')`

### `frontend/app/(app)/projects/[id]/tickets/[key]/page.tsx`
- Full rewrite — now a fully interactive ticket detail page
- Searches `project.backlog` too (previously only searched sprint tickets)
- Hooks hoisted before early returns to comply with React rules of hooks
- Inline title editing: click h1 → input → blur/Enter saves, Escape cancels
- Inline description editing: click text or Pencil button → textarea → Save/Cancel
- Editable meta sidebar (all roles): status, type, priority, assignee — auto-saving selects
- Sprint selector (admin/PM only) — "Backlog" as first option, only non-completed sprints
- Users without canManage see sprint as read-only
- Real comment input: textarea expands on focus, Cmd+Enter submits, Cancel clears
- Comment delete on hover: own comments for all roles, any comment for admin/PM
- Delete ticket button (admin/PM only) at bottom — navigates back on success
- Reporter always read-only

### `docs/info.md`
- Added `useComments.ts` to hooks section
- Updated backlog, sprints, and tickets page descriptions

---

## Frontend status

All pages and components are now fully implemented. Frontend is ready for backend API integration.

Remaining for backend:
- Auth (register, login, /me) — must return `role_type` + `role_name` (already fixed in convo-016)
- Project CRUD + member management
- Sprint CRUD + start/complete flow
- Ticket CRUD + comment endpoints
- Backlog structure: `GET /projects/:id` returns `backlog: Ticket[]` (tickets where sprintId = null)
