import type { Response } from 'express';
import logger from '../../config/logger';
import { getProjectById, getProjectByIdInternal } from '../projects/projects.service';
import { getProjectMembers } from '../projects/projects.model';
import { parseMentions, validateMentionIds } from './mentions.util';
import {
  getTicketByKey, getTicketById, getSubTicketKeys,
  getTicketIdByKey, sprintBelongsToProject, userIsProjectMember,
  createTicket, updateTicket, deleteTicket,
  getFilteredTickets, logStatusChange,
  getCommentsByTicketId, createComment, getCommentById, updateComment, deleteComment,
} from './tickets.model';
import {
  toTicketResponse, toCommentResponse,
  VALID_TYPES, VALID_STATUSES, VALID_PRIORITIES,
  EPIC_COLORS, EPIC_NAME_MAX, ENVIRONMENT_MAX, LONG_TEXT_MAX, STORY_POINTS_MAX,
} from './tickets.types';
import type {
  CreateTicketBody, UpdateTicketBody, AddCommentBody, UpdateCommentBody,
  TicketType, TicketStatus, TicketPriority,
  TicketResponse, CommentResponse,
  TicketTypeFieldsBody, TicketTypeFields,
} from './tickets.types';
import type { ApiResponse, AuthenticatedRequest } from '../../types/common.types';
import { param, query as queryParam } from '../../types/common.types';
import { notify, notifyMany } from '../notifications/notifications.service';
import { findPendingByKeys, confirmAttachments, attachmentsForEntities, attachmentsForEntity } from '../attachments/attachments.model';
import { TICKET_MAX_FILES, COMMENT_MAX_FILES, type AttachmentInput, type AttachmentResponse } from '../attachments/attachments.types';
import { presignGet, presignGetDownload, getBucket, deleteObject } from '../../config/s3';

const ROUTE = {
  LIST_TICKETS:   '/api/v1/projects/:id/tickets',
  GET_TICKET:     '/api/v1/projects/:id/tickets/:key',
  CREATE_TICKET:  '/api/v1/projects/:id/tickets',
  UPDATE_TICKET:  '/api/v1/projects/:id/tickets/:ticketId',
  DELETE_TICKET:  '/api/v1/projects/:id/tickets/:ticketId',
  ADD_COMMENT:    '/api/v1/projects/:id/tickets/:ticketId/comments',
  UPDATE_COMMENT: '/api/v1/projects/:id/tickets/:ticketId/comments/:commentId',
  DELETE_COMMENT: '/api/v1/projects/:id/tickets/:ticketId/comments/:commentId',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Best-effort sweep of attachment objects when their owning entity is deleted.
// deleteObject already swallows+logs failures, so a bad key can never abort the
// entity delete; no-ops when S3 isn't configured (e.g. local dev / tests).
async function sweepS3Objects(keys: string[]): Promise<void> {
  const bucket = getBucket();
  if (!bucket || keys.length === 0) return;
  await Promise.all(keys.map(key => deleteObject(bucket, key)));
}

// Attachments link step (scheme D). Two stages so bad input is rejected BEFORE
// the entity is created:
//   1. parseAttachments        — shape-check the client's attachment array.
//   2. validateAttachmentKeys  — ownership check against the pending rows the
//      presign endpoint inserted for THIS org+uploader, plus a metadata
//      (name/size) match. Returns the keys to confirm.
// Then, after the entity insert, confirmAttachments() flips the rows to
// 'confirmed' + attaches the entity id. The keys never change post-presign.

function parseAttachments(
  raw: unknown,
  maxFiles: number,
): { ok: true; attachments: AttachmentInput[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, message: 'attachments must be an array' };
  if (raw.length > maxFiles) return { ok: false, message: `Maximum ${maxFiles} attachments allowed` };
  for (const a of raw) {
    const entry = a as Partial<AttachmentInput> | null;
    if (!entry || typeof entry !== 'object') return { ok: false, message: 'Invalid attachment entry' };
    if (typeof entry.key !== 'string' || !entry.key) return { ok: false, message: 'Each attachment must have a key' };
    if (typeof entry.name !== 'string' || !entry.name) return { ok: false, message: 'Each attachment must have a name' };
    if (typeof entry.mimeType !== 'string') return { ok: false, message: 'Each attachment must have a mimeType' };
    if (typeof entry.size !== 'number' || !Number.isFinite(entry.size)) return { ok: false, message: 'Each attachment must have a size' };
  }
  return { ok: true, attachments: raw as AttachmentInput[] };
}

async function validateAttachmentKeys(
  orgId: string,
  uploaderId: string,
  attachments: AttachmentInput[],
): Promise<{ ok: true; keys: string[] } | { ok: false; status: number; message: string }> {
  const keys = attachments.map(a => a.key);
  const rows = await findPendingByKeys(orgId, uploaderId, keys);
  if (rows.length !== keys.length) {
    return {
      ok: false, status: 400,
      message: 'One or more attachments are invalid, already used, or not owned by you',
    };
  }
  const byKey = new Map(rows.map(r => [r.key, r]));
  for (const a of attachments) {
    const row = byKey.get(a.key)!;
    if (row.name !== a.name || row.size !== a.size) {
      return { ok: false, status: 400, message: `Attachment metadata mismatch for '${a.name}'` };
    }
  }
  return { ok: true, keys };
}

function toAttachmentResponse(row: { id: string; name: string; mime_type: string; size: number; uploader_id: string; created_at: Date | string; updated_at: string | null }, url: string, downloadUrl: string): AttachmentResponse {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    url,
    downloadUrl,
    uploaderId: row.uploader_id,
    createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    updatedAt: row.updated_at,
  };
}

/** Confirmed attachments for ONE entity, presigned for preview + download
 *  (read path). */
async function buildEntityAttachments(
  orgId: string,
  entityColumn: 'ticket_id' | 'comment_id',
  entityId: number,
): Promise<AttachmentResponse[]> {
  const rows = await attachmentsForEntities(orgId, entityColumn, [entityId]);
  if (rows.length === 0) return [];
  const bucket = getBucket();
  return Promise.all(rows.map(async (r) => toAttachmentResponse(r, await presignGet(bucket, r.key), await presignGetDownload(bucket, r.key, r.name))));
}

/** Confirmed attachments for MANY entities (the ticket's comment list),
 *  keyed by entity id — avoids an N+1 presign query per comment. */
async function buildCommentAttachmentMap(
  orgId: string,
  comments: Array<{ id: number }>,
): Promise<Map<number, AttachmentResponse[]>> {
  const map = new Map<number, AttachmentResponse[]>();
  if (comments.length === 0) return map;
  const rows = await attachmentsForEntities(orgId, 'comment_id', comments.map(c => c.id));
  if (rows.length === 0) return map;
  const bucket = getBucket();
  const grouped = new Map<number, AttachmentResponse[]>();
  for (const r of rows) {
    const list = grouped.get(r.comment_id!) ?? [];
    list.push(toAttachmentResponse(r, await presignGet(bucket, r.key), await presignGetDownload(bucket, r.key, r.name)));
    grouped.set(r.comment_id!, list);
  }
  for (const c of comments) {
    if (grouped.has(c.id)) map.set(c.id, grouped.get(c.id)!);
  }
  return map;
}

async function loadProjectForCaller(
  req: AuthenticatedRequest,
  projectId: number,
): Promise<{ project: Awaited<ReturnType<typeof getProjectById>>; reason?: 'not_in_org' | 'no_access' }> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;

  const orgScoped = await getProjectByIdInternal(org_id, projectId);
  if (!orgScoped) {
    logger.info({ userId, orgId: org_id, projectId }, 'loadProjectForCaller - project not in this org');
    return { project: null, reason: 'not_in_org' };
  }

  const accessible = await getProjectById(org_id, projectId, userId, role);
  if (!accessible) {
    logger.warn(
      { userId, orgId: org_id, projectId, role, visibility: orgScoped.visibility },
      'loadProjectForCaller - caller has no access',
    );
    return { project: null, reason: 'no_access' };
  }
  return { project: accessible };
}

async function assembleFullTicket(
  orgId: string,
  projectId: number,
  ticketId: number,
): Promise<TicketResponse | null> {
  const [ticket, subTicketKeys, comments] = await Promise.all([
    getTicketById(orgId, projectId, ticketId),
    getSubTicketKeys(orgId, ticketId),
    getCommentsByTicketId(orgId, ticketId),
  ]);
  if (!ticket) return null;
  const [attachments, commentAttachmentsByCommentId] = await Promise.all([
    buildEntityAttachments(orgId, 'ticket_id', ticketId),
    buildCommentAttachmentMap(orgId, comments),
  ]);
  return toTicketResponse(ticket, subTicketKeys, comments, attachments, commentAttachmentsByCommentId);
}

// ── GET /projects/:id/tickets ─── filtered listing (Board / AI agent) ───────

export async function listTicketsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.LIST_TICKETS, method: 'GET', userId, orgId: org_id, role, projectId },
    'List tickets - start',
  );

  if (Number.isNaN(projectId)) {
    logger.warn({ route: ROUTE.LIST_TICKETS, userId, orgId: org_id, rawId: param(req, 'id') }, 'Invalid project id');
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  const statusQ   = queryParam(req, 'status')     || undefined;
  const typeQ     = queryParam(req, 'type')       || undefined;
  const priorityQ = queryParam(req, 'priority')   || undefined;
  const assigneeQ = queryParam(req, 'assigneeId') || undefined;

  if (statusQ   && !(VALID_STATUSES   as readonly string[]).includes(statusQ)) {
    res.status(400).json({ success: false, data: {}, error: `status must be one of: ${VALID_STATUSES.join(', ')}` } satisfies ApiResponse);
    return;
  }
  if (typeQ     && !(VALID_TYPES      as readonly string[]).includes(typeQ)) {
    res.status(400).json({ success: false, data: {}, error: `type must be one of: ${VALID_TYPES.join(', ')}` } satisfies ApiResponse);
    return;
  }
  if (priorityQ && !(VALID_PRIORITIES as readonly string[]).includes(priorityQ)) {
    res.status(400).json({ success: false, data: {}, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` } satisfies ApiResponse);
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

    const filters: Parameters<typeof getFilteredTickets>[2] = {};
    if (statusQ)   filters.status     = statusQ;
    if (typeQ)     filters.type       = typeQ;
    if (priorityQ) filters.priority   = priorityQ;
    if (assigneeQ) filters.assigneeId = assigneeQ;

    logger.info(
      { route: ROUTE.LIST_TICKETS, userId, orgId: org_id, projectId, filters },
      'List tickets - querying',
    );

    const rows = await getFilteredTickets(org_id, projectId, filters);
    const data = rows.map(row => ({
      id:         String(row.id),
      key:        row.key,
      title:      row.title,
      type:       row.type,
      status:     row.status,
      priority:   row.priority,
      assigneeId: row.assignee_id ?? null,
      assignee:   row.assignee_name,
      reporterId: row.reporter_id,
      reporter:   row.reporter_name,
      sprintId:   row.sprint_id !== null ? String(row.sprint_id) : null,
      sprintName: row.sprint_name,
      createdAt:  row.created_at.toISOString(),
      updatedAt:  row.updated_at.toISOString(),
    }));

    logger.info(
      { route: ROUTE.LIST_TICKETS, userId, orgId: org_id, projectId, count: data.length },
      'List tickets - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.LIST_TICKETS, userId, orgId: org_id, projectId, error: (err as Error).message },
      'List tickets - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load tickets' } satisfies ApiResponse);
  }
}

// ── GET /projects/:id/tickets/:key ───────────────────────────────────────────

export async function getTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const key       = param(req, 'key');

  logger.info(
    { route: ROUTE.GET_TICKET, method: 'GET', userId, orgId: org_id, role, projectId, key },
    'Get ticket by key - start',
  );

  if (Number.isNaN(projectId) || !key) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id or ticket key' } satisfies ApiResponse);
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

    const ticketRow = await getTicketByKey(org_id, projectId, key);
    if (!ticketRow) {
      logger.info({ route: ROUTE.GET_TICKET, userId, orgId: org_id, projectId, key }, 'Ticket not found');
      res.status(404).json({ success: false, data: {}, error: `Ticket ${key} not found` } satisfies ApiResponse);
      return;
    }

    const [subTicketKeys, comments] = await Promise.all([
      getSubTicketKeys(org_id, ticketRow.id),
      getCommentsByTicketId(org_id, ticketRow.id),
    ]);

    const [attachments, commentAttachmentsByCommentId] = await Promise.all([
      buildEntityAttachments(org_id, 'ticket_id', ticketRow.id),
      buildCommentAttachmentMap(org_id, comments),
    ]);

    logger.info(
      { route: ROUTE.GET_TICKET, userId, orgId: org_id, projectId, ticketId: ticketRow.id, key },
      'Get ticket - success',
    );
    res.status(200).json({
      success: true,
      data: toTicketResponse(ticketRow, subTicketKeys, comments, attachments, commentAttachmentsByCommentId),
      error: '',
    } satisfies ApiResponse<TicketResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.GET_TICKET, userId, orgId: org_id, projectId, key, error: (err as Error).message },
      'Get ticket - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load ticket' } satisfies ApiResponse);
  }
}

// ── POST /projects/:id/tickets ───────────────────────────────────────────────

// ── Type-specific fields (Jira parity) ───────────────────────────────────────
//
// Which DB columns each ticket type owns. Hard-coded mapping (no admin screen
// config in v2 - see upgrades.md § Type-specific ticket fields). Fields sent for
// a type that doesn't own them are ignored, so a stale value can't sneak in.
const TYPE_FIELD_COLUMNS: Record<TicketType, (keyof TicketTypeFields)[]> = {
  task:  [],
  bug:   ['steps_to_reproduce', 'environment'],
  story: ['story_points', 'acceptance_criteria'],
  epic:  ['epic_name', 'epic_color'],
};

/**
 * Validate + normalize the type-specific fields from a create/update body,
 * keeping only the ones the effective type owns. Returns snake-cased columns
 * ready for the model. `null` clears a field; trimmed-empty strings become null.
 */
function buildTypeFields(
  body: TicketTypeFieldsBody,
  effectiveType: TicketType,
): { ok: true; fields: TicketTypeFields } | { ok: false; error: string } {
  const allowed = new Set<keyof TicketTypeFields>(TYPE_FIELD_COLUMNS[effectiveType]);
  const fields: TicketTypeFields = {};

  const normText = (v: unknown, max: number, label: string): string | null | { error: string } => {
    if (v === null) return null;
    if (typeof v !== 'string') return { error: `${label} must be a string` };
    const t = v.trim();
    if (t.length > max) return { error: `${label} must be at most ${max} characters` };
    return t || null;
  };

  if (body.epicName !== undefined && allowed.has('epic_name')) {
    const r = normText(body.epicName, EPIC_NAME_MAX, 'epicName');
    if (r && typeof r === 'object') return { ok: false, error: r.error };
    fields.epic_name = r;
  }
  if (body.epicColor !== undefined && allowed.has('epic_color')) {
    if (body.epicColor === null) fields.epic_color = null;
    else if (typeof body.epicColor !== 'string' || !(EPIC_COLORS as readonly string[]).includes(body.epicColor)) {
      return { ok: false, error: `epicColor must be one of: ${EPIC_COLORS.join(', ')}` };
    } else fields.epic_color = body.epicColor;
  }
  if (body.storyPoints !== undefined && allowed.has('story_points')) {
    if (body.storyPoints === null) fields.story_points = null;
    else if (typeof body.storyPoints !== 'number' || !Number.isInteger(body.storyPoints) || body.storyPoints < 0 || body.storyPoints > STORY_POINTS_MAX) {
      return { ok: false, error: `storyPoints must be an integer between 0 and ${STORY_POINTS_MAX}` };
    } else fields.story_points = body.storyPoints;
  }
  if (body.acceptanceCriteria !== undefined && allowed.has('acceptance_criteria')) {
    const r = normText(body.acceptanceCriteria, LONG_TEXT_MAX, 'acceptanceCriteria');
    if (r && typeof r === 'object') return { ok: false, error: r.error };
    fields.acceptance_criteria = r;
  }
  if (body.stepsToReproduce !== undefined && allowed.has('steps_to_reproduce')) {
    const r = normText(body.stepsToReproduce, LONG_TEXT_MAX, 'stepsToReproduce');
    if (r && typeof r === 'object') return { ok: false, error: r.error };
    fields.steps_to_reproduce = r;
  }
  if (body.environment !== undefined && allowed.has('environment')) {
    const r = normText(body.environment, ENVIRONMENT_MAX, 'environment');
    if (r && typeof r === 'object') return { ok: false, error: r.error };
    fields.environment = r;
  }

  return { ok: true, fields };
}

export async function createTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);

  logger.info(
    { route: ROUTE.CREATE_TICKET, method: 'POST', userId, orgId: org_id, role, projectId },
    'Create ticket - start',
  );

  if (Number.isNaN(projectId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid project id' } satisfies ApiResponse);
    return;
  }

  const { title, type, priority, status, description, assigneeId, sprintId, parentKey, attachments: rawAttachments } = (req.body ?? {}) as CreateTicketBody;
  logger.info(
    { route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, body: { title, type, priority, status, assigneeId, sprintId, parentKey } },
    'Create ticket - body received',
  );

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ success: false, data: {}, error: 'Title is required' } satisfies ApiResponse);
    return;
  }
  // Min 2 chars enforced for parity with the search endpoint which rejects
  // queries < 2 chars (`search.controller.ts`). Without this, a caller can
  // create a 1-letter ticket they can't subsequently search for. Trimmed
  // length so " a " (effectively single-letter) is also rejected.
  if (title.trim().length < 2) {
    res.status(400).json({ success: false, data: {}, error: 'Title must be at least 2 characters' } satisfies ApiResponse);
    return;
  }
  if (!type     || !(VALID_TYPES      as readonly string[]).includes(type)) {
    res.status(400).json({ success: false, data: {}, error: `type must be one of: ${VALID_TYPES.join(', ')}` } satisfies ApiResponse);
    return;
  }
  if (!priority || !(VALID_PRIORITIES as readonly string[]).includes(priority)) {
    res.status(400).json({ success: false, data: {}, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` } satisfies ApiResponse);
    return;
  }
  if (status !== undefined && !(VALID_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ success: false, data: {}, error: `status must be one of: ${VALID_STATUSES.join(', ')}` } satisfies ApiResponse);
    return;
  }

  // Type-specific fields (Epic/Story/Bug). Validated + filtered to the fields
  // this type owns; anything irrelevant to the type is dropped.
  const typeFieldsResult = buildTypeFields(req.body as TicketTypeFieldsBody, type as TicketType);
  if (!typeFieldsResult.ok) {
    res.status(400).json({ success: false, data: {}, error: typeFieldsResult.error } satisfies ApiResponse);
    return;
  }

  const parsedAttachments = parseAttachments(rawAttachments, TICKET_MAX_FILES);
  if (!parsedAttachments.ok) {
    res.status(400).json({ success: false, data: {}, error: parsedAttachments.message } satisfies ApiResponse);
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
      res.status(403).json({ success: false, data: {}, error: 'Cannot add tickets to an archived project' } satisfies ApiResponse);
      return;
    }

    // Resolve optional FKs - every check is org-scoped via the model layer.
    let resolvedAssigneeId: string | null = null;
    if (assigneeId) {
      const isMember = await userIsProjectMember(projectId, assigneeId);
      if (!isMember) {
        logger.warn({ route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, assigneeId }, 'Assignee not a project member');
        res.status(400).json({ success: false, data: {}, error: 'Assignee is not a member of this project' } satisfies ApiResponse);
        return;
      }
      resolvedAssigneeId = assigneeId;
    }

    let resolvedSprintId: number | null = null;
    if (sprintId) {
      const sid = parseInt(String(sprintId), 10);
      if (Number.isNaN(sid)) {
        res.status(400).json({ success: false, data: {}, error: 'Invalid sprintId' } satisfies ApiResponse);
        return;
      }
      const belongs = await sprintBelongsToProject(org_id, projectId, sid);
      if (!belongs) {
        logger.warn({ route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, sprintId: sid }, 'Sprint does not belong to project');
        res.status(400).json({ success: false, data: {}, error: 'Sprint does not belong to this project' } satisfies ApiResponse);
        return;
      }
      resolvedSprintId = sid;
    }

    let resolvedParentId: number | null = null;
    if (parentKey) {
      const pid = await getTicketIdByKey(org_id, projectId, String(parentKey));
      if (pid === null) {
        res.status(400).json({ success: false, data: {}, error: `Parent ticket "${parentKey}" not found in this project` } satisfies ApiResponse);
        return;
      }
      resolvedParentId = pid;
    }

    const initialStatus: TicketStatus = status ?? 'todo';

    // Attachment link validation BEFORE creating anything — a 400 here must not
    // leave a half-created ticket behind.
    let attachmentKeys: string[] = [];
    if (parsedAttachments.attachments.length > 0) {
      const linkCheck = await validateAttachmentKeys(org_id, userId, parsedAttachments.attachments);
      if (!linkCheck.ok) {
        res.status(linkCheck.status).json({ success: false, data: {}, error: linkCheck.message } satisfies ApiResponse);
        return;
      }
      attachmentKeys = linkCheck.keys;
    }

    logger.info(
      { route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, resolvedAssigneeId, resolvedSprintId, resolvedParentId, initialStatus },
      'Validation passed - creating ticket',
    );

    const ticket = await createTicket(
      org_id,
      projectId,
      project.key,
      userId,
      title.trim(),
      type as TicketType,
      priority as TicketPriority,
      initialStatus,
      description?.trim() || null,
      resolvedAssigneeId,
      resolvedSprintId,
      resolvedParentId,
      typeFieldsResult.fields,
    );

    await logStatusChange(org_id, ticket.id, resolvedSprintId, null, initialStatus, userId);

    if (attachmentKeys.length > 0) {
      const confirmed = await confirmAttachments(org_id, userId, 'ticket_id', ticket.id, attachmentKeys);
      if (confirmed !== attachmentKeys.length) {
        logger.warn(
          { route: ROUTE.CREATE_TICKET, orgId: org_id, ticketId: ticket.id, expected: attachmentKeys.length, confirmed },
          'Attachment confirm count mismatch',
        );
      }
    }

    const data = await assembleFullTicket(org_id, projectId, ticket.id);

    // Notify the assignee (unless they assigned it to themselves). Fire-and-forget:
    // notify() is bulletproof (never throws) so it can't affect the response.
    if (resolvedAssigneeId && resolvedAssigneeId !== userId) {
      void notify({
        userId: resolvedAssigneeId,
        type: 'ticket_assigned',
        orgId: org_id,
        link: `/projects/${projectId}/tickets/${ticket.key}`,
        data: { assignerName: req.user!.name || req.user!.email, ticketKey: ticket.key, ticketTitle: title.trim() },
      });
    }

    logger.info(
      { route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, ticketId: ticket.id, key: ticket.key },
      'Create ticket - success',
    );
    res.status(201).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.CREATE_TICKET, userId, orgId: org_id, projectId, error: (err as Error).message },
      'Create ticket - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not create ticket' } satisfies ApiResponse);
  }
}

// ── PATCH /projects/:id/tickets/:ticketId ────────────────────────────────────

export async function updateTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const ticketId  = parseInt(param(req, 'ticketId'), 10);

  logger.info(
    { route: ROUTE.UPDATE_TICKET, method: 'PATCH', userId, orgId: org_id, role, projectId, ticketId },
    'Update ticket - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(ticketId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  const body = (req.body ?? {}) as UpdateTicketBody;
  logger.info(
    { route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, projectId, ticketId, body },
    'Update ticket - body received',
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
      res.status(403).json({ success: false, data: {}, error: 'Cannot modify tickets in an archived project' } satisfies ApiResponse);
      return;
    }

    const existing = await getTicketById(org_id, projectId, ticketId);
    if (!existing) {
      res.status(404).json({ success: false, data: {}, error: 'Ticket not found' } satisfies ApiResponse);
      return;
    }

    if (body.type     !== undefined && !(VALID_TYPES      as readonly string[]).includes(body.type)) {
      res.status(400).json({ success: false, data: {}, error: `type must be one of: ${VALID_TYPES.join(', ')}` } satisfies ApiResponse);
      return;
    }
    if (body.priority !== undefined && !(VALID_PRIORITIES as readonly string[]).includes(body.priority)) {
      res.status(400).json({ success: false, data: {}, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` } satisfies ApiResponse);
      return;
    }
    if (body.status   !== undefined && !(VALID_STATUSES   as readonly string[]).includes(body.status)) {
      res.status(400).json({ success: false, data: {}, error: `status must be one of: ${VALID_STATUSES.join(', ')}` } satisfies ApiResponse);
      return;
    }
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
      res.status(400).json({ success: false, data: {}, error: 'Title cannot be empty' } satisfies ApiResponse);
      return;
    }
    // Same 2-char floor as createTicketHandler so renames can't drop a
    // ticket below the searchable minimum.
    if (typeof body.title === 'string' && body.title.trim().length < 2) {
      res.status(400).json({ success: false, data: {}, error: 'Title must be at least 2 characters' } satisfies ApiResponse);
      return;
    }

    const updates: Parameters<typeof updateTicket>[3] = {};

    if (body.title       !== undefined) updates.title       = body.title.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.type        !== undefined) updates.type        = body.type;
    if (body.priority    !== undefined) updates.priority    = body.priority;
    if (body.status      !== undefined) updates.status      = body.status;

    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null) {
        updates.assignee_id = null;
      } else {
        const isMember = await userIsProjectMember(projectId, body.assigneeId);
        if (!isMember) {
          logger.warn({ route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, projectId, ticketId, assigneeId: body.assigneeId }, 'Assignee not a project member');
          res.status(400).json({ success: false, data: {}, error: 'Assignee is not a member of this project' } satisfies ApiResponse);
          return;
        }
        updates.assignee_id = body.assigneeId;
      }
    }

    if (body.sprintId !== undefined) {
      if (body.sprintId === null) {
        updates.sprint_id = null;
      } else {
        const sid = parseInt(String(body.sprintId), 10);
        if (Number.isNaN(sid)) {
          res.status(400).json({ success: false, data: {}, error: 'Invalid sprintId' } satisfies ApiResponse);
          return;
        }
        const belongs = await sprintBelongsToProject(org_id, projectId, sid);
        if (!belongs) {
          res.status(400).json({ success: false, data: {}, error: 'Sprint does not belong to this project' } satisfies ApiResponse);
          return;
        }
        updates.sprint_id = sid;
      }
    }

    // Parent reassignment - human key in, FK id out. Self-reference is
    // rejected; cycle detection (parent's parent leads back to self)
    // deferred to v3 per upgrades.md.
    if (body.parentKey !== undefined) {
      if (body.parentKey === null || body.parentKey === '') {
        updates.parent_id = null;
      } else {
        const pid = await getTicketIdByKey(org_id, projectId, String(body.parentKey));
        if (pid === null) {
          res.status(400).json({ success: false, data: {}, error: `Parent ticket "${body.parentKey}" not found in this project` } satisfies ApiResponse);
          return;
        }
        if (pid === ticketId) {
          res.status(400).json({ success: false, data: {}, error: 'A ticket cannot be its own parent' } satisfies ApiResponse);
          return;
        }
        updates.parent_id = pid;
      }
    }

    // Type-specific fields. Effective type = the new type if it's changing,
    // else the existing one - so e.g. setting storyPoints in the same request
    // that flips type→story is honored.
    const effectiveType = (body.type ?? existing.type) as TicketType;
    const typeFieldsResult = buildTypeFields(body, effectiveType);
    if (!typeFieldsResult.ok) {
      res.status(400).json({ success: false, data: {}, error: typeFieldsResult.error } satisfies ApiResponse);
      return;
    }
    Object.assign(updates, typeFieldsResult.fields);

    // On a type change, null out the previous type's columns that the new type
    // doesn't own - so stale Epic/Story/Bug data doesn't linger (and can't
    // resurface if the ticket is later flipped back).
    if (body.type !== undefined && body.type !== existing.type) {
      const newOwned = new Set<keyof TicketTypeFields>(TYPE_FIELD_COLUMNS[body.type as TicketType]);
      for (const col of TYPE_FIELD_COLUMNS[existing.type]) {
        if (!newOwned.has(col)) updates[col] = null;
      }
    }

    const parsedAttachments = parseAttachments((body as { attachments?: unknown }).attachments, TICKET_MAX_FILES);
    if (!parsedAttachments.ok) {
      res.status(400).json({ success: false, data: {}, error: parsedAttachments.message } satisfies ApiResponse);
      return;
    }

    if (Object.keys(updates).length === 0 && parsedAttachments.attachments.length === 0) {
      res.status(400).json({ success: false, data: {}, error: 'No fields to update' } satisfies ApiResponse);
      return;
    }
    // Attachment link validation BEFORE writing anything — a 400 here must not
    // leave a half-applied update behind. Only pending keys owned by this
    // org+uploader (with matching metadata) pass; they're confirmed below.
    let attachmentKeys: string[] = [];
    if (parsedAttachments.attachments.length > 0) {
      const linkCheck = await validateAttachmentKeys(org_id, userId, parsedAttachments.attachments);
      if (!linkCheck.ok) {
        res.status(linkCheck.status).json({ success: false, data: {}, error: linkCheck.message } satisfies ApiResponse);
        return;
      }
      attachmentKeys = linkCheck.keys;
    }

    logger.info(
      { route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, projectId, ticketId, fields: Object.keys(updates) },
      'Validation passed - writing update',
    );

    const updated = Object.keys(updates).length > 0
      ? await updateTicket(org_id, projectId, ticketId, updates)
      : existing;
    if (!updated) {
      res.status(404).json({ success: false, data: {}, error: 'Ticket not found' } satisfies ApiResponse);
      return;
    }

    if (attachmentKeys.length > 0) {
      const confirmed = await confirmAttachments(org_id, userId, 'ticket_id', ticketId, attachmentKeys);
      if (confirmed !== attachmentKeys.length) {
        logger.warn(
          { route: ROUTE.UPDATE_TICKET, orgId: org_id, ticketId, expected: attachmentKeys.length, confirmed },
          'Attachment confirm count mismatch',
        );
      }
    }

    if (body.status !== undefined && body.status !== existing.status) {
      await logStatusChange(org_id, ticketId, updated.sprint_id, existing.status, body.status, userId);
      logger.info(
        { route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, ticketId, from: existing.status, to: body.status },
        'Status change recorded in history',
      );
    }

    const data = await assembleFullTicket(org_id, projectId, ticketId);

    // Notifications (fire-and-forget). Actor never notifies themselves.
    const actorName = req.user!.name || req.user!.email;
    const ticketLink = `/projects/${projectId}/tickets/${existing.key}`;
    const newTitle = updates.title ?? existing.title;

    // New assignee (re-)assigned to someone else.
    if (updates.assignee_id && updates.assignee_id !== existing.assignee_id && updates.assignee_id !== userId) {
      void notify({
        userId: updates.assignee_id,
        type: 'ticket_assigned',
        orgId: org_id,
        link: ticketLink,
        data: { assignerName: actorName, ticketKey: existing.key, ticketTitle: newTitle },
      });
    }

    // Status change → the ticket's reporter + current assignee (in-app only).
    if (body.status !== undefined && body.status !== existing.status) {
      const currentAssignee = updates.assignee_id !== undefined ? updates.assignee_id : existing.assignee_id;
      const recipients = [existing.reporter_id, currentAssignee].filter(
        (id): id is string => Boolean(id) && id !== userId,
      );
      void notifyMany(recipients, {
        type: 'ticket_status_changed',
        orgId: org_id,
        link: ticketLink,
        data: { actorName, ticketKey: existing.key, ticketTitle: newTitle, newStatus: body.status },
      });
    }

    logger.info(
      { route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, projectId, ticketId },
      'Update ticket - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.UPDATE_TICKET, userId, orgId: org_id, projectId, ticketId, error: (err as Error).message },
      'Update ticket - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not update ticket' } satisfies ApiResponse);
  }
}

// ── DELETE /projects/:id/tickets/:ticketId ──────────────────────────────────

export async function deleteTicketHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const ticketId  = parseInt(param(req, 'ticketId'), 10);

  logger.info(
    { route: ROUTE.DELETE_TICKET, method: 'DELETE', userId, orgId: org_id, role, projectId, ticketId },
    'Delete ticket - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(ticketId)) {
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

    const existing = await getTicketById(org_id, projectId, ticketId);
    if (!existing) {
      res.status(404).json({ success: false, data: {}, error: 'Ticket not found' } satisfies ApiResponse);
      return;
    }

    const { keys: deletedKeys } = await deleteTicket(org_id, projectId, ticketId);
    await sweepS3Objects(deletedKeys);

    // Notify the ticket's reporter + assignee that it was removed (in-app only;
    // no link — the ticket is gone). Actor excluded.
    const deleteRecipients = [existing.reporter_id, existing.assignee_id].filter(
      (id): id is string => Boolean(id) && id !== userId,
    );
    void notifyMany(deleteRecipients, {
      type: 'ticket_deleted',
      orgId: org_id,
      link: null,
      data: { actorName: req.user!.name || req.user!.email, ticketKey: existing.key, ticketTitle: existing.title },
    });

    logger.info(
      { route: ROUTE.DELETE_TICKET, userId, orgId: org_id, projectId, ticketId, key: existing.key },
      'Delete ticket - success (cascade cleaned comments + history)',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE.DELETE_TICKET, userId, orgId: org_id, projectId, ticketId, error: (err as Error).message },
      'Delete ticket - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete ticket' } satisfies ApiResponse);
  }
}

// ── POST /projects/:id/tickets/:ticketId/comments ───────────────────────────

export async function addCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const ticketId  = parseInt(param(req, 'ticketId'), 10);

  logger.info(
    { route: ROUTE.ADD_COMMENT, method: 'POST', userId, orgId: org_id, role, projectId, ticketId },
    'Add comment - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(ticketId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  const { content, parentCommentId: rawParentCommentId, mentions: rawMentions, attachments: rawAttachments } = (req.body ?? {}) as AddCommentBody;

  // Attachment shape is validated before the content check so an
  // attachment-only comment (no text) is legal. Content is still required
  // when the comment carries no files.
  const parsedAttachments = parseAttachments(rawAttachments, COMMENT_MAX_FILES);
  if (!parsedAttachments.ok) {
    res.status(400).json({ success: false, data: {}, error: parsedAttachments.message } satisfies ApiResponse);
    return;
  }

  const trimmedContent = !content || typeof content !== 'string' ? '' : content.trim();
  if (!trimmedContent && parsedAttachments.attachments.length === 0) {
    res.status(400).json({ success: false, data: {}, error: 'Comment content is required' } satisfies ApiResponse);
    return;
  }

  // Parse the optional parent reference. Empty string / null / undefined all
  // mean "this is a root comment" — keeps the API forgiving to clients that
  // accidentally serialize an empty draft field.
  let parsedParentId: number | null = null;
  if (rawParentCommentId !== undefined && rawParentCommentId !== null && rawParentCommentId !== '') {
    if (typeof rawParentCommentId !== 'string') {
      res.status(400).json({ success: false, data: {}, error: 'parentCommentId must be a string when provided' } satisfies ApiResponse);
      return;
    }
    const n = parseInt(rawParentCommentId, 10);
    if (Number.isNaN(n)) {
      res.status(400).json({ success: false, data: {}, error: 'parentCommentId must be a numeric string' } satisfies ApiResponse);
      return;
    }
    parsedParentId = n;
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
      res.status(403).json({ success: false, data: {}, error: 'Cannot comment on tickets in an archived project' } satisfies ApiResponse);
      return;
    }

    const ticket = await getTicketById(org_id, projectId, ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, data: {}, error: 'Ticket not found' } satisfies ApiResponse);
      return;
    }

    // Reply target validation. Three rules enforce single-level depth:
    //   1. Target must exist on this ticket (cross-ticket replies meaningless)
    //   2. Target must be in the same org (defensive — should be implied by #1)
    //   3. Target must itself be a root (parent_comment_id IS NULL). No
    //      replies-of-replies — they'd balloon the visual tree.
    // Failing any of these is a 400 with a precise message so the UI can
    // recover (fall back to root-comment behavior, surface to user, etc.).
    if (parsedParentId !== null) {
      const parent = await getCommentById(org_id, ticketId, parsedParentId);
      if (!parent) {
        logger.warn(
          { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, ticketId, parentCommentId: parsedParentId },
          'Reply target not found on this ticket',
        );
        res.status(400).json({ success: false, data: {}, error: 'Reply target comment not found on this ticket' } satisfies ApiResponse);
        return;
      }
      if (parent.parent_comment_id !== null) {
        logger.warn(
          { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, ticketId, parentCommentId: parsedParentId, grandparentId: parent.parent_comment_id },
          'Reply target is itself a reply - rejecting (single-level threading)',
        );
        res.status(400).json({ success: false, data: {}, error: 'Cannot reply to a reply — pick the original comment in the thread' } satisfies ApiResponse);
        return;
      }
      if (parent.deleted_at !== null) {
        logger.warn(
          { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, ticketId, parentCommentId: parsedParentId },
          'Reply target is soft-deleted - rejecting',
        );
        res.status(400).json({ success: false, data: {}, error: 'Cannot reply to a deleted comment' } satisfies ApiResponse);
        return;
      }
    }

    logger.info(
      { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, projectId, ticketId, contentLength: trimmedContent.length, parentCommentId: parsedParentId },
      'Validation passed - inserting comment',
    );

    // Attachment link validation BEFORE inserting anything.
    let attachmentKeys: string[] = [];
    if (parsedAttachments.attachments.length > 0) {
      const linkCheck = await validateAttachmentKeys(org_id, userId, parsedAttachments.attachments);
      if (!linkCheck.ok) {
        res.status(linkCheck.status).json({ success: false, data: {}, error: linkCheck.message } satisfies ApiResponse);
        return;
      }
      attachmentKeys = linkCheck.keys;
    }

    const comment = await createComment(org_id, ticketId, userId, trimmedContent, parsedParentId);

    if (attachmentKeys.length > 0) {
      const confirmed = await confirmAttachments(org_id, userId, 'comment_id', comment.id, attachmentKeys);
      if (confirmed !== attachmentKeys.length) {
        logger.warn(
          { route: ROUTE.ADD_COMMENT, orgId: org_id, commentId: comment.id, expected: attachmentKeys.length, confirmed },
          'Attachment confirm count mismatch',
        );
      }
    }

    // Notify on the new comment (in-app + email), excluding the commenter:
    //   • @mentioned project members → mention notification (the stronger signal)
    //   • the ticket's reporter + assignee → plain new-comment notification
    // A user who is BOTH mentioned and reporter/assignee gets only the mention
    // (mention wins) — so we subtract mentionIds from the comment recipients.
    const commenterName = req.user!.name || req.user!.email;
    const commentLink = `/projects/${projectId}/tickets/${ticket.key}`;

    // Mention recipients = the ids the author explicitly selected from the
    // @-dropdown, validated against project membership. Only fetch the member
    // list when the payload actually carries mentions (most comments don't).
    let mentionIds: string[] = [];
    if (Array.isArray(rawMentions) && rawMentions.length > 0) {
      const members = await getProjectMembers(org_id, projectId);
      mentionIds = validateMentionIds(rawMentions, new Set(members.map((m) => m.id)), userId);
    }
    const mentionSet = new Set(mentionIds);

    const commentRecipients = [ticket.reporter_id, ticket.assignee_id].filter(
      (id): id is string => Boolean(id) && id !== userId && !mentionSet.has(id as string),
    );

    if (mentionIds.length > 0) {
      logger.info(
        { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, ticketId, mentionedCount: mentionIds.length },
        'Comment mentions project members - dispatching mention notifications',
      );
      void notifyMany(mentionIds, {
        type: 'ticket_comment_mention',
        orgId: org_id,
        link: commentLink,
        data: { commenterName, ticketTitle: ticket.title },
      });
    }

    void notifyMany(commentRecipients, {
      type: 'ticket_comment_new',
      orgId: org_id,
      link: commentLink,
      data: { commenterName, ticketTitle: ticket.title },
    });

    logger.info(
      { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId: comment.id },
      'Add comment - success',
    );
    const commentAttachments = await buildEntityAttachments(org_id, 'comment_id', comment.id);
    res.status(201).json({
      success: true,
      data: toCommentResponse(comment, commentAttachments),
      error: '',
    } satisfies ApiResponse<CommentResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.ADD_COMMENT, userId, orgId: org_id, projectId, ticketId, error: (err as Error).message },
      'Add comment - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not add comment' } satisfies ApiResponse);
  }
}

// ── PATCH /projects/:id/tickets/:ticketId/comments/:commentId ───────────────
//
// RBAC: **author-only.** Unlike delete (which admins / reporter / assignee can
// also perform for moderation), editing rewrites someone's words — only the
// person who wrote the comment may do it. Org admins moderate by deleting, not
// by silently rewriting. Content-only: threading and authorship are immutable.

export async function updateCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const ticketId  = parseInt(param(req, 'ticketId'), 10);
  const commentId = parseInt(param(req, 'commentId'), 10);

  logger.info(
    { route: ROUTE.UPDATE_COMMENT, method: 'PATCH', userId, orgId: org_id, role, projectId, ticketId, commentId },
    'Update comment - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(ticketId) || Number.isNaN(commentId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  const { content, mentions: rawMentions } = (req.body ?? {}) as UpdateCommentBody;

  // Attachments added while editing — parsed up front so a malformed array
  // 400s before anything is written. Validated for ownership + confirmed
  // after the content update (mirrors addCommentHandler). Content may be
  // empty when the edit keeps/adds at least one attachment.
  const parsedAttachments = parseAttachments((req.body as { attachments?: unknown }).attachments, COMMENT_MAX_FILES);
  if (!parsedAttachments.ok) {
    res.status(400).json({ success: false, data: {}, error: parsedAttachments.message } satisfies ApiResponse);
    return;
  }

  try {
    // Project existence + caller access (covers cross-org and PM-not-in).
    const { project, reason } = await loadProjectForCaller(req, projectId);
    if (!project) {
      res.status(reason === 'no_access' ? 403 : 404).json({
        success: false, data: {},
        error: reason === 'no_access' ? 'You do not have access to this project' : 'Project not found',
      } satisfies ApiResponse);
      return;
    }
    if (project.archived) {
      res.status(403).json({ success: false, data: {}, error: 'Cannot edit comments in an archived project' } satisfies ApiResponse);
      return;
    }

    const comment = await getCommentById(org_id, ticketId, commentId);
    if (!comment) {
      res.status(404).json({ success: false, data: {}, error: 'Comment not found' } satisfies ApiResponse);
      return;
    }

    // Author-only gate — the single rule for edits.
    if (comment.user_id !== userId) {
      logger.warn(
        { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, role, commentId, authorId: comment.user_id },
        'Update comment - forbidden (not the author)',
      );
      res.status(403).json({
        success: false, data: {},
        error: 'Only the comment author can edit this comment',
      } satisfies ApiResponse);
      return;
    }

    // A soft-deleted comment is gone for good — content is blanked and the UI
    // renders a placeholder. No editing, no un-deleting.
    if (comment.deleted_at !== null) {
      logger.warn(
        { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, role, commentId },
        'Update comment - rejected (comment was deleted)',
      );
      res.status(404).json({ success: false, data: {}, error: 'Comment was deleted' } satisfies ApiResponse);
      return;
    }

    // Content is optional when the comment keeps or gains an attachment —
    // that covers stripping the text off an attachment-only comment.
    const trimmedContent = !content || typeof content !== 'string' ? '' : content.trim();
    const existingAttachments = await attachmentsForEntity(org_id, 'comment_id', commentId);
    if (!trimmedContent && parsedAttachments.attachments.length === 0 && existingAttachments.length === 0) {
      res.status(400).json({ success: false, data: {}, error: 'Comment content is required' } satisfies ApiResponse);
      return;
    }

    // Attachment ownership validation BEFORE writing — a 400 here must not
    // leave a half-applied edit behind. Only pending keys owned by this
    // org+author pass; they're confirmed after the content update.
    let attachmentKeys: string[] = [];
    if (parsedAttachments.attachments.length > 0) {
      const linkCheck = await validateAttachmentKeys(org_id, userId, parsedAttachments.attachments);
      if (!linkCheck.ok) {
        res.status(linkCheck.status).json({ success: false, data: {}, error: linkCheck.message } satisfies ApiResponse);
        return;
      }
      attachmentKeys = linkCheck.keys;
    }

    logger.info(
      { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId, contentLength: trimmedContent.length },
      'Validation passed - updating comment',
    );

    const updated = await updateComment(org_id, ticketId, commentId, trimmedContent);
    if (!updated) {
      // Row vanished between the read and the write (concurrent delete).
      res.status(404).json({ success: false, data: {}, error: 'Comment not found' } satisfies ApiResponse);
      return;
    }

    if (attachmentKeys.length > 0) {
      const confirmed = await confirmAttachments(org_id, userId, 'comment_id', commentId, attachmentKeys);
      if (confirmed !== attachmentKeys.length) {
        logger.warn(
          { route: ROUTE.UPDATE_COMMENT, orgId: org_id, commentId, expected: attachmentKeys.length, confirmed },
          'Attachment confirm count mismatch on comment edit',
        );
      }
    }

    // Notify the ticket's reporter + assignee that a comment was edited (in-app
    // only — see template), excluding the editor (the comment author).
    const editedTicket = await getTicketById(org_id, projectId, ticketId);
    if (editedTicket) {
      const editorName = req.user!.name || req.user!.email;
      const editLink = `/projects/${projectId}/tickets/${editedTicket.key}`;

      // A mention NEWLY introduced by this edit notifies the freshly-mentioned
      // member — but a member already named in the PRE-edit body doesn't get
      // re-pinged. We route on the explicitly-selected ids (validated against
      // membership) and subtract anyone whose name was already in the old body.
      let newlyMentioned: string[] = [];
      if (Array.isArray(rawMentions) && rawMentions.length > 0) {
        const members = await getProjectMembers(org_id, projectId);
        const selected = validateMentionIds(rawMentions, new Set(members.map((m) => m.id)), userId);
        const alreadyNamed = new Set(parseMentions(comment.content, members));
        newlyMentioned = selected.filter((id) => !alreadyNamed.has(id));
      }
      if (newlyMentioned.length > 0) {
        logger.info(
          { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, ticketId, commentId, mentionedCount: newlyMentioned.length },
          'Edit introduced new mentions - dispatching mention notifications',
        );
        void notifyMany(newlyMentioned, {
          type: 'ticket_comment_mention',
          orgId: org_id,
          link: editLink,
          data: { commenterName: editorName, ticketTitle: editedTicket.title },
        });
      }

      const editRecipients = [editedTicket.reporter_id, editedTicket.assignee_id].filter(
        (id): id is string => Boolean(id) && id !== userId,
      );
      void notifyMany(editRecipients, {
        type: 'ticket_comment_edited',
        orgId: org_id,
        link: editLink,
        data: { editorName, ticketTitle: editedTicket.title },
      });
    }

    logger.info(
      { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId },
      'Update comment - success',
    );
    const commentAttachments = await buildEntityAttachments(org_id, 'comment_id', commentId);
    res.status(200).json({
      success: true,
      data: toCommentResponse(updated, commentAttachments),
      error: '',
    } satisfies ApiResponse<CommentResponse>);
  } catch (err) {
    logger.error(
      { route: ROUTE.UPDATE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId, error: (err as Error).message },
      'Update comment - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not update comment' } satisfies ApiResponse);
  }
}

// ── DELETE /projects/:id/tickets/:ticketId/comments/:commentId ──────────────
//
// RBAC: owner / admin / PM can delete any comment in the org; regular users
// can delete their own comments only. Matches v1 with org-role semantics.

export async function deleteCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;
  const projectId = parseInt(param(req, 'id'), 10);
  const ticketId  = parseInt(param(req, 'ticketId'), 10);
  const commentId = parseInt(param(req, 'commentId'), 10);

  logger.info(
    { route: ROUTE.DELETE_COMMENT, method: 'DELETE', userId, orgId: org_id, role, projectId, ticketId, commentId },
    'Delete comment - start',
  );

  if (Number.isNaN(projectId) || Number.isNaN(ticketId) || Number.isNaN(commentId)) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid id' } satisfies ApiResponse);
    return;
  }

  try {
    // Project existence + caller access (covers cross-org and PM-not-in).
    const { project, reason } = await loadProjectForCaller(req, projectId);
    if (!project) {
      res.status(reason === 'no_access' ? 403 : 404).json({
        success: false, data: {},
        error: reason === 'no_access' ? 'You do not have access to this project' : 'Project not found',
      } satisfies ApiResponse);
      return;
    }

    const comment = await getCommentById(org_id, ticketId, commentId);
    if (!comment) {
      res.status(404).json({ success: false, data: {}, error: 'Comment not found' } satisfies ApiResponse);
      return;
    }

    // Already soft-deleted (a root whose replies kept the thread alive) — the
    // comment is gone; a second delete is a no-op, not an error path.
    if (comment.deleted_at !== null) {
      logger.info(
        { route: ROUTE.DELETE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId },
        'Delete comment - already deleted (soft-deleted row), no-op',
      );
      res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
      return;
    }

    // Comment delete eligibility — tightened 2026 from the previous "any PM
    // or above" rule (which was too broad: any PM in the org could delete
    // any comment on any ticket they could view). New rule:
    //   • Org owner or admin       — escalation path / moderation
    //   • Comment author           — own your words
    //   • Ticket reporter          — owns the conversation on their ticket
    //   • Ticket assignee          — owns the work, can clean up noise
    //
    // PMs are no longer blanket-elevated for this action; if a PM is also
    // the reporter / assignee / author, they pass via those checks.
    // Mirrors the frontend canDelete in app/.../tickets/[key]/page.tsx —
    // any future change must update both.
    const ticket = await getTicketById(org_id, projectId, ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, data: {}, error: 'Ticket not found' } satisfies ApiResponse);
      return;
    }

    const isOrgAdmin = role === 'owner' || role === 'admin';
    const isAuthor   = comment.user_id    === userId;
    const isReporter = ticket.reporter_id === userId;
    const isAssignee = ticket.assignee_id === userId;

    if (!isOrgAdmin && !isAuthor && !isReporter && !isAssignee) {
      logger.warn(
        { route: ROUTE.DELETE_COMMENT, userId, orgId: org_id, role, commentId, authorId: comment.user_id, reporterId: ticket.reporter_id, assigneeId: ticket.assignee_id },
        'Delete comment - forbidden (not author / reporter / assignee / org admin)',
      );
      res.status(403).json({
        success: false, data: {},
        error: 'Only the comment author, ticket reporter, ticket assignee, or an org admin can delete this comment',
      } satisfies ApiResponse);
      return;
    }

    const { keys: deletedKeys } = await deleteComment(org_id, ticketId, commentId);
    await sweepS3Objects(deletedKeys);

    logger.info(
      { route: ROUTE.DELETE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId, isOrgAdmin, isAuthor, isReporter, isAssignee },
      'Delete comment - success',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE.DELETE_COMMENT, userId, orgId: org_id, projectId, ticketId, commentId, error: (err as Error).message },
      'Delete comment - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete comment' } satisfies ApiResponse);
  }
}
