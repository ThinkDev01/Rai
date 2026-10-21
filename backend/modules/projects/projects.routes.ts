import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireOrgContext } from '../../middleware/requireOrgContext';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import {
  listProjects,
  createProjectHandler,
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  addMemberHandler,
  removeMemberHandler,
} from './projects.controller';
import sprintsRoutes from '../sprints/sprints.routes';
import ticketsRoutes from '../tickets/tickets.routes';
import reportsRoutes from '../reports/reports.routes';

const router = Router();

// Sub-router for sprint actions nested under a project. Mounted at the
// parent path `/:id/sprints` so the full path matches v1 frontend contract:
//   POST   /api/v1/projects/:id/sprints
//   PATCH  /api/v1/projects/:id/sprints/:sprintId
//   DELETE /api/v1/projects/:id/sprints/:sprintId
// Each sprint route runs its own middleware chain (auth + context + role)
// so the parent projects router stays unencumbered for its own handlers.
router.use('/:id/sprints', sprintsRoutes);

// Tickets + nested comments - same projects/:id parent path. Same middleware
// chain runs inside the sub-router so reader/writer access matches the
// rbac.md ticket + comment matrices.
router.use('/:id/tickets', ticketsRoutes);

// Reports - burndown / sprint-report / velocity at /:id/reports/*.
router.use('/:id/reports', reportsRoutes);

// Every route runs the tenant chain: authMiddleware → requireOrgContext.
// requireOrgRole gates write paths per docs/rbac.md §Project actions.

// Read (any org member can list / view subject to visibility rules in the model)
router.get('/',    authMiddleware, requireOrgContext, listProjects);
router.get('/:id', authMiddleware, requireOrgContext, getProjectHandler);

// Create - owner / admin / project_manager per rbac.md
router.post('/',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
  createProjectHandler,
);

// Update - owner / admin / project_manager (per-project membership for PM is
// enforced inside the controller via project visibility / member checks)
router.patch('/:id',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
  updateProjectHandler,
);

// Delete - owner / admin ONLY per rbac.md note ³
router.delete('/:id',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin'),
  deleteProjectHandler,
);

// Members
router.post('/:id/members',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
  addMemberHandler,
);
router.delete('/:id/members/:userId',
  authMiddleware,
  requireOrgContext,
  requireOrgRole('owner', 'admin', 'project_manager'),
  removeMemberHandler,
);

export default router;
