# Convo 016 — Project Visibility, DnD RBAC, Role Display, Team & Admin Pages

**Date:** 2026-04-11  
**Type:** Implementation

---

## What was built

### Project visibility
- `frontend/types/api.types.ts` — added `visibility: 'public' | 'private'` to `UpdateProjectPayload`
- `frontend/components/modals/CreateProjectModal.tsx` — added visibility toggle (public/private segmented button, default public); passed to `createProject` mutation
- `backend/config/migrations/009_projects_visibility.sql` — `ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'))`

### Board DnD RBAC restriction
- `frontend/app/(app)/projects/[id]/board/page.tsx`:
  - Imports `useAuthStore` — reads `user.role_type` and `user.id`
  - `DraggableCard` accepts `disabled` prop — passes it to `useDraggable({ disabled })` and strips listeners when disabled; cursor becomes `cursor-default`
  - `DroppableColumn` accepts `isUser` + `currentUserId` props — passes `disabled={isUser && ticket.assignee?.id !== currentUserId}` to each card
  - `user` role: can only drag tickets assigned to them. `admin` + `project_manager`: unrestricted.

### Role display — role_name + subtle role_type
All member/user displays now show `role_name` as the primary label and `role_type` as a subtle bordered badge:

- `frontend/app/(app)/settings/page.tsx` — profile section: `role_name` badge + subtle `role_type` border badge
- `frontend/app/(app)/projects/[id]/overview/page.tsx` — member list rows
- `frontend/app/(app)/projects/[id]/settings/page.tsx` — member list rows

### /team page (new)
- `frontend/app/(app)/team/page.tsx` — org member list for all users
  - Shows: avatar, name, email, role_name, subtle role_type badge
  - Admin gets a "Manage" button linking to /admin
  - Loading skeleton + error state
  - Wired to `useTeamMembers` (GET /users — pending backend)

### /admin page (new)
- `frontend/app/(app)/admin/page.tsx` — admin only
  - Redirects non-admins to /dashboard (backend also enforces)
  - Per-member rows: edit role_type (dropdown) + role_name (input) inline; save/cancel
  - Delete account: opens confirmation modal — admin must type the member's exact name before the delete button enables
  - "You" badge on own account row; no edit/delete controls for self
  - Wired to `useTeamMembers`, `useUpdateMemberRole`, `useDeleteMember`

### useTeam hook (new)
- `frontend/hooks/useTeam.ts`:
  - `useTeamMembers()` — GET /users
  - `useUpdateMemberRole()` — PATCH /users/:id/role `{ role_type, role_name }`
  - `useDeleteMember()` — DELETE /users/:id

### Sidebar
- `frontend/components/shell/Sidebar.tsx`:
  - Added `Users` + `Shield` icons from lucide-react
  - Added `NavLink` for `/team` (all users, between My Work and Projects section)
  - Added `NavLink` for `/admin` (only rendered when `user.role_type === 'admin'`)

---

## Backend work needed (next)
- `modules/users/` — new module for team management
  - `GET /api/v1/users` — list all org members (admin + pm + user can call; returns Member[])
  - `PATCH /api/v1/users/:id/role` — update role_type + role_name (admin only)
  - `DELETE /api/v1/users/:id` — delete account (admin only, not self)
- Project visibility enforcement in `modules/projects/` — filter by membership on private projects

---

## Files changed
- `frontend/types/api.types.ts`
- `frontend/components/modals/CreateProjectModal.tsx`
- `frontend/app/(app)/projects/[id]/board/page.tsx`
- `frontend/app/(app)/settings/page.tsx`
- `frontend/app/(app)/projects/[id]/overview/page.tsx`
- `frontend/app/(app)/projects/[id]/settings/page.tsx`
- `frontend/hooks/useTeam.ts` (new)
- `frontend/app/(app)/team/page.tsx` (new)
- `frontend/app/(app)/admin/page.tsx` (new)
- `frontend/components/shell/Sidebar.tsx`
- `backend/config/migrations/009_projects_visibility.sql` (new)
- `docs/info.md`
