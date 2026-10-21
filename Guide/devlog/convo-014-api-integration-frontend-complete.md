# Convo 014 — API Integration Complete, Frontend Ready for Backend

**Date:** 2026-04-11  
**Type:** Implementation

---

## What was built

### Full API integration — all pages wired to React Query

Every authenticated page now fetches from the real backend instead of mock data.
Mock data file (`lib/mock-data.ts`) deleted — zero remaining references.

Pages wired:
- `/dashboard` — `useProjects()`
- `/my-work` — `useMyWork()` from `GET /me/tickets`
- `/projects/[id]/overview` — `useProject(id)`
- `/projects/[id]/board` — `useProject(id)` + `useMoveTicket(id)`
- `/projects/[id]/backlog` — `useProject(id)`
- `/projects/[id]/archive` — `useProject(id)`
- `/projects/[id]/reports` — `useProject(id)`
- `/projects/[id]/settings` — `useProject(id)` + `useUpdateProject(id)` + `useArchiveProject(id)`
- `/projects/[id]/sprints/[sprintId]` — `useProject(id)` + `useUpdateSprint(id, sprintId)`
- `/projects/[id]/tickets/[key]` — `useProject(id)`, ticket found within `project.sprints.flatMap`

### Hooks created

- `hooks/useProjects.ts` — `useProjects`, `useProject`, `useCreateProject`, `useUpdateProject`, `useArchiveProject`
- `hooks/useSprints.ts` — `useCreateSprint`, `useUpdateSprint`, `useStartSprint`, `useCompleteSprint`
- `hooks/useTickets.ts` — `useTicket`, `useCreateTicket`, `useUpdateTicket`, `useMoveTicket`, `useDeleteTicket`
- `hooks/useMyWork.ts` — `useMyWork`

### Modals wired to mutations

- `CreateProjectModal` — `useCreateProject`, navigates to new project on success
- `CreateSprintModal` — `useCreateSprint(projectId)`, closes on success
- `CreateTicketModal` — `useCreateTicket(projectId)`, sprint + assignee selectors from live project data

### New UI components

- `components/ui/PageError.tsx` — network/API error state with optional retry button
- `components/ui/PageNotFound.tsx` — 404 state with customizable title/message/back link
- `components/ui/Skeleton.tsx` — shimmer loading: `SkeletonCard`, `SkeletonRow`, `SkeletonText`, `SkeletonAvatar`

### New lib files

- `lib/errors.ts` — `isNotFoundError(error)` using `axios.isAxiosError()`, no `as any`
- `lib/messages.ts` — centralized empty-state copy, typed `as const`, used by all pages

### Shell improvements

- `app/(app)/error.tsx` — Next.js error boundary for unexpected runtime crashes
- `Sidebar` `ProjectSidebar` — shows fallback (Back + Settings + Logout) when project can't load, instead of `return null`
- `Logo.tsx` — wraps in `<Link href="/dashboard">` so clicking logo always navigates home

### Board DnD — wired to API

`useMoveTicket` is now called on drag end with snapshot rollback on failure:
1. Snapshot current columns state
2. Apply optimistic column move immediately (`setColumns`)
3. Call `moveTicket({ ticketId, status: targetCol })`
4. On error: `setColumns(prev)` + toast from hook

### Type fixes

- `Ticket.description: string | null`
- `Sprint.goal: string | null`, `Sprint.notes: string | null`
- `Project.description: string | null`, `ProjectSummary.description: string | null`

---

## Patterns locked in

See `docs/standards.md` Section 3 for full detail.

- All mutations: `isPending` disables UI + shows "…ing" label; `onSuccess` invalidates + toast; `onError` toasts
- All pages: loading skeleton → `isNotFoundError` → `PageError` → data
- Empty states: always from `MESSAGES` in `lib/messages.ts`, never hardcoded
- DnD: local snapshot + optimistic apply + API call + rollback on error

---

## Known shells (built, not yet functional — post-RBAC/backend)

| Feature | Status |
|---------|--------|
| Delete project button | Shell — needs `DELETE /projects/:id` (admin only) |
| Start/complete sprint buttons | Hooks exist (`useStartSprint`, `useCompleteSprint`), no UI trigger yet |
| Comment input on ticket detail | Shell — needs `POST /tickets/:id/comments` |
| `/settings` team members section | Hardcoded placeholder — needs `GET /team/members` |

---

## Next steps

RBAC constraints discussion → backend feature implementation.

Pending RBAC questions:
- Who can delete a project? (admin only)
- Who can start/complete a sprint? (admin + sprint_manager)
- Who can create/edit/delete tickets? (all roles, with restrictions TBD)
- Who can manage project members? (admin only)
