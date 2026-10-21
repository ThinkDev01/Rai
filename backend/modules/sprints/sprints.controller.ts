import type { Response } from 'express';
import logger from '../../config/logger';
import { getProjectById, getProjectByIdInternal } from '../projects/projects.service';
import {
  getSprintById,
  getActiveSprint,
  sprintNameExists,
  createSprint,
  updateSprint,
  completeSprintWithRollback,
  deleteSprintWithRollback,
} from './sprints.model';
import { toSprintResponse } from './sprints.types';
import type { CreateSprintBody, UpdateSprintBody, SprintResponse } from './sprints.types';
import type { ApiResponse, AuthenticatedRequest } from '../../types/common.types';
import { param } from '../../types/common.types';
import { getProjectMembers } from '../projects/projects.model';
import { notifyMany } from '../notifications/notifications.service';

const ROUTE = {
  CREATE: '/api/v1/projects/:id/sprints',
  UPDATE: '/api/v1/projects/:id/sprints/:sprintId',
  DELETE: '/api/v1/projects/:id/sprints/:sprintId',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify the caller can touch the project. Used by every sprint write path.
 *
 * Owner / admin: see every project in the org (bypass visibility).
 * PM:           must be a member of the project OR project is public
 *               (rbac.md PM-in / PM-on-public).
 *
 * Returns the project row when allowed. Logs WHY when denied so it's
 * obvious in support whether it was "not found in this org" vs "no access".
 */
async function loadProjectForCaller(
  req: AuthenticatedRequest,
  projectId: number,
): Promise<{ project: Awaited<ReturnType<typeof getProjectById>>; reason?: 'not_in_org' | 'no_access' }> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;

  // Existence in this org first (so we can distinguish 404 from 403).
  const orgScoped = await getProjectByIdInternal(org_id, projectId);
  if (!orgScoped) {
    logger.info(
      { userId, orgId: org_id, projectId },
      'loadProjectForCaller - project not in this org',
    );
    return { project: null, reason: 'not_in_org' };
  }

  // Access check (visibility + membership filter). Same query as GET /projects/:id.
  const accessible = await getProjectById(org_id, projectId, userId, role);
  if (!accessible) {
    logger.warn(
      { userId, orgId: org_id, projectId, role, visibility: orgScoped.visibility },
      'loadProjectForCaller - caller has no access (PM not-in-private)',
    );
    return { project: null, reason: 'no_access' };
  }

  return { project: accessible };
}

// ── POST /api/v1/projects/:id/sprints ────────────────────────────────────────

export async function createSprintHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, role, projectId },
    'Create sprint - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id param');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  const { name, startDate, endDate, goal, notes } = (req.body ?? {}) as CreateSprintBody;
  logger.info(
    { route: ROUTE.CREATE, userId, orgId: org_id, projectId, body: { name, startDate, endDate, hasGoal: Boolean(goal), hasNotes: Boolean(notes) } },
    'Create sprint - body received',
  );

  if (!name || typeof name !== 'string' || !name.trim()) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, projectId }, 'Validation failed - name required');
    res.status(400).json({ success: false, data: {}, error: 'Sprint name is required' } satisfies ApiResponse);
    return;
  }

  try {
    const { project, reason } = await loadProjectForCaller(req, projectId);
    if (!project) {
      res.status(reason === 'no_access' ? 403 : 404).json({
        success: false, data: {},
        error: reason === 'no_access' ? 'You do not have access to this project' : 'Project not found',
      } satisfies ApiResponse);
      return;
    }
    if (project.archived) {
      logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, projectId }, 'Archived project - sprint creation blocked');
      res.status(403).json({ success: false, data: {}, error: 'Cannot create sprints on an archived project' } satisfies ApiResponse);
      return;
    }

    if (await sprintNameExists(org_id, projectId, name.trim())) {
      logger.info(
        { route: ROUTE.CREATE, userId, orgId: org_id, projectId, sprintName: name.trim() },
        'Sprint name conflict - 409',
      );
      res.status(409).json({ success: false, data: {}, error: `A sprint named "${name.trim()}" already exists in this project` } satisfies ApiResponse);
      return;
    }

    const start = startDate ? new Date(startDate) : null;
    const end   = endDate   ? new Date(endDate)   : null;

    logger.info(
      { route: ROUTE.CREATE, userId, orgId: org_id, projectId, sprintName: name.trim(), start, end },
      'Validation passed - inserting sprint',
    );

    const sprint = await createSprint(
      org_id,
      projectId,
      userId,
      name.trim(),
      start,
      end,
      goal?.trim() || null,
      notes?.trim() || null,
    );

    logger.info(
      { route: ROUTE.CREATE, userId, orgId: org_id, projectId, sprintId: sprint.id },
      'Create sprint - success',
    );
    res.status(201).json({ success: true, data: toSprintResponse(sprint), error: '' } satisfies ApiResponse<SprintResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.CREATE, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Create sprint - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not create sprint' } satisfies ApiResponse);
  }
}

// ── PATCH /api/v1/projects/:id/sprints/:sprintId ─────────────────────────────

export async function updateSprintHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const sprintId  = parseInt(param(req, 'sprintId'), 10);

  logger.info(
    { route: ROUTE.UPDATE, method: 'PATCH', userId, orgId: org_id, role, projectId, sprintId },
    'Update sprint - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(sprintId)) {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, rawProjectId: param(req, 'id'), rawSprintId: param(req, 'sprintId') }, 'Invalid path params');
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  const body = (req.body ?? {}) as UpdateSprintBody;
  logger.info(
    {
      route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId,
      body: {
        hasName: body.name !== undefined,
        hasGoal: body.goal !== undefined,
        hasNotes: body.notes !== undefined,
        hasStart: body.startDate !== undefined,
        hasEnd: body.endDate !== undefined,
        status: body.status,
        archived: body.archived,
      },
    },
    'Update sprint - body received',
  );

  try {
    const { project, reason } = await loadProjectForCaller(req, projectId);
    if (!project) {
      res.status(reason === 'no_access' ? 403 : 404).json({
        success: false, data: {},
        error: reason === 'no_access' ? 'You do not have access to this project' : 'Project not found',
      } satisfies ApiResponse);
      return;
    }
    if (project.archived) {
      logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Archived project - sprint update blocked');
      res.status(403).json({ success: false, data: {}, error: 'Cannot modify sprints on an archived project' } satisfies ApiResponse);
      return;
    }

    const sprint = await getSprintById(org_id, projectId, sprintId);
    if (!sprint) {
      logger.info({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId }, 'Sprint not found in this project');
      res.status(404).json({ success: false, data: {}, error: 'Sprint not found' } satisfies ApiResponse);
      return;
    }

    // ── Status transition path (own validations + special cases) ─────────────
    if (body.status !== undefined) {
      logger.info(
        { route: ROUTE.UPDATE, userId, orgId: org_id, sprintId, currentStatus: sprint.status, requestedStatus: body.status },
        'Status transition requested',
      );

      if (body.status === 'planned') {
        logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId }, 'Reject - cannot revert sprint to planned');
        res.status(400).json({ success: false, data: {}, error: 'Cannot revert a sprint to planned' } satisfies ApiResponse);
        return;
      }
      if (sprint.status === 'completed') {
        logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId }, 'Reject - completed sprints are frozen');
        res.status(400).json({ success: false, data: {}, error: 'Cannot change the status of a completed sprint' } satisfies ApiResponse);
        return;
      }
      if (body.status === sprint.status) {
        logger.info({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId, status: body.status }, 'No-op - already at requested status');
        res.status(400).json({ success: false, data: {}, error: `Sprint is already ${sprint.status}` } satisfies ApiResponse);
        return;
      }

      if (body.status === 'active') {
        // planned → active. Must not be another active sprint in the project.
        // The partial unique index `one_active_sprint_per_project` enforces this
        // at the DB layer; app-level check gives a friendlier 409 message.
        const existingActive = await getActiveSprint(org_id, projectId);
        if (existingActive) {
          logger.info(
            { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, attemptedSprintId: sprintId, blockingSprintId: existingActive.id },
            'Reject - another sprint is already active',
          );
          res.status(409).json({
            success: false, data: {},
            error: `Another sprint is already active: "${existingActive.name}"`,
          } satisfies ApiResponse);
          return;
        }

        const updates: Parameters<typeof updateSprint>[3] = { status: 'active' };
        if (!sprint.start_date) updates.start_date = new Date();

        const updated = await updateSprint(org_id, projectId, sprintId, updates);
        logger.info(
          { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId },
          'Sprint started - planned → active',
        );
        res.status(200).json({ success: true, data: toSprintResponse(updated!), error: '' } satisfies ApiResponse<SprintResponse>);
        return;
      }

      if (body.status === 'completed') {
        // active → completed. Only valid from active per v1 behavior.
        if (sprint.status !== 'active') {
          logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId, currentStatus: sprint.status }, 'Reject - only active sprints can be completed');
          res.status(400).json({ success: false, data: {}, error: 'Only an active sprint can be completed' } satisfies ApiResponse);
          return;
        }

        const completed = await completeSprintWithRollback(org_id, projectId, sprintId);
        if (!completed) {
          logger.error({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId }, 'Complete sprint - unexpectedly missing after lookup');
          res.status(500).json({ success: false, data: {}, error: 'Could not complete sprint' } satisfies ApiResponse);
          return;
        }
        logger.info(
          { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId },
          'Sprint completed - incomplete tickets moved to backlog',
        );

        // Notify project members the sprint closed (in-app), excluding the actor.
        const completedMembers = await getProjectMembers(org_id, projectId);
        const completedRecipients = completedMembers.map((m) => m.id).filter((id) => id !== userId);
        void notifyMany(completedRecipients, {
          type: 'sprint_completed',
          orgId: org_id,
          link: `/projects/${projectId}/sprints/${sprintId}`,
          data: { actorName: req.user!.name || req.user!.email, sprintName: sprint.name },
        });

        res.status(200).json({ success: true, data: toSprintResponse(completed), error: '' } satisfies ApiResponse<SprintResponse>);
        return;
      }
    }

    // ── General field update path ────────────────────────────────────────────
    const updates: Parameters<typeof updateSprint>[3] = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId }, 'Validation failed - name must be non-empty');
        res.status(400).json({ success: false, data: {}, error: 'Sprint name cannot be empty' } satisfies ApiResponse);
        return;
      }
      const trimmedName = body.name.trim();
      // Duplicate-name check on rename. Exclude the sprint itself so
      // saving without changing the name doesn't self-conflict. Mirrors
      // the create-time check at line ~111.
      if (await sprintNameExists(org_id, projectId, trimmedName, sprintId)) {
        logger.info(
          { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId, sprintName: trimmedName },
          'Sprint name conflict on rename - 409',
        );
        res.status(409).json({ success: false, data: {}, error: `A sprint named "${trimmedName}" already exists in this project` } satisfies ApiResponse);
        return;
      }
      updates.name = trimmedName;
    }
    if (body.goal      !== undefined) updates.goal       = body.goal?.trim()  || null;
    if (body.notes     !== undefined) updates.notes      = body.notes?.trim() || null;
    if (body.startDate !== undefined) updates.start_date = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate   !== undefined) updates.end_date   = body.endDate   ? new Date(body.endDate)   : null;

    // Archive / unarchive - per rbac.md §Sprint actions (Archive sprint /
    // Unarchive sprint rows). Role gate already enforced by the route
    // (owner/admin/PM) + loadProjectForCaller (PM-in or PM-on-public).
    // Active sprints can't be archived in-place - finish them first so the
    // history is clean ('completed' → 'archived'). Unarchive is unrestricted.
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') {
        logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId }, 'Validation failed - archived must be a boolean');
        res.status(400).json({ success: false, data: {}, error: 'archived must be a boolean' } satisfies ApiResponse);
        return;
      }
      if (body.archived && sprint.status === 'active') {
        logger.warn(
          { route: ROUTE.UPDATE, userId, orgId: org_id, sprintId, status: sprint.status },
          'Reject - active sprint cannot be archived; complete it first',
        );
        res.status(400).json({
          success: false, data: {},
          error: 'Complete the sprint first - active sprints cannot be archived in-place',
        } satisfies ApiResponse);
        return;
      }
      updates.archived = body.archived;
    }

    if (Object.keys(updates).length === 0) {
      logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, sprintId }, 'No fields to update');
      res.status(400).json({ success: false, data: {}, error: 'No fields to update' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId, fields: Object.keys(updates) },
      'Validation passed - writing sprint update',
    );

    const updated = await updateSprint(org_id, projectId, sprintId, updates);

    // An archive (not unarchive / other field edits) notifies project members.
    if (updates.archived === true) {
      const archivedMembers = await getProjectMembers(org_id, projectId);
      const archivedRecipients = archivedMembers.map((m) => m.id).filter((id) => id !== userId);
      void notifyMany(archivedRecipients, {
        type: 'sprint_archived',
        orgId: org_id,
        link: `/projects/${projectId}/sprints/${sprintId}`,
        data: { actorName: req.user!.name || req.user!.email, sprintName: sprint.name },
      });
    }

    logger.info(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId },
      'Update sprint - success',
    );
    res.status(200).json({ success: true, data: toSprintResponse(updated!), error: '' } satisfies ApiResponse<SprintResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, sprintId, error: (err as Error).message },
      'Update sprint - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not update sprint' } satisfies ApiResponse);
  }
}

// ── DELETE /api/v1/projects/:id/sprints/:sprintId ────────────────────────────

export async function deleteSprintHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const sprintId  = parseInt(param(req, 'sprintId'), 10);

  logger.info(
    { route: ROUTE.DELETE, method: 'DELETE', userId, orgId: org_id, role, projectId, sprintId },
    'Delete sprint - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(sprintId)) {
    logger.warn({ route: ROUTE.DELETE, userId, orgId: org_id }, 'Invalid path params');
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  try {
    const { project, reason } = await loadProjectForCaller(req, projectId);
    if (!project) {
      res.status(reason === 'no_access' ? 403 : 404).json({
        success: false, data: {},
        error: reason === 'no_access' ? 'You do not have access to this project' : 'Project not found',
      } satisfies ApiResponse);
      return;
    }

    const sprint = await getSprintById(org_id, projectId, sprintId);
    if (!sprint) {
      logger.info({ route: ROUTE.DELETE, userId, orgId: org_id, projectId, sprintId }, 'Sprint not found');
      res.status(404).json({ success: false, data: {}, error: 'Sprint not found' } satisfies ApiResponse);
      return;
    }

    if (sprint.status !== 'planned') {
      logger.warn(
        { route: ROUTE.DELETE, userId, orgId: org_id, sprintId, status: sprint.status },
        'Reject - only planned sprints can be deleted',
      );
      res.status(400).json({ success: false, data: {}, error: 'Only planned sprints can be deleted' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ROUTE.DELETE, userId, orgId: org_id, projectId, sprintId },
      'Validation passed - deleting sprint',
    );

    await deleteSprintWithRollback(org_id, projectId, sprintId);

    logger.info(
      { route: ROUTE.DELETE, userId, orgId: org_id, projectId, sprintId },
      'Delete sprint - success',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE.DELETE, userId, orgId: org_id, projectId, sprintId, error: (err as Error).message },
      'Delete sprint - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete sprint' } satisfies ApiResponse);
  }
}
