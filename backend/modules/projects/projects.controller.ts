import type { Response } from 'express';
import logger from '../../config/logger';
import {
  getAllProjectSummaries,
  getProjectById,
  getProjectByIdInternal,
  getProjectMembers,
  getProjectActivity,
  createProject,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  isProjectMember,
  findOrgMemberById,
  projectKeyExists,
} from './projects.model';
import {
  buildProjectResponse,
  toProjectSummary,
} from './projects.types';
import type {
  CreateProjectBody,
  UpdateProjectBody,
  ProjectResponse,
  ProjectSummaryResponse,
} from './projects.types';
import { getSprintsForProject, toSprintResponse } from '../sprints/sprints.service';
import { getAllTicketsForProject, toTicketResponse } from '../tickets/tickets.service';
import type { TicketResponse } from '../tickets/tickets.service';
import type { ApiResponse, AuthenticatedRequest } from '../../types/common.types';
import { param } from '../../types/common.types';
import { notify, notifyMany } from '../notifications/notifications.service';
import { verifyActionOtp } from '../otp/otp.service';

const ROUTE = {
  LIST:          '/api/v1/projects',
  CREATE:        '/api/v1/projects',
  DETAIL:        '/api/v1/projects/:id',
  UPDATE:        '/api/v1/projects/:id',
  DELETE:        '/api/v1/projects/:id',
  ADD_MEMBER:    '/api/v1/projects/:id/members',
  REMOVE_MEMBER: '/api/v1/projects/:id/members/:userId',
};

// All handlers below assume the middleware chain
//   authMiddleware → requireOrgContext → (optional) requireOrgRole
// has already run, so `req.user` and `req.context` are always non-null.
// The non-null asserts read as: "the middleware contract guarantees this".

// ── Shared: build full ProjectResponse from parallel queries ────────────────
//
// Returns the v1-compatible nested shape (members + sprints[].tickets[] +
// backlog[] + activity rollup). Five queries in parallel:
//   1. members          (with caller-org role)
//   2. activity rollup  (ticket count, active sprint name, last activity)
//   3. sprints          (sorted by created_at)
//   4. all tickets      (full shape: assignee + reporter + parent_key)
//   5. (none - combined client-side)

async function assembleProjectResponse(
  orgId: string,
  project: Awaited<ReturnType<typeof getProjectByIdInternal>>,
): Promise<ProjectResponse> {
  if (!project) throw new Error('assembleProjectResponse called with null project');

  const [members, activity, sprintRows, ticketRows] = await Promise.all([
    getProjectMembers(orgId, project.id),
    getProjectActivity(orgId, project.id),
    getSprintsForProject(orgId, project.id),
    getAllTicketsForProject(orgId, project.id),
  ]);

  // Group tickets: parent_key already on the row; sub-ticket keys derived per
  // ticket by scanning the sibling list once. Same algorithm as v1's
  // buildFullProject. Comments are NOT loaded here - the project response
  // intentionally returns each ticket with `comments: []`. Per-ticket detail
  // routes load comments on demand.
  const subKeysByParentId = new Map<number, string[]>();
  for (const t of ticketRows) {
    if (t.parent_id !== null) {
      if (!subKeysByParentId.has(t.parent_id)) subKeysByParentId.set(t.parent_id, []);
      subKeysByParentId.get(t.parent_id)!.push(t.key);
    }
  }

  const shapedTickets: TicketResponse[] = ticketRows.map((t) =>
    toTicketResponse(t, subKeysByParentId.get(t.id) ?? [], []),
  );

  const bySprint = new Map<number, TicketResponse[]>();
  const backlog: TicketResponse[] = [];
  for (const t of shapedTickets) {
    if (t.sprintId === null) {
      backlog.push(t);
    } else {
      const sid = parseInt(t.sprintId, 10);
      if (!bySprint.has(sid)) bySprint.set(sid, []);
      bySprint.get(sid)!.push(t);
    }
  }

  const sprintResponses = sprintRows.map((row) => ({
    ...toSprintResponse(row),
    tickets: bySprint.get(row.id) ?? [],
  }));

  return buildProjectResponse(
    project,
    members,
    sprintResponses,
    backlog,
    activity.ticketCount,
    activity.activeSprintName,
    activity.lastActive,
  );
}

// ── GET /projects ────────────────────────────────────────────────────────────

export async function listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;

  logger.info(
    { route: ROUTE.LIST, method: 'GET', userId, orgId: org_id, role },
    'List projects - start',
  );

  try {
    const rows = await getAllProjectSummaries(org_id, userId, role);
    const data = rows.map(toProjectSummary);

    logger.info(
      { route: ROUTE.LIST, method: 'GET', userId, orgId: org_id, count: data.length },
      'List projects - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<ProjectSummaryResponse[]>);
  } catch (err) {
    logger.error(
      { route: ROUTE.LIST, method: 'GET', userId, orgId: org_id, error: (err as Error).message },
      'List projects - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load projects' } satisfies ApiResponse);
  }
}

// ── POST /projects ───────────────────────────────────────────────────────────
//
// RBAC: owner / admin / project_manager - gated by requireOrgRole in the route.
// PMs create projects per rbac.md §Project actions.

export async function createProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;

  logger.info(
    { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, role },
    'Create project - start',
  );

  const { name, key, description, visibility, avatarType, avatarValue } = (req.body ?? {}) as CreateProjectBody;
  logger.info(
    { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, body: { name, key, visibility, hasDescription: Boolean(description), avatarType, hasAvatarValue: avatarValue !== undefined } },
    'Create project - body received',
  );

  if (!name || typeof name !== 'string' || !name.trim()) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id }, 'Validation failed - name required');
    res.status(400).json({ success: false, data: {}, error: 'Project name is required' } satisfies ApiResponse);
    return;
  }
  if (!key || typeof key !== 'string' || !/^[A-Z0-9]{2,10}$/.test(key)) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, key }, 'Validation failed - key shape');
    res.status(400).json({ success: false, data: {}, error: 'Key must be 2–10 uppercase letters/numbers (e.g. RAI)' } satisfies ApiResponse);
    return;
  }
  if (!visibility || (visibility !== 'public' && visibility !== 'private')) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, visibility }, 'Validation failed - visibility');
    res.status(400).json({ success: false, data: {}, error: 'visibility must be "public" or "private"' } satisfies ApiResponse);
    return;
  }
  // Preset avatar (optional at create). Same shape rules as PATCH: the icon-id
  // allowlist lives on the frontend, so here we only enforce shape — slug-safe
  // id ≤50 chars, and 'icon' must arrive with an id (sent together by the picker).
  if (avatarType !== undefined && avatarType !== 'initials' && avatarType !== 'icon') {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id, avatarType }, 'Validation failed - avatarType');
    res.status(400).json({ success: false, data: {}, error: 'avatarType must be "initials" or "icon"' } satisfies ApiResponse);
    return;
  }
  if (avatarValue !== undefined && avatarValue !== null && (typeof avatarValue !== 'string' || !/^[a-z0-9-]{1,50}$/.test(avatarValue))) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id }, 'Validation failed - avatarValue shape');
    res.status(400).json({ success: false, data: {}, error: 'avatarValue must be a lowercase icon id (a-z, 0-9, -)' } satisfies ApiResponse);
    return;
  }
  if (avatarType === 'icon' && !avatarValue) {
    logger.warn({ route: ROUTE.CREATE, userId, orgId: org_id }, 'Validation failed - icon avatar needs a value');
    res.status(400).json({ success: false, data: {}, error: 'avatarValue is required when avatarType is "icon"' } satisfies ApiResponse);
    return;
  }

  logger.info(
    { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, key },
    'Validation passed - checking key uniqueness within org',
  );

  try {
    if (await projectKeyExists(org_id, key)) {
      logger.warn(
        { route: ROUTE.CREATE, userId, orgId: org_id, key },
        'Key conflict - already exists in this org',
      );
      res.status(409).json({ success: false, data: {}, error: `Project key "${key}" is already in use in this org` } satisfies ApiResponse);
      return;
    }

    const project = await createProject(
      org_id,
      userId,
      name.trim(),
      key,
      description?.trim() || null,
      visibility,
      avatarType === 'icon' ? 'icon' : 'initials',
      avatarType === 'icon' ? avatarValue ?? null : null,
    );

    const data = await assembleProjectResponse(org_id, project);

    logger.info(
      { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, projectId: project.id, key },
      'Create project - success',
    );
    res.status(201).json({ success: true, data, error: '' } satisfies ApiResponse<ProjectResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.CREATE, method: 'POST', userId, orgId: org_id, key, error: (err as Error).message },
      'Create project - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not create project' } satisfies ApiResponse);
  }
}

// ── GET /projects/:id ────────────────────────────────────────────────────────

export async function getProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.DETAIL, method: 'GET', userId, orgId: org_id, role, projectId },
    'Get project - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.DETAIL, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id param');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  try {
    const project = await getProjectById(org_id, projectId, userId, role);
    if (!project) {
      logger.info(
        { route: ROUTE.DETAIL, userId, orgId: org_id, projectId },
        'Project not found OR not visible to caller (single 404)',
      );
      res.status(404).json({ success: false, data: {}, error: 'Project not found' } satisfies ApiResponse);
      return;
    }

    const data = await assembleProjectResponse(org_id, project);

    logger.info(
      { route: ROUTE.DETAIL, userId, orgId: org_id, projectId, memberCount: data.memberCount, ticketCount: data.ticketCount },
      'Get project - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<ProjectResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.DETAIL, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Get project - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load project' } satisfies ApiResponse);
  }
}

// ── PATCH /projects/:id ──────────────────────────────────────────────────────

export async function updateProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.UPDATE, method: 'PATCH', userId, orgId: org_id, role, projectId },
    'Update project - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id param');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  const { name, description, visibility, archived, avatarType, avatarValue } = (req.body ?? {}) as UpdateProjectBody;
  logger.info(
    {
      route: ROUTE.UPDATE, userId, orgId: org_id, projectId,
      body: { hasName: name !== undefined, hasDescription: description !== undefined, visibility, archived, avatarType, hasAvatarValue: avatarValue !== undefined },
    },
    'Update project - body received',
  );

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Validation failed - name must be non-empty');
    res.status(400).json({ success: false, data: {}, error: 'name must be a non-empty string' } satisfies ApiResponse);
    return;
  }
  if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId, visibility }, 'Validation failed - visibility');
    res.status(400).json({ success: false, data: {}, error: 'visibility must be "public" or "private"' } satisfies ApiResponse);
    return;
  }
  if (archived !== undefined && typeof archived !== 'boolean') {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId, archived }, 'Validation failed - archived must be boolean');
    res.status(400).json({ success: false, data: {}, error: 'archived must be a boolean' } satisfies ApiResponse);
    return;
  }
  // Preset avatar. The icon id allowlist lives on the frontend (lib/projectAvatar)
  // so the gallery can grow without a backend change — here we just enforce the
  // shape: a slug-safe id ≤50 chars. 'initials' always clears the icon; 'icon'
  // always needs an id (sent together by the picker).
  if (avatarType !== undefined && avatarType !== 'initials' && avatarType !== 'icon') {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId, avatarType }, 'Validation failed - avatarType');
    res.status(400).json({ success: false, data: {}, error: 'avatarType must be "initials" or "icon"' } satisfies ApiResponse);
    return;
  }
  if (avatarValue !== undefined && avatarValue !== null && (typeof avatarValue !== 'string' || !/^[a-z0-9-]{1,50}$/.test(avatarValue))) {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Validation failed - avatarValue shape');
    res.status(400).json({ success: false, data: {}, error: 'avatarValue must be a lowercase icon id (a-z, 0-9, -)' } satisfies ApiResponse);
    return;
  }
  if (avatarType === 'icon' && !avatarValue) {
    logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Validation failed - icon avatar needs a value');
    res.status(400).json({ success: false, data: {}, error: 'avatarValue is required when avatarType is "icon"' } satisfies ApiResponse);
    return;
  }

  try {
    const existing = await getProjectByIdInternal(org_id, projectId);
    if (!existing) {
      logger.info({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Project not found in this org');
      res.status(404).json({ success: false, data: {}, error: 'Project not found' } satisfies ApiResponse);
      return;
    }

    if (existing.archived) {
      // Allow PATCH only to unarchive - every other field is frozen while archived.
      const onlyUnarchiving = archived === false
        && name === undefined && description === undefined && visibility === undefined
        && avatarType === undefined && avatarValue === undefined;
      if (!onlyUnarchiving) {
        logger.warn(
          { route: ROUTE.UPDATE, userId, orgId: org_id, projectId },
          'Archived project - only unarchive allowed',
        );
        res.status(403).json({ success: false, data: {}, error: 'Project is archived - unarchive it first to edit other fields' } satisfies ApiResponse);
        return;
      }
    }

    const normalizedDescription = description !== undefined
      ? (typeof description === 'string' ? description.trim() || null : null)
      : undefined;

    const updates: Parameters<typeof updateProject>[2] = {};
    if (name        !== undefined) updates.name        = name.trim();
    if (normalizedDescription !== undefined) updates.description = normalizedDescription;
    if (visibility  !== undefined) updates.visibility  = visibility;
    if (archived    !== undefined) updates.archived    = archived;
    if (avatarType  !== undefined) {
      updates.avatarType = avatarType;
      // 'initials' clears the icon id; 'icon' carries the picked id (validated
      // non-empty above). Always written as a pair so the two columns can't drift.
      updates.avatarValue = avatarType === 'icon' ? avatarValue! : null;
    } else if (avatarValue !== undefined) {
      // avatarValue without a type change — clear-only path (set to null).
      updates.avatarValue = avatarValue;
    }

    if (Object.keys(updates).length === 0) {
      logger.warn({ route: ROUTE.UPDATE, userId, orgId: org_id, projectId }, 'Update no-op - no fields supplied');
      res.status(400).json({ success: false, data: {}, error: 'No fields to update' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, fields: Object.keys(updates) },
      'Validation passed - writing update',
    );

    await updateProject(org_id, projectId, updates);
    const refreshed = await getProjectByIdInternal(org_id, projectId);
    const data = await assembleProjectResponse(org_id, refreshed);

    // Archive / unarchive transitions notify the project's members (in-app),
    // excluding the actor. Fire-and-forget.
    if (updates.archived === true && !existing.archived) {
      const members = await getProjectMembers(org_id, projectId);
      const recipients = members.map((m) => m.id).filter((id) => id !== userId);
      void notifyMany(recipients, {
        type: 'project_archived',
        orgId: org_id,
        link: `/projects/${projectId}/overview`,
        data: { actorName: req.user!.name || req.user!.email, projectName: existing.name },
      });
    } else if (updates.archived === false && existing.archived) {
      const members = await getProjectMembers(org_id, projectId);
      const recipients = members.map((m) => m.id).filter((id) => id !== userId);
      void notifyMany(recipients, {
        type: 'project_unarchived',
        orgId: org_id,
        link: `/projects/${projectId}/overview`,
        data: { actorName: req.user!.name || req.user!.email, projectName: existing.name },
      });
    }

    logger.info(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId },
      'Update project - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<ProjectResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.UPDATE, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Update project - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not update project' } satisfies ApiResponse);
  }
}

// ── DELETE /projects/:id ─────────────────────────────────────────────────────
// Gated by requireOrgRole('owner','admin') in the route per rbac.md note ³.

export async function deleteProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const { otpCode } = (req.body ?? {}) as { otpCode?: unknown };

  logger.info(
    { route: ROUTE.DELETE, method: 'DELETE', userId, orgId: org_id, role, projectId },
    'Delete project - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.DELETE, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id param');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  try {
    const existing = await getProjectByIdInternal(org_id, projectId);
    if (!existing) {
      logger.info({ route: ROUTE.DELETE, userId, orgId: org_id, projectId }, 'Project not found in this org');
      res.status(404).json({ success: false, data: {}, error: 'Project not found' } satisfies ApiResponse);
      return;
    }

    // OTP gate — verify the emailed code before the irreversible cascade delete.
    // Target is the project id (stringified to match the otp_challenges.target_id
    // text column the code was minted against).
    const otp = await verifyActionOtp(userId, 'delete_project', String(projectId), otpCode);
    if (!otp.ok) {
      res.status(otp.status).json({ success: false, data: {}, error: otp.error } satisfies ApiResponse);
      return;
    }

    // Capture members BEFORE the cascade delete removes them, then notify
    // (in-app + email; no link — the project is gone). Actor excluded.
    const members = await getProjectMembers(org_id, projectId);

    await deleteProject(org_id, projectId);

    const recipients = members.map((m) => m.id).filter((id) => id !== userId);
    void notifyMany(recipients, {
      type: 'project_deleted',
      orgId: org_id,
      link: null,
      data: { actorName: req.user!.name || req.user!.email, projectName: existing.name },
    });

    logger.info(
      { route: ROUTE.DELETE, userId, orgId: org_id, projectId, projectKey: existing.key },
      'Delete project - success (cascade cleaned all children)',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE.DELETE, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Delete project - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete project' } satisfies ApiResponse);
  }
}

// ── POST /projects/:id/members ───────────────────────────────────────────────

export async function addMemberHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.ADD_MEMBER, method: 'POST', userId, orgId: org_id, role, projectId },
    'Add project member - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.ADD_MEMBER, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id param');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  const { userId: rawTargetId } = (req.body ?? {}) as { userId?: string };
  if (!rawTargetId || typeof rawTargetId !== 'string') {
    logger.warn({ route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId }, 'Validation failed - userId required');
    res.status(400).json({ success: false, data: {}, error: 'userId is required' } satisfies ApiResponse);
    return;
  }

  logger.info(
    { route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId, targetUserId: rawTargetId },
    'Validation passed - verifying project + target',
  );

  try {
    const project = await getProjectByIdInternal(org_id, projectId);
    if (!project) {
      logger.info({ route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId }, 'Project not found in this org');
      res.status(404).json({ success: false, data: {}, error: 'Project not found' } satisfies ApiResponse);
      return;
    }
    if (project.archived) {
      logger.warn({ route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId }, 'Archived project - add member blocked');
      res.status(403).json({ success: false, data: {}, error: 'Cannot add members to an archived project' } satisfies ApiResponse);
      return;
    }

    const target = await findOrgMemberById(org_id, rawTargetId);
    if (!target) {
      logger.warn(
        { route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId, targetUserId: rawTargetId },
        'Target user not found in this org - refusing cross-org membership',
      );
      res.status(404).json({ success: false, data: {}, error: 'User is not a member of this organization' } satisfies ApiResponse);
      return;
    }

    if (await isProjectMember(org_id, projectId, rawTargetId)) {
      logger.info(
        { route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId, targetUserId: rawTargetId },
        'Target already a project member - 409',
      );
      res.status(409).json({ success: false, data: {}, error: 'User is already a member of this project' } satisfies ApiResponse);
      return;
    }

    await addProjectMember(org_id, projectId, rawTargetId);

    const data = await assembleProjectResponse(org_id, project);

    // Notify the added member (in-app + email), unless they added themselves.
    if (rawTargetId !== userId) {
      void notify({
        userId: rawTargetId,
        type: 'project_member_added',
        orgId: org_id,
        link: `/projects/${projectId}/overview`,
        data: { actorName: req.user!.name || req.user!.email, projectName: project.name },
      });
    }

    logger.info(
      { route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId, targetUserId: rawTargetId },
      'Add project member - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<ProjectResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.ADD_MEMBER, userId, orgId: org_id, projectId, targetUserId: rawTargetId, error: (err as Error).message },
      'Add project member - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not add member' } satisfies ApiResponse);
  }
}

// ── DELETE /projects/:id/members/:userId ─────────────────────────────────────

export async function removeMemberHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId   = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId  = parseInt(param(req, 'id'), 10);
  const targetUserId = param(req, 'userId');

  logger.info(
    { route: ROUTE.REMOVE_MEMBER, method: 'DELETE', userId, orgId: org_id, role, projectId, targetUserId },
    'Remove project member - start',
  );

  if (Number.isNaN(projectId) || !targetUserId) {
    logger.warn({ route: ROUTE.REMOVE_MEMBER, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid path params');
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  try {
    const project = await getProjectByIdInternal(org_id, projectId);
    if (!project) {
      logger.info({ route: ROUTE.REMOVE_MEMBER, userId, orgId: org_id, projectId }, 'Project not found in this org');
      res.status(404).json({ success: false, data: {}, error: 'Project not found' } satisfies ApiResponse);
      return;
    }

    const removed = await removeProjectMember(org_id, projectId, targetUserId);
    if (!removed) {
      logger.info(
        { route: ROUTE.REMOVE_MEMBER, userId, orgId: org_id, projectId, targetUserId },
        'Target was not a member - 404',
      );
      res.status(404).json({ success: false, data: {}, error: 'User is not a member of this project' } satisfies ApiResponse);
      return;
    }

    // Notify the removed member (in-app + email; no link — access may be gone),
    // unless they removed themselves.
    if (targetUserId !== userId) {
      void notify({
        userId: targetUserId,
        type: 'project_member_removed',
        orgId: org_id,
        link: null,
        data: { actorName: req.user!.name || req.user!.email, projectName: project.name },
      });
    }

    logger.info(
      { route: ROUTE.REMOVE_MEMBER, userId, orgId: org_id, projectId, targetUserId },
      'Remove project member - success',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE.REMOVE_MEMBER, userId, orgId: org_id, projectId, targetUserId, error: (err as Error).message },
      'Remove project member - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not remove member' } satisfies ApiResponse);
  }
}
