# Convo 017 — RBAC Frontend Enforcement Complete

**Date:** 2026-04-11  
**Type:** Bug fix + Implementation

---

## Bug fixed — auth controller sending stale `role` field

The auth controller was never updated when `role` was renamed to `role_type` + `role_name` in convo-015.
All three endpoints (register, login, /me) were still signing JWTs with `role: user.role` and responding
with `role: user.role` instead of `role_type` + `role_name`. This caused the frontend to receive
`undefined` for both fields, so role display (settings page, sidebar, member lists) showed nothing.

**Fix — `backend/modules/auth/auth.controller.ts`:**
- JWT payload: `role: user.role` → `role_type: user.role_type`
- All three response bodies: `role: user.role` → `role_type: user.role_type, role_name: user.role_name`

**Side effect:** Anyone with an old token (signed with `role`) must log in again. Acceptable.

---

## RBAC frontend enforcement — what was added this session

### Sidebar — `components/shell/Sidebar.tsx`
- "New project" button — hidden unless `user.role_type === 'admin'`
- "New sprint" button (ProjectSidebar) — hidden unless `admin` or `project_manager`

### Project settings — `app/(app)/projects/[id]/settings/page.tsx`
- Added `useAuthStore` — reads `isAdmin = user?.role_type === 'admin'`
- Project name input — `disabled` when `!isAdmin`
- Description textarea — `disabled` when `!isAdmin`
- "Save changes" button — hidden when `!isAdmin`
- "Add member" button — hidden when `!isAdmin`
- Member "Remove" button — hidden when `!isAdmin`
- Danger zone section (archive + delete) — hidden when `!isAdmin`
- Removed old stale role select dropdown (still said "Sprint Manager")

---

## Decisions confirmed

- **Admin + My Work**: All three roles keep My Work. It's personal — tickets assigned to me. Admin is still a person who can be assigned tickets.
- **Tickets assignable to admin**: Yes, no restriction. Admin can do work too.
- **Edit ticket fields**: All three roles (admin, PM, user) — same as Jira.
- **Edit sprint goal/notes**: Admin + PM only — already enforced via `canEdit` on sprint page.
- **Edit project name/description**: Admin only — now enforced.
- **/team vs /admin pages**: Kept separate. `/team` = org directory for everyone. `/admin` = management for admin only.

---

## RBAC status after this session

### Fully enforced in frontend
| Feature | Rule |
|---|---|
| Create project | admin only |
| Edit project name/description | admin only |
| Add/remove project member | admin only |
| Archive/delete project | admin only |
| Create sprint | admin + PM |
| Edit sprint goal/notes | admin + PM |
| Board DnD | user = own assigned tickets only |
| Admin page access + link | admin only |
| New project link in sidebar | admin only |

### Pending — feature UI not built yet (RBAC goes in when built)
| Feature | Rule |
|---|---|
| Edit ticket fields (title, desc, type, priority, assignee) | all roles |
| Delete ticket | admin + PM |
| Add comment | all roles |
| Delete own comment | all roles |
| Delete any comment | admin + PM |
| Sprint start / complete | admin + PM |
| Move ticket between sprints | admin + PM |

---

## Files changed
- `backend/modules/auth/auth.controller.ts` — JWT + response: `role` → `role_type` + `role_name`
- `frontend/components/shell/Sidebar.tsx` — New project (admin only), New sprint (admin + PM)
- `frontend/app/(app)/projects/[id]/settings/page.tsx` — all controls gated to admin
