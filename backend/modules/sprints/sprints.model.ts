import pool from '../../config/db';
import logger from '../../config/logger';
import type { SprintRow } from './sprints.types';

const SPRINT_COLS =
  'id, org_id, project_id, name, goal, notes, status, start_date, end_date, archived_at, created_by, created_at, updated_at';

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getSprintsForProject(orgId: string, projectId: number): Promise<SprintRow[]> {
  logger.info(
    { route: 'sprints.model.getSprintsForProject', orgId, projectId },
    'Listing sprints for project',
  );

  const result = await pool.query<SprintRow>(
    `SELECT ${SPRINT_COLS}
     FROM sprints
     WHERE org_id = $1 AND project_id = $2
     ORDER BY created_at ASC`,
    [orgId, projectId],
  );

  logger.info(
    { route: 'sprints.model.getSprintsForProject', orgId, projectId, count: result.rows.length },
    'Sprints list returned',
  );
  return result.rows;
}

export async function getSprintById(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<SprintRow | null> {
  logger.info(
    { route: 'sprints.model.getSprintById', orgId, projectId, sprintId },
    'Fetching sprint by id',
  );

  const result = await pool.query<SprintRow>(
    `SELECT ${SPRINT_COLS}
     FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND id = $3`,
    [orgId, projectId, sprintId],
  );

  logger.info(
    { route: 'sprints.model.getSprintById', orgId, projectId, sprintId, found: result.rowCount },
    'Sprint lookup complete',
  );
  return result.rows[0] ?? null;
}

export async function getActiveSprint(orgId: string, projectId: number): Promise<SprintRow | null> {
  const result = await pool.query<SprintRow>(
    `SELECT ${SPRINT_COLS}
     FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND status = 'active'`,
    [orgId, projectId],
  );
  return result.rows[0] ?? null;
}

export async function sprintNameExists(
  orgId: string,
  projectId: number,
  name: string,
  /** Sprint id to exclude from the check - used by rename so renaming a
   *  sprint to its own current name doesn't self-conflict. Omit on create. */
  excludeSprintId?: number,
): Promise<boolean> {
  const params: unknown[] = [orgId, projectId, name];
  let sql = `SELECT 1 FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND LOWER(name) = LOWER($3)`;
  if (excludeSprintId !== undefined) {
    params.push(excludeSprintId);
    sql += ` AND id <> $${params.length}`;
  }
  const result = await pool.query(sql, params);
  return (result.rowCount ?? 0) > 0;
}

// ── Scheduled auto-start (cron) ──────────────────────────────────────────────

/** Sprint flipped planned → active by the auto-start job, plus its project name (for notification copy). */
export interface ActivatedSprint {
  id:           number;
  org_id:       string;
  project_id:   number;
  name:         string;
  project_name: string;
}

/**
 * Activate every planned sprint that has reached its start date — at most one
 * per project, the earliest by start_date. Used by the sprint-autostart cron.
 *
 * Why DISTINCT ON: a project can have several planned sprints all due; activating
 * more than one would violate `one_active_sprint_per_project`. We pick exactly
 * one per project up front so the UPDATE never trips that partial unique index.
 *
 * Guards (mirror the manual planned→active path in the controller):
 *  - project not archived (no auto-start on a frozen project)
 *  - sprint not archived
 *  - no sprint already active in that project
 *
 * "Today" is evaluated in IST so the flip lines up with the user-chosen date
 * regardless of the database session timezone. Idempotent — a second run the
 * same day finds nothing new because the rows are already 'active'.
 */
export async function activateDueSprints(): Promise<ActivatedSprint[]> {
  const result = await pool.query<ActivatedSprint>(
    `WITH due AS (
       SELECT DISTINCT ON (s.project_id)
              s.id, s.org_id, s.project_id, s.name, p.name AS project_name
       FROM sprints s
       JOIN projects p ON p.id = s.project_id
       WHERE s.status      = 'planned'
         AND s.start_date IS NOT NULL
         AND s.start_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         AND s.archived_at IS NULL
         AND p.archived    = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM sprints a
           WHERE a.project_id = s.project_id AND a.status = 'active'
         )
       ORDER BY s.project_id, s.start_date ASC, s.id ASC
     )
     UPDATE sprints t
        SET status = 'active', updated_at = NOW()
       FROM due
      WHERE t.id = due.id
     RETURNING t.id, t.org_id, t.project_id, t.name, due.project_name`,
  );

  logger.info(
    { route: 'sprints.model.activateDueSprints', activated: result.rowCount },
    'Auto-start swept due planned sprints',
  );
  return result.rows;
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createSprint(
  orgId: string,
  projectId: number,
  createdBy: string,
  name: string,
  startDate: Date | null,
  endDate: Date | null,
  goal: string | null,
  notes: string | null,
): Promise<SprintRow> {
  logger.info(
    { route: 'sprints.model.createSprint', orgId, projectId, createdBy, sprintName: name },
    'Inserting sprint',
  );

  const result = await pool.query<SprintRow>(
    `INSERT INTO sprints (org_id, project_id, name, goal, notes, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SPRINT_COLS}`,
    [orgId, projectId, name, goal, notes, startDate, endDate, createdBy],
  );

  logger.info(
    { route: 'sprints.model.createSprint', orgId, projectId, sprintId: result.rows[0]!.id },
    'Sprint inserted',
  );
  return result.rows[0]!;
}

// ── Update (dynamic SET) ─────────────────────────────────────────────────────

export async function updateSprint(
  orgId: string,
  projectId: number,
  sprintId: number,
  updates: {
    name?: string;
    goal?: string | null;
    notes?: string | null;
    start_date?: Date | null;
    end_date?: Date | null;
    status?: 'planned' | 'active' | 'completed';
    /** true → archived_at = NOW(); false → NULL. Caller enforces RBAC. */
    archived?: boolean;
  },
): Promise<SprintRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.name       !== undefined) { fields.push(`name = $${i++}`);       values.push(updates.name); }
  if (updates.goal       !== undefined) { fields.push(`goal = $${i++}`);       values.push(updates.goal); }
  if (updates.notes      !== undefined) { fields.push(`notes = $${i++}`);      values.push(updates.notes); }
  if (updates.start_date !== undefined) { fields.push(`start_date = $${i++}`); values.push(updates.start_date); }
  if (updates.end_date   !== undefined) { fields.push(`end_date = $${i++}`);   values.push(updates.end_date); }
  if (updates.status     !== undefined) { fields.push(`status = $${i++}`);     values.push(updates.status); }
  if (updates.archived   !== undefined) {
    // Boolean → timestamp. archived_at is the source of truth on read; status
    // stays independent so a completed-then-archived sprint keeps its history.
    fields.push(`archived_at = ${updates.archived ? 'NOW()' : 'NULL'}`);
  }

  fields.push('updated_at = NOW()');
  values.push(orgId, projectId, sprintId);

  logger.info(
    { route: 'sprints.model.updateSprint', orgId, projectId, sprintId, fields: Object.keys(updates) },
    'Updating sprint',
  );

  const result = await pool.query<SprintRow>(
    `UPDATE sprints SET ${fields.join(', ')}
     WHERE org_id = $${i++} AND project_id = $${i++} AND id = $${i}
     RETURNING ${SPRINT_COLS}`,
    values,
  );

  logger.info(
    { route: 'sprints.model.updateSprint', orgId, projectId, sprintId, updated: result.rowCount },
    'Sprint update complete',
  );
  return result.rows[0] ?? null;
}

// ── Status transitions (transactions) ────────────────────────────────────────
//
// completeSprintWithRollback - atomically mark sprint completed, set end_date
// if null, and move every non-done ticket back to backlog. v1 behavior.
//
// deleteSprintWithRollback - atomically move all tickets to backlog then
// delete the sprint row. Used only for `planned` sprints per v1 contract;
// caller enforces the status precondition.

export async function completeSprintWithRollback(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<SprintRow | null> {
  logger.info(
    { route: 'sprints.model.completeSprintWithRollback', orgId, projectId, sprintId },
    'Completing sprint (txn: mark completed + move incomplete tickets to backlog)',
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sprintResult = await client.query<SprintRow>(
      `UPDATE sprints
       SET status = 'completed',
           end_date = COALESCE(end_date, NOW()::DATE),
           updated_at = NOW()
       WHERE org_id = $1 AND project_id = $2 AND id = $3
       RETURNING ${SPRINT_COLS}`,
      [orgId, projectId, sprintId],
    );

    if (sprintResult.rowCount === 0) {
      await client.query('ROLLBACK');
      logger.warn(
        { route: 'sprints.model.completeSprintWithRollback', orgId, projectId, sprintId },
        'Sprint not found for org/project - rolled back',
      );
      return null;
    }

    const tickets = await client.query(
      `UPDATE tickets SET sprint_id = NULL, updated_at = NOW()
       WHERE org_id = $1 AND sprint_id = $2 AND status != 'done'
       RETURNING id`,
      [orgId, sprintId],
    );

    await client.query('COMMIT');
    logger.info(
      {
        route: 'sprints.model.completeSprintWithRollback',
        orgId, projectId, sprintId,
        movedToBacklog: tickets.rowCount,
      },
      'Sprint completed transactionally',
    );
    return sprintResult.rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      { route: 'sprints.model.completeSprintWithRollback', orgId, projectId, sprintId, error: (err as Error).message },
      'Sprint completion txn rolled back',
    );
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSprintWithRollback(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<boolean> {
  logger.info(
    { route: 'sprints.model.deleteSprintWithRollback', orgId, projectId, sprintId },
    'Deleting sprint (txn: move tickets to backlog + delete)',
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tickets = await client.query(
      `UPDATE tickets SET sprint_id = NULL, updated_at = NOW()
       WHERE org_id = $1 AND sprint_id = $2
       RETURNING id`,
      [orgId, sprintId],
    );

    const result = await client.query(
      'DELETE FROM sprints WHERE org_id = $1 AND project_id = $2 AND id = $3 RETURNING id',
      [orgId, projectId, sprintId],
    );

    await client.query('COMMIT');
    logger.info(
      {
        route: 'sprints.model.deleteSprintWithRollback',
        orgId, projectId, sprintId,
        movedToBacklog: tickets.rowCount,
        deleted: result.rowCount,
      },
      'Sprint deletion txn committed',
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      { route: 'sprints.model.deleteSprintWithRollback', orgId, projectId, sprintId, error: (err as Error).message },
      'Sprint deletion txn rolled back',
    );
    throw err;
  } finally {
    client.release();
  }
}
