import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import {
  listTicketsHandler,
  getTicketHandler,
  createTicketHandler,
  updateTicketHandler,
  deleteTicketHandler,
  addCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
} from './tickets.controller';

// mergeParams: true exposes `:id` (project id) from the parent router.
const router = Router({ mergeParams: true });

const reader = [authMiddleware, requireOrgContext];
const writer = [authMiddleware, requireOrgContext, requireOrgRole('owner', 'admin', 'project_manager', 'user')];
// Tickets create / update / comment are open to all org members because the
// per-project access check (PM-not-in-private, user-not-in-private) happens
// inside the handler via loadProjectForCaller. Restricting role here would
// double-gate and reject valid user-in-project actions.

// ── Tickets ──────────────────────────────────────────────────────────────────

router.get('/',         ...reader, listTicketsHandler);
router.get('/:key',     ...reader, getTicketHandler);
router.post('/',        ...writer, createTicketHandler);
router.patch('/:ticketId',  ...writer, updateTicketHandler);

// Delete is gated tighter - owner / admin / PM only (PM-in-project enforced
// inside via loadProjectForCaller). Regular users can't delete tickets even
// their own; this matches v1 rbac.md.
router.delete('/:ticketId',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
  deleteTicketHandler,
);

// ── Comments ─────────────────────────────────────────────────────────────────

router.post('/:ticketId/comments',
  ...writer,
  addCommentHandler,
);

// Edit-comment: author-only — enforced inside the handler (admins moderate by
// deleting, not rewriting). Allow all roles through middleware; the handler
// rejects non-authors.
router.patch('/:ticketId/comments/:commentId',
  ...writer,
  updateCommentHandler,
);

// Delete-comment: RBAC differentiates inside the handler. Allow all roles
// through middleware; handler decides between own-comment and elevated.
router.delete('/:ticketId/comments/:commentId',
  ...writer,
  deleteCommentHandler,
);

export default router;
