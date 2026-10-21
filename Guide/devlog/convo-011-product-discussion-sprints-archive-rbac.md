# Convo 011 — Product Discussion: Sprints, Archive, RBAC, Notifications

**Date:** 2026-04-11  
**Type:** Discussion / Planning — no code changes this session

---

## Topics discussed

- Sprint lifecycle (create → active → complete → archive)
- What goes to backlog vs archive and when
- Project details page (missing from shell — needs to be added)
- Archived projects navigation (currently non-clickable — needs fix)
- User's LP1/LP2 use case — validated and clarified
- RBAC (role-based access) — planned for future
- Notifications — planned for future integration

## Decisions / Clarifications

### Sprint flow (correct mental model)
1. Create project → land on Board (shows empty state)
2. Go to Backlog → create a sprint → set date range → add tickets → Start Sprint
3. While active → Board shows kanban, drag tickets between columns
4. When sprint time ends (or manually triggered) → Complete Sprint action
   - INCOMPLETE tickets → return to Backlog (unassigned pool)
   - COMPLETED (Done) tickets → stay inside the now-archived sprint
5. Archive is MANUAL — not automatic on time expiry

### Archive vs Backlog
- **Backlog** = tickets not assigned to any sprint + incomplete tickets from completed sprints
- **Archive** = completed sprint records (read-only history) + archived projects
- Moving a sprint to archive = manual action (Complete Sprint button)
- Moving a project to archive = manual action (Project Settings or admin action)

### Missing shell pages (to build next)
- Project Overview/Details page (`/projects/[id]` currently just redirects to board)
- Project Settings page (per-project, not global settings)
- Archived projects should be clickable/navigable (currently just shown as text)
- "Complete Sprint" button/flow on the board

### RBAC plan (future)
- Admin: full access (create/archive projects, manage members, all CRUD)
- Sprint Manager: manage sprints, create/assign tickets, view all
- User (Developer): view their assigned tickets, update status, comment
- Archived projects: visible to admin + sprint_manager only

### Notifications (future)
- In-app notifications (ticket assigned, comment added, sprint started/completed)
- Can integrate via WebSockets or polling initially
- Later: email notifications optional

## Next steps
1. Fix archived projects to be navigable (read-only view)
2. Add Project Overview page as the landing page after project click
3. Add Project Settings page per project
4. Add "Complete Sprint" flow to Board
5. Plan RBAC middleware for backend
