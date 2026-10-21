import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { getUserTicketsHandler } from './users.controller';

const router = Router();

// In v2 "users" is intentionally narrow - listing org members lives under
// /api/v1/orgs/:orgId/members (orgs module owns membership), profile updates
// live under /api/v1/me, and role changes live under /api/v1/orgs/:orgId/...
//
// What stays here is the AI-agent cross-project surface: "show me every
// ticket assigned to person X in this org". Visibility-aware.
router.get('/:id/tickets', authMiddleware, requireOrgContext, getUserTicketsHandler);

export default router;
