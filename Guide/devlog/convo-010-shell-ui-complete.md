# Convo 010 — Shell UI complete

**Date:** 2026-04-11  
**Status:** Shell done, ready for API integration

---

## What was decided

- **Build the full UI shell first** (static mock data, no API calls) so the product can be reviewed and demonstrated before backend integration begins.
- **Testing deferred** — agreed to ship product features first, add tests once the app is stable.
- **One feature at a time was too slow** due to UI tweaks per feature; shell-first approach is faster for overall progress review.

---

## What was built this session

### Shell pages (all use `lib/mock-data.ts`, no real API calls)

| Page | Route | Status |
|------|-------|--------|
| Dashboard | `/dashboard` | ✓ Project cards grid + empty state |
| Board | `/projects/[id]/board` | ✓ Kanban (4 cols), 15 filler tickets, filter bar |
| Backlog | `/projects/[id]/backlog` | ✓ Sprint sections, ticket rows, filter bar |
| Archive | `/projects/[id]/archive` | ✓ Completed sprints with ticket list + progress bar |
| Reports | `/projects/[id]/reports` | ✓ Charts: burndown, donut, velocity bars, status bars |
| Ticket detail | `/projects/[id]/tickets/[key]` | ✓ Full Jira-style: description, sub-tickets, comments, meta panel |
| Settings | `/settings` | ✓ Profile, team members, danger zone |
| Login / Register | `/auth/login`, `/auth/register` | ✓ (from previous session) |

### New components

- `components/shell/ProjectSubNav.tsx` — sticky filter bar on board/backlog/archive/reports
  - Search input, assignee avatar toggles, ticket type filter chips (All/Epic/Story/Task/Bug)
- `components/modals/CreateSprintModal.tsx`
- `components/modals/CreateTicketModal.tsx`

### Mock data (`lib/mock-data.ts`)

- 2 projects (RAI Platform, Mobile App)
- 3 sprints (Sprint 1 done, Sprint 2 done, Sprint 3 active with 15 tickets)
- Full ticket detail: description, sub-tickets, parent links, comments, all fields
- 3 members (Admin, Sprint Manager, Dev User)

---

## Critical bug fixed

**Root cause:** Next.js 15+ made `params` a Promise in page components. All dynamic route pages were doing `params.id` synchronously → `undefined` → "Project not found".

**Fix applied to all 6 affected pages:**
- Client components: `import { use } from 'react'` + `const { id } = use(params)`  
- Server component (redirect page): `async function + await params`

Pages fixed: `board`, `backlog`, `archive`, `reports`, `tickets/[key]`, `projects/[id]` (redirect)

---

## Sidebar structure (intentional design)

- **Board / Backlog / Archive / Reports** are project-level views, not per-sprint (matches Jira)
  - Board = active sprint kanban
  - Backlog = all sprints listed, manage tickets
  - Archive = completed sprints read-only
  - Reports = charts and progress visualisation
- **Sprint list in sidebar** = context/reference, not primary nav
- This is the standard Jira-style structure

---

## Reports page charts

All charts use pure SVG (no external library). Fake data for shell:
- Sprint progress bar (% complete)
- Burndown chart — ideal vs actual line, today marker
- Ticket type donut — Task / Story / Bug / Epic
- Velocity bars — story points per sprint (S1: 21, S2: 28, S3: 12 in-progress)
- Status donut — Done / In Review / In Progress / To Do
- Status horizontal bars — percentage breakdown

---

## Next steps

1. Review shell with team / stakeholders
2. Start API integration — replace mock-data reads with React Query + axios calls
3. Projects module: `POST /api/v1/projects`, `GET /api/v1/projects`
4. Sprints module: CRUD endpoints
5. Tickets module: CRUD + status transitions
