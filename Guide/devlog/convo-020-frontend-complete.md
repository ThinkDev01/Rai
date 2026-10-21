# Convo 020 — Frontend Complete

**Date:** 2026-04-11  
**Type:** Implementation

---

## Summary

All remaining frontend gaps closed. Frontend is now feature-complete and ready for backend integration.

---

## Changes

### `frontend/hooks/useProjects.ts`
- Added `useDeleteProject(id)` — DELETE /projects/:id, invalidates + removes project from cache, navigates to /dashboard on success

### `frontend/hooks/useSprints.ts`
- Added `useDeleteSprint(projectId, sprintId)` — DELETE /projects/:id/sprints/:id

### `frontend/hooks/useSearch.ts` (new)
- `useSearch(q)` — GET /search?q= (enabled when q.length >= 2, staleTime 30s)

### `frontend/hooks/useDebounce.ts` (new)
- Generic `useDebounce<T>(value, delay)` hook — used by SearchModal

### `frontend/types/api.types.ts`
- `CreateTicketPayload.parentKey?: string` — optional parent ticket key
- Added `SearchResult` interface — `{ id, key, title, type, status, priority, assignee, projectId, projectName, projectKey }`

### `frontend/lib/messages.ts`
- Added `board.noSprints` message — distinct from `board.noActiveSprint`

### `frontend/components/search/SearchModal.tsx` (new)
- Full search overlay component
- Opens on header search click or Cmd+K / Ctrl+K
- Debounced input (300ms) → calls `useSearch`
- Keyboard navigation: ↑↓ to move, Enter to open, Esc to close
- Results: type icon, key, title, status badge, project key
- Links to `/projects/:projectId/tickets/:key`
- Empty state, loading spinner, "type 2+ chars" hint

### `frontend/components/shell/Header.tsx`
- Search bar replaced with a button that opens `SearchModal`
- Mobile: search icon button added to right side
- Cmd+K / Ctrl+K global shortcut wires to `setSearchOpen(true)`
- `SearchModal` rendered at root of header component

### `frontend/components/modals/CreateTicketModal.tsx`
- Added "Parent ticket" optional select (shown only when project has tickets)
- Lists all tickets from sprints + backlog with key and truncated title
- `parentKey` sent in payload (undefined = no parent)

### `frontend/app/(app)/projects/[id]/settings/page.tsx`
- Wired `useDeleteProject` — delete button now opens a `DeleteProjectModal`
- `DeleteProjectModal`: must type exact project name to enable confirm button
- On success: `router.replace('/dashboard')`

### `frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx`
- Added `useDeleteSprint` — delete button at bottom of page (admin only, not PM)
- Shows inline confirm: "Are you sure? Tickets will return to backlog." + Confirm/Cancel
- On success: `router.replace('/projects/:id/backlog')`
- Completed sprints cannot be deleted (button hidden)

### `frontend/app/(app)/projects/[id]/board/page.tsx`
- Board empty state now distinguishes three cases:
  1. No sprints at all → "No sprints yet" + "Go to Backlog" button
  2. Sprints exist but none active → "No active sprint" + "Go to Backlog" button
  3. Project archived → "Project archived" (no CTA)
- Added `Link` import from next/link for CTA button

---

### `frontend/hooks/useProjects.ts` (additions in convo-020 part 2)
- `useAddProjectMember(projectId)` — POST /projects/:id/members { userId }
- `useRemoveProjectMember(projectId)` — DELETE /projects/:id/members/:userId

### `frontend/components/modals/AddMemberModal.tsx` (new)
- Fetches all org users via `useTeamMembers`
- Filters out users already in `project.members` (by id)
- Client-side name/email filter input
- Click "Add" per user → calls `useAddProjectMember` (stays open for multi-add)
- Empty state: "All org members are already in this project."

### `frontend/app/(app)/projects/[id]/settings/page.tsx` (wiring)
- "Add member" button now opens `AddMemberModal`
- Remove button now shows inline confirm (Confirm / Cancel) per member row
- `useRemoveProjectMember` called on confirm

---

## Backend endpoints needed (in order of priority)

| Endpoint | Method | Notes |
|---|---|---|
| POST /auth/register | POST | Returns `role_type + role_name` (already fixed) |
| POST /auth/login | POST | Returns `role_type + role_name` (already fixed) |
| GET /auth/me | GET | Returns `role_type + role_name` (already fixed) |
| GET /projects | GET | Returns `ProjectSummary[]` |
| POST /projects | POST | Payload: `CreateProjectPayload` |
| GET /projects/:id | GET | Returns `Project` with `backlog: Ticket[]` |
| PATCH /projects/:id | PATCH | Payload: `UpdateProjectPayload` |
| DELETE /projects/:id | DELETE | Admin only |
| GET /users | GET | All org members |
| PATCH /users/:id/role | PATCH | Admin only — `{ role_type, role_name }` |
| DELETE /users/:id | DELETE | Admin only — with username confirm |
| POST /projects/:id/sprints | POST | `CreateSprintPayload` |
| PATCH /projects/:id/sprints/:id | PATCH | `UpdateSprintPayload` (includes `status`) |
| DELETE /projects/:id/sprints/:id | DELETE | Admin only |
| POST /projects/:id/tickets | POST | `CreateTicketPayload` (includes `parentKey`, `sprintId`) |
| PATCH /projects/:id/tickets/:id | PATCH | `UpdateTicketPayload` |
| DELETE /projects/:id/tickets/:id | DELETE | Admin + PM only |
| POST /tickets/:id/comments | POST | `{ content }` |
| DELETE /tickets/:id/comments/:id | DELETE | Own = all roles, any = admin + PM |
| GET /search?q= | GET | Returns `SearchResult[]` — searches title + key |
| POST /projects/:id/members | POST | Admin only — `{ userId }`, adds existing org user |
| DELETE /projects/:id/members/:userId | DELETE | Admin only |
| GET /me/tickets | GET | Returns `MyWorkItem[]` |
