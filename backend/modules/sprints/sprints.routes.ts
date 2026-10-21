import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import {
  createSprintHandler,
  updateSprintHandler,
  deleteSprintHandler,
} from './sprints.controller';

// mergeParams = true so handlers can read `:id` (project id) from the parent
// projects router which mounts this sub-router at `/:id/sprints`.
const router = Router({ mergeParams: true });

// All sprint actions require an org-level role of owner / admin / PM
// per rbac.md §Sprint actions. The "PM must be member of the project OR
// project must be public" check is enforced inside each handler via
// `loadProjectForCaller` (which calls projects.service.getProjectById).
//
// Delete keeps the same role gate as create/update in v2 per rbac.md
// (deletion is restricted to planned sprints inside the handler, which is
// the effective safety net - completed/active sprints can't be deleted).

const writers = [
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
];

router.post('/',           ...writers, createSprintHandler);
router.patch('/:sprintId', ...writers, updateSprintHandler);
router.delete('/:sprintId', ...writers, deleteSprintHandler);

export default router;
