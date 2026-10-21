# Convo 012 — Project Overview, Sidebar Redesign, Archived Projects

**Date:** 2026-04-11  
**Type:** UI shell — new pages + navigation improvements

---

## What was built

### New pages

- `/projects/[id]/overview` — Project landing page replacing the board redirect
  - Project header (avatar, name, key, description, last active)
  - Stats row: total tickets, completion %, member count, sprint count
  - Active sprint card with status breakdown (To Do / In Progress / In Review / Done)
  - Sprint history list with progress bars and status badges
  - Members panel with roles
  - Archived banner when `project.archived === true`

- `/projects/[id]/settings` — Per-project settings shell
  - General section: name + description edit, key (locked)
  - Members section: list with role dropdowns, "Add member" button
  - Danger zone: Archive project + Delete project (shell only, no real actions)
  - Disabled when project is archived

### Sidebar redesign

- Added **Overview** as the first nav link in project mode
- Added **Project Settings** link at the bottom of project sidebar
- Sprint section: replaced expand/collapse accordion with a clean flat list
  - Sprint name + status badge (Active / Planned) inline
  - Date range or ticket count shown as small subtext below each sprint name
  - No expand/collapse — simpler and cleaner
  - "New sprint" button hidden for archived projects

### Archived projects

- `MOCK_ARCHIVED_PROJECTS` sidebar links changed from `<div>` (non-clickable) to `<Link>` pointing to `/projects/${id}/overview`
- Legacy API project added as a full `MockProject` in `mock-data.ts` with `archived: true`
  - 2 completed sprints with 6 tickets
  - Description, members, last active date
- `getMockProject()` now also checks the archived project by ID

### Routing

- `projects/[id]/page.tsx` now redirects to `/overview` instead of `/board`
- Board page: archived projects with no active sprint now show an archived banner + appropriate empty state message

## Data model change

Added `archived?: boolean` to `MockProject` interface. Optional — false by default for all existing projects.

## Files changed

- `frontend/lib/mock-data.ts` — `archived?` field, `ARCHIVED_PROJECT` const, updated `getMockProject`
- `frontend/components/shell/Sidebar.tsx` — sprint list redesign, Overview + Settings links, archived project links
- `frontend/app/(app)/projects/[id]/page.tsx` — redirect to overview
- `frontend/app/(app)/projects/[id]/board/page.tsx` — archived banner on no-sprint state
- `frontend/app/(app)/projects/[id]/overview/page.tsx` — **new**
- `frontend/app/(app)/projects/[id]/settings/page.tsx` — **new**
