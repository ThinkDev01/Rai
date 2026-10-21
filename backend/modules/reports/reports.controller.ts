import type { Response } from 'express';
import logger from '../../config/logger';
import { getProjectById, getProjectByIdInternal } from '../projects/projects.service';
import { getBurndownData, getSprintReportData, getVelocityData } from './reports.model';
import type { ApiResponse, AuthenticatedRequest } from '../../types/common.types';
import { param, query as queryParam } from '../../types/common.types';

const ROUTE = {
  BURNDOWN:      '/api/v1/projects/:id/reports/burndown',
  SPRINT_REPORT: '/api/v1/projects/:id/reports/sprint-report',
  VELOCITY:      '/api/v1/projects/:id/reports/velocity',
};

async function loadProjectForCaller(req: AuthenticatedRequest, projectId: number) {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const orgScoped = await getProjectByIdInternal(org_id, projectId);
  if (!orgScoped) return { project: null as null, reason: 'not_in_org' as const };
  const accessible = await getProjectById(org_id, projectId, userId, role);
  if (!accessible) return { project: null as null, reason: 'no_access' as const };
  return { project: accessible };
}

// ── GET /projects/:id/reports/burndown?sprintId= ────────────────────────────

export async function burndownHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const sprintId  = parseInt(queryParam(req, 'sprintId'), 10);

  logger.info(
    { route: ROUTE.BURNDOWN, userId, orgId: org_id, role, projectId, sprintId },
    'Burndown report - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(sprintId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id or sprintId' } satisfies ApiResponse);
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

    const data = await getBurndownData(org_id, projectId, sprintId);

    logger.info(
      { route: ROUTE.BURNDOWN, userId, orgId: org_id, projectId, sprintId, points: data.points.length },
      'Burndown - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.BURNDOWN, userId, orgId: org_id, projectId, sprintId, error: (err as Error).message },
      'Burndown - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not build burndown' } satisfies ApiResponse);
  }
}

// ── GET /projects/:id/reports/sprint-report?sprintId= ───────────────────────

export async function sprintReportHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const sprintId  = parseInt(queryParam(req, 'sprintId'), 10);

  logger.info(
    { route: ROUTE.SPRINT_REPORT, userId, orgId: org_id, role, projectId, sprintId },
    'Sprint report - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(sprintId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id or sprintId' } satisfies ApiResponse);
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

    const data = await getSprintReportData(org_id, projectId, sprintId);
    if (!data) {
      res.status(404).json({ success: false, data: {}, error: 'Sprint not found' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ROUTE.SPRINT_REPORT, userId, orgId: org_id, projectId, sprintId, completed: data.completed.length, incomplete: data.incomplete.length },
      'Sprint report - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.SPRINT_REPORT, userId, orgId: org_id, projectId, sprintId, error: (err as Error).message },
      'Sprint report - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not build sprint report' } satisfies ApiResponse);
  }
}

// ── GET /projects/:id/reports/velocity ──────────────────────────────────────

export async function velocityHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.VELOCITY, userId, orgId: org_id, role, projectId },
    'Velocity - start',
  );

  if (Number.isNaN(projectId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
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

    const data = await getVelocityData(org_id, projectId);

    logger.info(
      { route: ROUTE.VELOCITY, userId, orgId: org_id, projectId, points: data.length },
      'Velocity - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.VELOCITY, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Velocity - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not build velocity' } satisfies ApiResponse);
  }
}
