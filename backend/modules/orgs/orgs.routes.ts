import { Router } from 'express';
import {
  createOrg,
  updateOrg,
  listOrgMembers,
  updateMemberRoleHandler,
  removeMemberHandler,
  transferOwnershipHandler,
  leaveOrgHandler,
  deleteOrgHandler,
  restoreOrgHandler,
  listDeletedOrgsHandler,
  discoverOrgsByDomain,
} from './orgs.controller';
import { authMiddleware } from '../../middleware/authMiddleware';
import { exportOrgData } from '../export/export.controller';
import { orgScopedRouter as invitesOrgScoped } from '../invites/invites.routes';

const router = Router();

// POST   /api/v1/orgs                          - create a new organization with the caller as owner.
// GET    /api/v1/orgs/deleted                  - caller's recently-deleted orgs (owner, within recovery window).
// PATCH  /api/v1/orgs/:id                      - owner/admin: rename the org (slug locked, v2).
// GET    /api/v1/orgs/:id/members              - list all org members (any member can view).
// PATCH  /api/v1/orgs/:id/members/:userId      - owner/admin: change member's role + label.
// DELETE /api/v1/orgs/:id/members/:userId     - owner/admin: remove member from org.
// POST   /api/v1/orgs/:id/transfer-ownership   - current owner ONLY: atomic owner→admin + recipient→owner.
// POST   /api/v1/orgs/:id/restore              - owner ONLY: restore a soft-deleted org within the window.
// GET    /api/v1/orgs/:id/export?format=       - owner/admin: full org data export (json | xlsx).
// DELETE /api/v1/orgs/:id                      - owner ONLY: soft-delete (recycle bin, 30-day recovery).
// Static paths - must come before any `/:id` route or Express greedily
// matches "discover-by-domain" / "deleted" as an :id param.
router.get('/discover-by-domain',         authMiddleware, discoverOrgsByDomain);
router.get('/deleted',                    authMiddleware, listDeletedOrgsHandler);
router.post('/',                          authMiddleware, createOrg);
router.patch('/:id',                      authMiddleware, updateOrg);
router.get('/:id/members',                authMiddleware, listOrgMembers);
router.patch('/:id/members/:userId',      authMiddleware, updateMemberRoleHandler);
router.delete('/:id/members/:userId',     authMiddleware, removeMemberHandler);
router.post('/:id/transfer-ownership',    authMiddleware, transferOwnershipHandler);
router.post('/:id/leave',                 authMiddleware, leaveOrgHandler);
router.post('/:id/restore',               authMiddleware, restoreOrgHandler);
router.get('/:id/export',                 authMiddleware, exportOrgData);
router.delete('/:id',                     authMiddleware, deleteOrgHandler);

// Org-scoped invite endpoints (Q6 + RF-12):
//   POST /api/v1/orgs/:id/invites  → create invite
//   GET  /api/v1/orgs/:id/invites  → list pending invites
router.use('/:id/invites', invitesOrgScoped);

export default router;
