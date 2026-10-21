# Convo 015 — RBAC Finalised, Role Structure & Settings

**Date:** 2026-04-11  
**Type:** Discussion + Implementation

---

## Decisions made

### Role rename
`sprint_manager` → `project_manager` across all code and docs.
Rationale: PM manages more than just sprints — backlog, tickets, delivery. "Sprint manager" was too narrow.

### Two-layer role structure
```
role_type  →  fixed enum, drives all permission checks
role_name  →  custom display string (e.g. "Tech Lead", "Scrum Master")
```
Changed across: frontend `api.types.ts`, `auth.types.ts`, backend `common.types.ts`, `auth.types.ts`, seed script.
All UI now shows `role_name` (no more `.replace('_', ' ')`). All permission checks use `role_type`.

### DB migration 008
`008_users_role_type_and_role_name.sql`:
- Renames `role` column → `role_type`
- Migrates `sprint_manager` → `project_manager` in existing data
- Updates CHECK constraint
- Adds `role_name VARCHAR(100)` column
- Seeds `role_name` from `role_type` for existing rows

### Delete account — removed everywhere
No delete button in settings for any role (including admin).
Settings page shows: "Contact your admin to delete your account."
Admin can delete accounts only from `/admin` page, with username confirmation required before deletion.

### Settings page rework
- Profile: name + email read-only, "contact admin" hint
- Appearance: dark/light mode toggle (in addition to header icon)
- Account: informational note about account deletion — no button
- Removed: hardcoded team members list, danger zone with delete button

### Board DnD RBAC
`user` role: can only drag tickets assigned to them.
`admin` + `project_manager`: can drag any ticket.

### Comment deletion
`admin` + `project_manager`: can delete anyone's comment.
`user`: can only delete their own.

### Pages decided
- `/team` — visible to all roles. Read-only member list for pm + user. Full management (role changes) for admin.
- `/admin` — admin only. Account deletion with username confirmation. Role assignment.
- `/settings` — all roles. Profile read-only + dark mode toggle only.

### Reports + member list
Visible to all roles — transparency is good, consistent with Jira.

### First admin bootstrap
Seeded via `npm run seed` (admin@rai.dev). All subsequent role changes via `/admin` page.

---

## Files changed

**Backend**
- `backend/modules/auth/auth.types.ts` — `role` → `role_type`, added `role_name`
- `backend/types/common.types.ts` — `role` → `role_type` in `AuthUser`
- `backend/scripts/seed.ts` — `sprint_manager` → `project_manager`, name updated
- `backend/config/migrations/008_users_role_type_and_role_name.sql` — new migration

**Frontend**
- `frontend/types/api.types.ts` — `Member.role` → `role_type` + `role_name`
- `frontend/types/auth.types.ts` — `AuthUser.role` → `role_type` + `role_name`
- `frontend/app/(app)/settings/page.tsx` — full rewrite (appearance, account note, no delete)
- `frontend/app/(app)/my-work/page.tsx` — `.role` → `role_name`
- `frontend/app/(app)/projects/[id]/overview/page.tsx` — member `.role` → `role_name`
- `frontend/app/(app)/projects/[id]/settings/page.tsx` — member `.role` → `role_name`
- `frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx` — `.role` → `.role_type`
- `frontend/components/shell/Sidebar.tsx` — `.role` → `role_name`
- `frontend/components/shell/ProjectSubNav.tsx` — member `.role` → `role_name`

**Docs**
- `docs/rbac.md` — full rewrite with finalised matrix
- `docs/devguide/02-auth.md` — role descriptions updated
- `docs/test-credentials.md` — Sprint Manager → Project Manager
- `docs/info.md` — migration 008 + pages updated (see next session)

---

## Open / next session

- `/team` page — to be built (visible to all, management controls for admin)
- `/admin` page — to be built (admin only, role changes + account deletion)
- Backend implementation starts after RBAC is fully signed off
