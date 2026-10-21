# Convo 021 — Code Audit, Search Redesign, Backend Plan

**Date:** 2026-04-11  
**Type:** Cleanup + Redesign + Planning

---

## Code audit — what was fixed

### Real bugs fixed
- **Ticket detail page** (`tickets/[key]/page.tsx`) — description section was missing `group` class, so the hover-reveal pencil icon was permanently invisible (`opacity-0` with no trigger). Added `group` to the section.
- **BacklogSection** (`backlog/page.tsx`) — dead `useUpdateTicket(projectId, '')` call and unused `moveToSprint()` function removed. The actual move logic lives correctly in `BacklogTicketRow`.
- **Project settings** (`settings/page.tsx`) — `UserMinus` icon imported but never used. Removed.

### Refactor — `projectColor()` extracted
- Was duplicated identically in 3 files: `Sidebar.tsx`, `dashboard/page.tsx`, `overview/page.tsx`
- Extracted to `lib/project.utils.ts` and imported from there in all 3 files
- Single source — change the palette once, updates everywhere

### Known code quality issues (NOT fixed — documented for future cleanup)
- Icon maps (`TYPE_ICON`, `TYPE_META`, `PRIORITY_ICON`, `PRIORITY_META`) duplicated in ~7 files with slight size variations. Future refactor: `lib/ticket.utils.tsx` with factory functions.
- Modal backdrop `onClick` pattern repeated in all 5 modals. Future: shared `<Modal>` wrapper.
- `useEscapeKey` not extracted into a hook. Future: small custom hook.
- These are code quality issues, not bugs. Deferred to post-backend cleanup sprint.

---

## Search UI redesign — Jira-style inline

### Problem
Search was a button in the header that opened a full-screen centered modal. Felt disconnected — the modal wasn't anchored to the bar that triggered it.

### What changed

**`components/search/SearchBar.tsx`** (new)
- Real `<input>` element embedded directly in the header (desktop only)
- On focus/type → results drop down as a panel directly below the input, same width, anchored
- `useDebounce(300ms)` → `useSearch(q)` — no change to the hook
- Keyboard nav: ↑↓ arrows, Enter to open, Esc to blur/close
- Result clicks use `onMouseDown` + `e.preventDefault()` to prevent input blur before navigation
- `⌘K` hint fades out when input is focused (CSS opacity transition)
- Loader spinner replaces the `⌘K` hint while fetching

**`components/shell/Header.tsx`** (updated)
- Desktop: renders `<SearchBar inputRef={searchInputRef} />` inline in the center slot
- `Cmd+K` / `Ctrl+K` now calls `searchInputRef.current?.focus()` — no modal on desktop
- Mobile: search icon still opens `<SearchModal>` (full-screen is correct on small screens)

**`components/search/SearchModal.tsx`** (unchanged — mobile only)
- Still used on mobile (`< md` breakpoint). No changes to the component itself.

---

## Frontend guide created

`docs/frontend-guide.md` — beginner-friendly guide covering:
- Folder structure with explanations
- The three state layers (server/auth/UI)
- Standard page pattern (loading → error → render)
- RBAC quick reference table
- How the API layer works
- How to write a hook (with example)
- Types and data shapes (including the backlog structure)
- TicketPanel mechanics
- Search mechanics
- Board DnD mechanics
- Common patterns with code examples
- "Don't do" table
- Known technical debt notes
- How to add a new feature (checklist)

---

## Backend audit findings

### What's already done (solid foundation)
- Auth fully implemented: register, login, GET /me, JWT with `role_type` in payload, bcrypt cost 12, rate limiting, helmet, CORS
- 9 SQL migrations run
- Seed script: 3 test users (admin@rai.dev / manager@rai.dev / user@rai.dev)
- Error handler, pino logging, health check endpoint

### Critical schema mismatches vs frontend expectations

| Issue | Migration | Problem |
|---|---|---|
| `ticket_details` separate table | 005 | Frontend expects `description` on ticket row, not a join |
| `backlog` separate table | 007 | Frontend expects `backlog: Ticket[]` — tickets where `sprint_id IS NULL`, not a separate table |
| `tickets.ticket_number` | 004 | Frontend uses `ticket.key` (e.g. `RAI-1`) |
| Missing `in_review` status | 004 | Frontend uses todo/in_progress/in_review/done |
| Missing `lowest` priority | 004 | Frontend uses critical/high/medium/low/lowest |
| Missing `story`/`epic` types | 004 | Frontend uses task/bug/story/epic |
| `projects.prefix` not `key` | 002 | Frontend uses `project.key` |
| `notes` missing from sprints | 003 | Frontend expects `sprint.notes` |

These need corrective migrations (010+) before any module is built on top.

### Modules not yet started (no routes/controllers/models exist)
- Users (GET /users, PATCH /users/:id/role, DELETE /users/:id)
- Projects (full CRUD + member management)
- Sprints (full CRUD + start/complete/delete)
- Tickets (full CRUD + comments + search)
- My Work (GET /me/tickets)

---

## Backend implementation plan

| Phase | Endpoints | Notes |
|---|---|---|
| 0 (schema fix) | Corrective migrations 010-012 | Fix column names, add missing fields, drop separate tables |
| 1 (auth) | Already done | Verify role_type/role_name shape |
| 2 (users) | GET /users, PATCH /users/:id/role, DELETE /users/:id | Simple, no FK complexity |
| 3 (projects) | CRUD + GET with backlog | backlog = tickets WHERE sprint_id IS NULL |
| 4 (members) | POST/DELETE /projects/:id/members | Small, builds on phase 3 |
| 5 (sprints) | CRUD + start/complete/delete | Business logic: one active at a time |
| 6 (tickets + comments) | Full CRUD + POST/DELETE /tickets/:id/comments | Bulk of the work |
| 7 (search) | GET /search?q= | ILIKE across title + key, returns with project context |
| 8 (my work) | GET /me/tickets | Join query, depends on phase 6 |

**Workflow:** Each phase — schema migration if needed → repo (DB queries) → service (business logic) → controller (HTTP) → routes (register in server.ts) → test against frontend.

---

## Files changed this session
- `lib/project.utils.ts` (new)
- `components/shell/Sidebar.tsx` — import projectColor
- `app/(app)/dashboard/page.tsx` — import projectColor
- `app/(app)/projects/[id]/overview/page.tsx` — import projectColor
- `app/(app)/projects/[id]/tickets/[key]/page.tsx` — added `group` class to description section
- `app/(app)/projects/[id]/backlog/page.tsx` — removed dead code in BacklogSection
- `app/(app)/projects/[id]/settings/page.tsx` — removed unused UserMinus import
- `components/search/SearchBar.tsx` (new) — Jira-style inline search with dropdown
- `components/shell/Header.tsx` — uses SearchBar inline; SearchModal mobile-only
- `docs/frontend-guide.md` (new)
- `docs/devlog/convo-021-audit-search-redesign-backend-plan.md` (this file)
