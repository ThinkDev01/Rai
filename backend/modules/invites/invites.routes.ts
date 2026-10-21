import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  createInvite,
  listPendingInvites,
  revokeInviteHandler,
  acceptInviteHandler,
  previewInviteHandler,
} from './invites.controller';

// Two mount points - see app.ts:
//   /api/v1/orgs/:id/invites  → router exported as `orgScopedRouter`
//   /api/v1/invites           → router exported as default

const router = Router();
// Public - no auth. Lets the accept page render a "Join <org>?" card before
// the user is even signed in. Returns only the org name + role + invited email
// + lifecycle state; never leaks the token back to anyone unauthenticated.
router.get('/preview/:token',  previewInviteHandler);
router.post('/accept',         authMiddleware, acceptInviteHandler);
router.post('/:id/revoke',     authMiddleware, revokeInviteHandler);

export default router;

export const orgScopedRouter = Router({ mergeParams: true });
orgScopedRouter.post('/', authMiddleware, createInvite);
orgScopedRouter.get('/',  authMiddleware, listPendingInvites);
