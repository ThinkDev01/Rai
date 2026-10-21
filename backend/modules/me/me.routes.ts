import { Router } from 'express';
import { getMe, patchMe, getMyTickets } from './me.controller';
import { pinProject, unpinProject, pinTicket, unpinTicket } from './pins.controller';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';

const router = Router();

// GET   /api/v1/me         - current user + org memberships (no org context required)
// PATCH /api/v1/me         - profile updates (today: name; password is Cognito-direct from frontend)
// GET   /api/v1/me/tickets - tickets assigned to me in the current org (requires org context)
router.get('/',         authMiddleware,                    getMe);
router.patch('/',       authMiddleware,                    patchMe);
router.get('/tickets',  authMiddleware, requireOrgContext, getMyTickets);

// Personal pins (My Work quick-access) - per-user, org-scoped, top 3 per type.
// Surfaced as `isPinned` on the projects list + my-work feed; these toggle it.
//   PUT/DELETE /api/v1/me/pins/projects/:id
//   PUT/DELETE /api/v1/me/pins/tickets/:id
router.put('/pins/projects/:id',    authMiddleware, requireOrgContext, pinProject);
router.delete('/pins/projects/:id', authMiddleware, requireOrgContext, unpinProject);
router.put('/pins/tickets/:id',     authMiddleware, requireOrgContext, pinTicket);
router.delete('/pins/tickets/:id',  authMiddleware, requireOrgContext, unpinTicket);

export default router;
