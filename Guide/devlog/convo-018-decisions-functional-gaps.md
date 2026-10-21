# Convo 018 — Architecture Decisions + Functional Gaps Implementation

**Date:** 2026-04-11  
**Type:** Decisions + Implementation

---

## Decisions locked in

### Sprint complete flow
- Incomplete tickets (not in 'done' status) **auto-move to backlog** when a sprint is completed
- No prompt/dialog — silent and automatic
- Backend: on `PATCH /sprints/:id { status: 'completed' }`, set `sprint_id = NULL` for all non-done tickets

### Backlog structure
- Tickets can exist with no sprint assigned (`sprintId = null`) — this is the "backlog" state
- Backlog page shows:
  1. All sprints (planned + active) with their tickets — collapsible sections
  2. A "Backlog" section at the bottom — tickets where `sprintId === null`
- From the backlog, admin/PM can move tickets into a sprint
- When creating a ticket, sprint is optional — if not chosen, goes to backlog

### Sprint cycle
1. Create sprint (dates set at creation) → status: `planned`
2. Admin/PM clicks "Start sprint" → status: `active` (only one active sprint at a time)
3. Admin/PM clicks "Complete sprint" → status: `completed`, incomplete tickets → `sprintId = null`
- Start/complete buttons: admin + PM only
- One active sprint at a time enforced by backend

### 403 handling
- Show same as 404 (page not found) — no complex messaging needed

### Add member to project
- Dropdown of existing org users only — no email invitations
- Admin selects from a list of registered users not already in the project

### Ticket created_by / created_at
- `reporter: Member` is automatically set to current user on creation (backend sets `reporter_id = req.user.id`)
- `createdAt` is auto-set by DB
- Both are displayed in ticket panel and detail page — read-only

---

## Functional gaps implemented this session

### Type changes — `api.types.ts`
- `Ticket.sprintId: string | null` (null = backlog)
- `Project.backlog: Ticket[]` (tickets not in any sprint)
- `CreateTicketPayload.sprintId?: string` (optional — if omitted, goes to backlog)
- `UpdateTicketPayload.sprintId?: string | null` (move between sprints / to backlog)

### New hook — `hooks/useComments.ts`
- `useAddComment(ticketId)` — POST /tickets/:id/comments
- `useDeleteComment(ticketId)` — DELETE /tickets/:id/comments/:commentId

### TicketPanel — full rewrite
- Inline title editing (click h2 → input → blur/Enter saves)
- Inline description editing (Edit button → textarea → Save/Cancel)
- Auto-saving selects: status, type, priority, assignee (all roles)
- Sprint assignment (admin/PM only) — includes "Backlog" option
- Delete ticket button (admin/PM only) — closes panel on success
- Real comment input — uses auth store user's initials (not hardcoded)
- Comment delete — own comments for all roles; any comment for admin/PM

### Backlog page — updated
- SprintSection now shows: Start sprint (planned, admin/PM), Complete sprint (active, admin/PM)
- Only one active sprint at a time — start button hidden if one already exists
- New BacklogSection at bottom — shows tickets where sprintId === null
- BacklogSection has "Move to sprint" per ticket (admin/PM) and "Add ticket" button

### Sprint detail page — updated
- "Start sprint" button for planned sprints (admin/PM)
- "Complete sprint" button for active sprints (admin/PM) with warning note

### CreateTicketModal — updated
- Sprint field now optional — "Backlog (no sprint)" as first option
- Submit no longer disabled when no sprints exist

### Ticket detail page — updated
- Inline title + description editing
- Editable meta fields (status, type, priority, assignee, sprint)
- Real comment input + comment delete

---

## Files changed
- `frontend/types/api.types.ts`
- `frontend/hooks/useComments.ts` (new)
- `frontend/components/shell/TicketPanel.tsx` (rewrite)
- `frontend/components/modals/CreateTicketModal.tsx`
- `frontend/app/(app)/projects/[id]/backlog/page.tsx`
- `frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx`
- `frontend/app/(app)/projects/[id]/tickets/[key]/page.tsx`
- `docs/rbac.md`
