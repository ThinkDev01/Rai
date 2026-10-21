import pool from '../../config/db';
import logger from '../../config/logger';
import type {
  TicketRowFull,
  CommentRow,
  CommentRowWithAuthor,
  TicketType,
  TicketStatus,
  TicketPriority,
  TicketTypeFields,
} from './tickets.types';

// ── Shared JOIN fragment ──────────────────────────────────────────────────────
//
// Every ticket lookup needs the same shape: ticket + assignee + reporter
// (with user_orgs JOIN for caller-org role) + parent key.
//
// user_orgs is joined twice - once for assignee, once for reporter - each
// time anchored on the *current org context* (`$1` in every query that uses
// this fragment). Reporter JOIN is LEFT because a user could (rarely) be
// removed from the org while having tickets they reported - surface them
// rather than dropping the ticket entirely. Assignee JOIN is also LEFT (the
// outer `LEFT JOIN users a` carries through).

function ticketSelect(orgIdParamIdx: number): string {
  return `
    SELECT
      t.id, t.org_id, t.project_id, t.sprint_id, t.parent_id,
      t.key, t.title, t.description, t.type, t.status, t.priority,
      t.epic_name, t.epic_color, t.story_points,
      t.acceptance_criteria, t.steps_to_reproduce, t.environment,
      t.created_at, t.updated_at,
      a.id          AS assignee_id,
      a.name        AS assignee_name,
      a.email       AS assignee_email,
      ao.role       AS assignee_role,
      ao.role_label AS assignee_role_label,
      r.id          AS reporter_id,
      r.name        AS reporter_name,
      r.email       AS reporter_email,
      ro.role       AS reporter_role,
      ro.role_label AS reporter_role_label,
      p.key         AS parent_key
    FROM tickets t
    LEFT JOIN users     a  ON a.id  = t.assignee_id
    LEFT JOIN user_orgs ao ON ao.user_id = t.assignee_id AND ao.org_id = $${orgIdParamIdx}
    JOIN      users     r  ON r.id  = t.reporter_id
    LEFT JOIN user_orgs ro ON ro.user_id = t.reporter_id AND ro.org_id = $${orgIdParamIdx}
    LEFT JOIN tickets   p  ON p.id  = t.parent_id AND p.org_id = $${orgIdParamIdx}
  `;
}

// ── Ticket queries ────────────────────────────────────────────────────────────

export async function getTicketByKey(
  orgId: string,
  projectId: number,
  key: string,
): Promise<TicketRowFull | null> {
  logger.info(
    { route: 'tickets.model.getTicketByKey', orgId, projectId, key },
    'Fetching ticket by key',
  );

  const result = await pool.query<TicketRowFull>(
    `${ticketSelect(1)}
     WHERE t.org_id = $1 AND t.project_id = $2 AND t.key = $3`,
    [orgId, projectId, key],
  );

  logger.info(
    { route: 'tickets.model.getTicketByKey', orgId, projectId, key, found: result.rowCount },
    'Ticket-by-key lookup complete',
  );
  return result.rows[0] ?? null;
}

export async function getTicketById(
  orgId: string,
  projectId: number,
  ticketId: number,
): Promise<TicketRowFull | null> {
  const result = await pool.query<TicketRowFull>(
    `${ticketSelect(1)}
     WHERE t.org_id = $1 AND t.project_id = $2 AND t.id = $3`,
    [orgId, projectId, ticketId],
  );
  return result.rows[0] ?? null;
}

export async function getSubTicketKeys(
  orgId: string,
  parentTicketId: number,
): Promise<string[]> {
  const result = await pool.query<{ key: string }>(
    `SELECT key FROM tickets
     WHERE org_id = $1 AND parent_id = $2
     ORDER BY created_at ASC`,
    [orgId, parentTicketId],
  );
  return result.rows.map(r => r.key);
}

// ── Lookup helpers ───────────────────────────────────────────────────────────

export async function getTicketIdByKey(
  orgId: string,
  projectId: number,
  key: string,
): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM tickets
     WHERE org_id = $1 AND project_id = $2 AND key = $3`,
    [orgId, projectId, key],
  );
  return result.rows[0]?.id ?? null;
}

export async function sprintBelongsToProject(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND id = $3`,
    [orgId, projectId, sprintId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function userIsProjectMember(
  projectId: number,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Status history ───────────────────────────────────────────────────────────

export async function logStatusChange(
  orgId: string,
  ticketId: number,
  sprintId: number | null,
  oldStatus: string | null,
  newStatus: string,
  changedBy: string | null,
): Promise<void> {
  logger.info(
    { route: 'tickets.model.logStatusChange', orgId, ticketId, sprintId, oldStatus, newStatus, changedBy },
    'Recording ticket status change',
  );

  await pool.query(
    `INSERT INTO ticket_status_history (org_id, ticket_id, sprint_id, old_status, new_status, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, ticketId, sprintId, oldStatus, newStatus, changedBy],
  );
}

// ── Create (transaction: advisory lock per project → next key → INSERT) ─────

export async function createTicket(
  orgId: string,
  projectId: number,
  projectKey: string,
  reporterId: string,
  title: string,
  type: TicketType,
  priority: TicketPriority,
  status: TicketStatus,
  description: string | null,
  assigneeId: string | null,
  sprintId: number | null,
  parentId: number | null,
  typeFields: TicketTypeFields = {},
): Promise<TicketRowFull> {
  logger.info(
    { route: 'tickets.model.createTicket', orgId, projectId, projectKey, reporterId, type, status },
    'Creating ticket (txn: advisory lock + MAX+1 + INSERT)',
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory lock per project - serializes ticket-number generation. The
    // lock key collides only with the same project_id, so other projects can
    // create concurrently. Lock is held only until COMMIT.
    await client.query('SELECT pg_advisory_xact_lock($1)', [projectId]);

    const numResult = await client.query<{ next_num: number }>(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(key, '-', 2) AS INT)), 0) + 1 AS next_num
       FROM tickets WHERE project_id = $1`,
      [projectId],
    );
    const nextNum  = numResult.rows[0]?.next_num ?? 1;
    const ticketKey = `${projectKey}-${nextNum}`;
    logger.info(
      { route: 'tickets.model.createTicket', orgId, projectId, ticketKey, nextNum },
      'Generated next ticket key',
    );

    // Value order MUST match the column-list order above. `status` is the
    // 9th column, `priority` is the 10th - keep this discipline; mismatch
    // here trips the CHECK constraints with confusingly-worded errors (e.g.
    // a 'todo' string landing in the priority slot fires the priority CHECK).
    await client.query(
      `INSERT INTO tickets
         (org_id, project_id, sprint_id, parent_id, key, title, description, type, status, priority, assignee_id, reporter_id,
          epic_name, epic_color, story_points, acceptance_criteria, steps_to_reproduce, environment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18)`,
      [
        orgId, projectId, sprintId, parentId, ticketKey, title, description, type, status, priority, assigneeId, reporterId,
        typeFields.epic_name ?? null,
        typeFields.epic_color ?? null,
        typeFields.story_points ?? null,
        typeFields.acceptance_criteria ?? null,
        typeFields.steps_to_reproduce ?? null,
        typeFields.environment ?? null,
      ],
    );

    const result = await client.query<TicketRowFull>(
      `${ticketSelect(1)}
       WHERE t.org_id = $1 AND t.project_id = $2 AND t.key = $3`,
      [orgId, projectId, ticketKey],
    );

    await client.query('COMMIT');
    logger.info(
      { route: 'tickets.model.createTicket', orgId, projectId, ticketKey, ticketId: result.rows[0]!.id },
      'Ticket creation txn committed',
    );
    return result.rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      { route: 'tickets.model.createTicket', orgId, projectId, reporterId, error: (err as Error).message },
      'Ticket creation txn rolled back',
    );
    throw err;
  } finally {
    client.release();
  }
}

// ── Update (dynamic SET on whitelisted fields) ───────────────────────────────

export async function updateTicket(
  orgId: string,
  projectId: number,
  ticketId: number,
  updates: {
    title?: string;
    description?: string | null;
    type?: TicketType;
    priority?: TicketPriority;
    status?: TicketStatus;
    assignee_id?: string | null;
    sprint_id?: number | null;
    parent_id?: number | null;
  } & TicketTypeFields,
): Promise<TicketRowFull | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title       !== undefined) { fields.push(`title = $${i++}`);       values.push(updates.title); }
  if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description); }
  if (updates.type        !== undefined) { fields.push(`type = $${i++}`);        values.push(updates.type); }
  if (updates.priority    !== undefined) { fields.push(`priority = $${i++}`);    values.push(updates.priority); }
  if (updates.status      !== undefined) { fields.push(`status = $${i++}`);      values.push(updates.status); }
  if (updates.assignee_id !== undefined) { fields.push(`assignee_id = $${i++}`); values.push(updates.assignee_id); }
  if (updates.sprint_id   !== undefined) { fields.push(`sprint_id = $${i++}`);   values.push(updates.sprint_id); }
  if (updates.parent_id   !== undefined) { fields.push(`parent_id = $${i++}`);   values.push(updates.parent_id); }
  // type-specific fields (migration 013)
  if (updates.epic_name           !== undefined) { fields.push(`epic_name = $${i++}`);           values.push(updates.epic_name); }
  if (updates.epic_color          !== undefined) { fields.push(`epic_color = $${i++}`);          values.push(updates.epic_color); }
  if (updates.story_points        !== undefined) { fields.push(`story_points = $${i++}`);        values.push(updates.story_points); }
  if (updates.acceptance_criteria !== undefined) { fields.push(`acceptance_criteria = $${i++}`); values.push(updates.acceptance_criteria); }
  if (updates.steps_to_reproduce  !== undefined) { fields.push(`steps_to_reproduce = $${i++}`);  values.push(updates.steps_to_reproduce); }
  if (updates.environment         !== undefined) { fields.push(`environment = $${i++}`);         values.push(updates.environment); }

  if (fields.length === 0) return null;

  fields.push('updated_at = NOW()');
  values.push(orgId, projectId, ticketId);

  logger.info(
    { route: 'tickets.model.updateTicket', orgId, projectId, ticketId, fields: Object.keys(updates) },
    'Updating ticket',
  );

  const updateResult = await pool.query(
    `UPDATE tickets SET ${fields.join(', ')}
     WHERE org_id = $${i++} AND project_id = $${i++} AND id = $${i}
     RETURNING id`,
    values,
  );

  if ((updateResult.rowCount ?? 0) === 0) {
    logger.warn(
      { route: 'tickets.model.updateTicket', orgId, projectId, ticketId },
      'Ticket update affected no rows',
    );
    return null;
  }

  const result = await pool.query<TicketRowFull>(
    `${ticketSelect(1)}
     WHERE t.org_id = $1 AND t.project_id = $2 AND t.id = $3`,
    [orgId, projectId, ticketId],
  );
  logger.info(
    { route: 'tickets.model.updateTicket', orgId, projectId, ticketId },
    'Ticket update + refetch complete',
  );
  return result.rows[0] ?? null;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTicket(
  orgId: string,
  projectId: number,
  ticketId: number,
): Promise<{ deleted: boolean; keys: string[] }> {
  logger.info(
    { route: 'tickets.model.deleteTicket', orgId, projectId, ticketId },
    'Deleting ticket (cascades to comments + status_history)',
  );

  // Collect every attachment key BEFORE the row goes away — ticket files plus
  // files on its comments (comment attachments cascade through comments). The
  // controller deletes the S3 objects so nothing is orphaned in the bucket.
  const keysRes = await pool.query<{ key: string }>(
    `SELECT key FROM attachments
     WHERE org_id = $1
       AND (ticket_id = $2 OR comment_id IN (SELECT id FROM comments WHERE ticket_id = $2))`,
    [orgId, ticketId],
  );

  const result = await pool.query(
    'DELETE FROM tickets WHERE org_id = $1 AND project_id = $2 AND id = $3 RETURNING id',
    [orgId, projectId, ticketId],
  );

  logger.info(
    { route: 'tickets.model.deleteTicket', orgId, projectId, ticketId, deleted: result.rowCount, keys: keysRes.rows.length },
    'Delete complete',
  );
  return { deleted: (result.rowCount ?? 0) > 0, keys: keysRes.rows.map(r => r.key) };
}

// ── Project-scoped full ticket dump (used by Project response assembly) ─────
//
// Returns every ticket in the project with the same shape `getTicketByKey`
// produces - assignee + reporter joined to users + user_orgs (for caller-org
// role), parent_key LEFT-JOINed via tickets self. Caller groups into
// `sprints[].tickets[]` and top-level `backlog[]`.

export async function getAllTicketsForProject(
  orgId: string,
  projectId: number,
): Promise<TicketRowFull[]> {
  logger.info(
    { route: 'tickets.model.getAllTicketsForProject', orgId, projectId },
    'Fetching full ticket dump for project',
  );

  const result = await pool.query<TicketRowFull>(
    `${ticketSelect(1)}
     WHERE t.org_id = $1 AND t.project_id = $2
     ORDER BY t.created_at ASC`,
    [orgId, projectId],
  );

  logger.info(
    { route: 'tickets.model.getAllTicketsForProject', orgId, projectId, count: result.rows.length },
    'Project ticket dump returned',
  );
  return result.rows;
}

// ── Filtered listing (AI agent + Board view) ────────────────────────────────

export interface FilteredTicketRow {
  id: number;
  key: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  sprint_id: number | null;
  created_at: Date;
  updated_at: Date;
  assignee_id: string | null;
  assignee_name: string | null;
  reporter_id: string;
  reporter_name: string | null;
  sprint_name: string | null;
}

export async function getFilteredTickets(
  orgId: string,
  projectId: number,
  filters: { status?: string; assigneeId?: string; type?: string; priority?: string },
): Promise<FilteredTicketRow[]> {
  logger.info(
    { route: 'tickets.model.getFilteredTickets', orgId, projectId, filters },
    'Listing filtered tickets',
  );

  const conditions: string[] = ['t.org_id = $1', 't.project_id = $2'];
  const values: unknown[] = [orgId, projectId];
  let i = 3;

  if (filters.status)     { conditions.push(`t.status = $${i++}`);      values.push(filters.status); }
  if (filters.assigneeId) { conditions.push(`t.assignee_id = $${i++}`); values.push(filters.assigneeId); }
  if (filters.type)       { conditions.push(`t.type = $${i++}`);        values.push(filters.type); }
  if (filters.priority)   { conditions.push(`t.priority = $${i++}`);    values.push(filters.priority); }

  const result = await pool.query<FilteredTicketRow>(
    `SELECT
       t.id, t.key, t.title, t.type, t.status, t.priority,
       t.sprint_id, t.created_at, t.updated_at,
       t.assignee_id, a.name AS assignee_name,
       t.reporter_id, r.name AS reporter_name,
       s.name AS sprint_name
     FROM tickets t
     LEFT JOIN users   a ON a.id = t.assignee_id
     JOIN      users   r ON r.id = t.reporter_id
     LEFT JOIN sprints s ON s.id = t.sprint_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.updated_at DESC`,
    values,
  );

  logger.info(
    { route: 'tickets.model.getFilteredTickets', orgId, projectId, count: result.rows.length },
    'Filtered listing returned',
  );
  return result.rows;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function getCommentsByTicketId(
  orgId: string,
  ticketId: number,
): Promise<CommentRowWithAuthor[]> {
  const result = await pool.query<CommentRowWithAuthor>(
    `SELECT
       c.id, c.org_id, c.ticket_id, c.user_id, c.content, c.created_at, c.updated_at, c.edited_at,
       c.deleted_at,
       c.parent_comment_id,
       u.name        AS author_name,
       u.email       AS author_email,
       uo.role       AS author_role,
       uo.role_label AS author_role_label
     FROM comments c
     JOIN      users     u  ON u.id  = c.user_id
     LEFT JOIN user_orgs uo ON uo.user_id = c.user_id AND uo.org_id = $1
     WHERE c.org_id = $1 AND c.ticket_id = $2
     ORDER BY c.created_at ASC`,
    [orgId, ticketId],
  );
  return result.rows;
}

export async function createComment(
  orgId: string,
  ticketId: number,
  userId: string,
  content: string,
  parentCommentId: number | null = null,
): Promise<CommentRowWithAuthor> {
  logger.info(
    { route: 'tickets.model.createComment', orgId, ticketId, userId, parentCommentId },
    'Inserting comment',
  );

  const result = await pool.query<CommentRowWithAuthor>(
    `WITH inserted AS (
       INSERT INTO comments (org_id, ticket_id, user_id, content, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, org_id, ticket_id, user_id, content, parent_comment_id, created_at, updated_at, edited_at, deleted_at
     )
     SELECT
       i.id, i.org_id, i.ticket_id, i.user_id, i.content, i.parent_comment_id, i.created_at, i.updated_at, i.edited_at,
       i.deleted_at,
       u.name        AS author_name,
       u.email       AS author_email,
       uo.role       AS author_role,
       uo.role_label AS author_role_label
     FROM inserted i
     JOIN      users     u  ON u.id  = i.user_id
     LEFT JOIN user_orgs uo ON uo.user_id = i.user_id AND uo.org_id = $1`,
    [orgId, ticketId, userId, content, parentCommentId],
  );

  logger.info(
    { route: 'tickets.model.createComment', orgId, ticketId, userId, commentId: result.rows[0]!.id, parentCommentId },
    'Comment inserted',
  );
  return result.rows[0]!;
}

export async function updateComment(
  orgId: string,
  ticketId: number,
  commentId: number,
  content: string,
): Promise<CommentRowWithAuthor | null> {
  logger.info(
    { route: 'tickets.model.updateComment', orgId, ticketId, commentId },
    'Updating comment',
  );

  // Mirror createComment's CTE-then-join shape so the returned row carries the
  // author fields the response formatter needs. edited_at = NOW() stamps the
  // "edited <time>" label; updated_at bumped too for the generic row-touch.
  const result = await pool.query<CommentRowWithAuthor>(
    `WITH updated AS (
       UPDATE comments
       SET content = $4, edited_at = NOW(), updated_at = NOW()
       WHERE org_id = $1 AND ticket_id = $2 AND id = $3
       RETURNING id, org_id, ticket_id, user_id, content, parent_comment_id, created_at, updated_at, edited_at, deleted_at
     )
     SELECT
       up.id, up.org_id, up.ticket_id, up.user_id, up.content, up.parent_comment_id, up.created_at, up.updated_at, up.edited_at,
       up.deleted_at,
       u.name        AS author_name,
       u.email       AS author_email,
       uo.role       AS author_role,
       uo.role_label AS author_role_label
     FROM updated up
     JOIN      users     u  ON u.id  = up.user_id
     LEFT JOIN user_orgs uo ON uo.user_id = up.user_id AND uo.org_id = $1`,
    [orgId, ticketId, commentId, content],
  );

  logger.info(
    { route: 'tickets.model.updateComment', orgId, ticketId, commentId, updated: result.rowCount },
    'Comment update complete',
  );
  return result.rows[0] ?? null;
}

export async function getCommentById(
  orgId: string,
  ticketId: number,
  commentId: number,
): Promise<CommentRow | null> {
  const result = await pool.query<CommentRow>(
    `SELECT id, org_id, ticket_id, user_id, content, parent_comment_id, created_at, updated_at, edited_at, deleted_at
     FROM comments
     WHERE org_id = $1 AND ticket_id = $2 AND id = $3`,
    [orgId, ticketId, commentId],
  );
  return result.rows[0] ?? null;
}

export async function deleteComment(
  orgId: string,
  ticketId: number,
  commentId: number,
): Promise<{ deleted: boolean; keys: string[] }> {
  logger.info(
    { route: 'tickets.model.deleteComment', orgId, ticketId, commentId },
    'Deleting comment',
  );

  // Collect the comment's attachment keys before the row goes away so the
  // controller can remove the S3 objects (no orphaned objects in the bucket).
  const keysRes = await pool.query<{ key: string }>(
    'SELECT key FROM attachments WHERE org_id = $1 AND comment_id = $2',
    [orgId, commentId],
  );

  // Does this comment have replies? If it's a ROOT with replies we must NOT
  // hard-delete — the FK (ON DELETE SET NULL, migration 010) would promote
  // every reply to a root and the conversation reads as unrelated comments.
  // Instead we soft-delete: keep the row, blank its content, stamp deleted_at.
  // The replies keep their parent_comment_id and stay threaded under the
  // "deleted" placeholder the UI renders. Attachments are still removed (their
  // rows cascade on hard delete; for soft delete we delete them explicitly).
  const hasRepliesRes = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM comments WHERE org_id = $1 AND parent_comment_id = $2
     ) AS exists`,
    [orgId, commentId],
  );
  const hasReplies = hasRepliesRes.rows[0]?.exists ?? false;

  if (hasReplies) {
    const updateRes = await pool.query(
      `UPDATE comments
       SET deleted_at = NOW(), content = '', edited_at = NULL
       WHERE org_id = $1 AND ticket_id = $2 AND id = $3
       RETURNING id`,
      [orgId, ticketId, commentId],
    );
    if ((updateRes.rowCount ?? 0) > 0) {
      // Soft delete keeps the row, so attachment rows don't cascade — clear
      // them here (the S3 objects are swept by the caller from `keys`).
      await pool.query(
        'DELETE FROM attachments WHERE org_id = $1 AND comment_id = $2',
        [orgId, commentId],
      );
    }
    logger.info(
      { route: 'tickets.model.deleteComment', orgId, ticketId, commentId, softDeleted: true, keys: keysRes.rows.length },
      'Comment soft-deleted (had replies - thread preserved)',
    );
    return { deleted: (updateRes.rowCount ?? 0) > 0, keys: keysRes.rows.map(r => r.key) };
  }

  const result = await pool.query(
    'DELETE FROM comments WHERE org_id = $1 AND ticket_id = $2 AND id = $3 RETURNING id',
    [orgId, ticketId, commentId],
  );

  logger.info(
    { route: 'tickets.model.deleteComment', orgId, ticketId, commentId, deleted: result.rowCount, keys: keysRes.rows.length },
    'Comment delete complete',
  );
  return { deleted: (result.rowCount ?? 0) > 0, keys: keysRes.rows.map(r => r.key) };
}
