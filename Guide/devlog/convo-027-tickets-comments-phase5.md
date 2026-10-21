# convo-027 — Tickets + Comments module (Phase 5)

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Built Phase 5: Tickets + Comments. Separate module, mounted at /api/v1/projects alongside
the project router (both handle /:id/* — Express falls through naturally).

Also fixed two pre-existing bugs in useComments.ts (wrong URLs, wrong cache invalidation).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY DECISIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ticket key generation (RAI-1, RAI-2...):
  Uses PostgreSQL advisory lock per project_id (pg_advisory_xact_lock) inside a transaction.
  MAX(CAST(SPLIT_PART(key, '-', 2) AS INT)) + 1 determines next number.
  Advisory lock held only for the INSERT window, released at COMMIT.

Comments on ticket vs project endpoint:
  Project endpoint returns comments: [] for all tickets (by design, for performance).
  GET /projects/:id/tickets/:key returns real comments with author info.
  Frontend ticket page uses useTicket() for comments, useProject() for everything else.

CommentResponse added to projects.types.ts:
  TicketResponse.comments changed from literal `[]` to `CommentResponse[]`.
  tickets module imports from projects.types.ts (one-way dependency).

Single-ticket JOIN query:
  TICKET_SELECT constant includes: assignee LEFT JOIN, reporter JOIN, parent ticket LEFT JOIN.
  Parent key is fetched in the same query via self-join (not a separate query).
  Sub-ticket keys are fetched separately (getSubTicketKeys).

Dynamic PATCH for tickets:
  Same SET builder pattern as projects/sprints.
  assigneeId/sprintId accept null (clear the field) or string ID.
  Validation: sprint must belong to project; assignee must be project member.

Comment delete RBAC:
  Admin/PM: delete any comment.
  User: delete own only (user_id === req.user.id).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRONTEND BUGS FIXED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

useComments.ts:
  - URLs fixed: /tickets/:id/comments → /projects/:projectId/tickets/:ticketId/comments
  - Signature changed: now accepts ticketKey param for proper cache invalidation
  - Invalidates ['projects', projectId, 'tickets', ticketKey] (useTicket query)
  - Also invalidates projectKeys.detail for cross-view sync

Ticket detail page:
  - Added useTicket(id, key) call alongside useProject(id)
  - Comments section now uses fullTicket?.comments ?? [] instead of ticket.comments
  - useAddComment and useDeleteComment now receive ticketKey as third argument

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES CREATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
backend/modules/tickets/tickets.types.ts
backend/modules/tickets/tickets.model.ts
backend/modules/tickets/tickets.controller.ts
backend/modules/tickets/tickets.routes.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
backend/modules/projects/projects.types.ts   — added CommentResponse, updated TicketResponse.comments
backend/server.ts                            — mounted ticketRoutes at /api/v1/projects
frontend/hooks/useComments.ts                — URL fix, ticketKey param, proper invalidation
frontend/app/.../tickets/[key]/page.tsx      — useTicket for comments, ticketKey passed to hooks
docs/backend-phases.md                       — Phase 5 marked done, Phase 6 ← NEXT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: Phase 0 ✓, Phase 1 (auth) ✓, Phase 2 (users) ✓, Phase 3 (projects) ✓,
      Phase 4 (sprints) ✓, Phase 5 (tickets + comments) ✓
Next: Phase 6 — Search + My Work
