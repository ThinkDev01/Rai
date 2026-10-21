import pool from '../../config/db';
import logger from '../../config/logger';
import type {
  ProjectRow,
  ProjectSummaryRow,
  OrgMemberRow,
} from './projects.types';
import type { OrgRole } from '../../types/common.types';

// ── Permission predicate (used by SELECT queries) ────────────────────────────
//
// rbac.md §Project actions:
//   - owner / admin (org-level): see every project in the org
//   - PM / user:                 see public projects + projects they're members of
// All callers must pass the caller's org_id (from req.context) and either
// (role + userId) for visibility filtering, or set `isOrgWide=true` (used by
// admin/owner queries which bypass visibility).
//
// Every SELECT is anchored on `p.org_id = $1` - the wall between tenants.

// Two forms of the same column list:
//  - PREFIXED:  for SELECT queries that alias `projects` as `p` and may join
//               other tables - avoids ambiguity.
//  - BARE:      for INSERT/UPDATE ... RETURNING, which has no FROM alias.
// Keep them in lock-step when adding or renaming columns.
const PROJECT_COLS_PREFIXED =
  'p.id, p.org_id, p.name, p.key, p.description, p.archived, p.archived_at, p.visibility, p.avatar_type, p.avatar_value, p.created_by, p.created_at, p.updated_at';
const PROJECT_COLS =
  'id, org_id, name, key, description, archived, archived_at, visibility, avatar_type, avatar_value, created_by, created_at, updated_at';

// ── Project - list ───────────────────────────────────────────────────────────

export async function getAllProjectSummaries(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<ProjectSummaryRow[]> {
  logger.info(
    { route: 'projects.model.getAllProjectSummaries', orgId, userId, role },
    'Querying projects list',
  );

  const isOrgWide = role === 'owner' || role === 'admin';

  const result = await pool.query<ProjectSummaryRow>(
    `SELECT
       ${PROJECT_COLS_PREFIXED},
       (SELECT COUNT(*) FROM tickets         t  WHERE t.project_id  = p.id)::INT AS ticket_count,
       (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id)::INT AS member_count,
       (SELECT s.name FROM sprints s
        WHERE s.project_id = p.id AND s.status = 'active' LIMIT 1)               AS active_sprint_name,
       COALESCE(
         (SELECT MAX(t.updated_at) FROM tickets t WHERE t.project_id = p.id),
         p.updated_at
       )                                                                         AS last_active,
       -- Caller's personal pin flag (My Work / projects-page quick-access).
       EXISTS (
         SELECT 1 FROM user_pins up
         WHERE up.user_id = $3 AND up.org_id = $1 AND up.project_id = p.id
       )                                                                         AS is_pinned
     FROM projects p
     WHERE p.org_id = $1
       AND (
         $2
         OR p.visibility = 'public'
         OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = $3
            )
       )
     ORDER BY last_active DESC`,
    [orgId, isOrgWide, userId],
  );

  logger.info(
    { route: 'projects.model.getAllProjectSummaries', orgId, userId, count: result.rows.length },
    'Projects list query returned',
  );
  return result.rows;
}

// ── Project - get one ────────────────────────────────────────────────────────

export async function getProjectById(
  orgId: string,
  projectId: number,
  userId: string,
  role: OrgRole,
): Promise<ProjectRow | null> {
  logger.info(
    { route: 'projects.model.getProjectById', orgId, projectId, userId, role },
    'Fetching project by id with visibility filter',
  );

  const isOrgWide = role === 'owner' || role === 'admin';

  const result = await pool.query<ProjectRow>(
    `SELECT ${PROJECT_COLS_PREFIXED}
     FROM projects p
     WHERE p.org_id = $1
       AND p.id     = $2
       AND (
         $3
         OR p.visibility = 'public'
         OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = $4
            )
       )`,
    [orgId, projectId, isOrgWide, userId],
  );

  logger.info(
    { route: 'projects.model.getProjectById', orgId, projectId, found: result.rowCount },
    'Project lookup complete',
  );
  return result.rows[0] ?? null;
}

/**
 * Admin-bypass lookup used for existence checks before write paths run their
 * own RBAC gate. Returns the project row regardless of visibility, so long as
 * it belongs to `orgId`. Never expose this in a GET handler without first
 * gating on org role.
 */
export async function getProjectByIdInternal(
  orgId: string,
  projectId: number,
): Promise<ProjectRow | null> {
  logger.info(
    { route: 'projects.model.getProjectByIdInternal', orgId, projectId },
    'Fetching project (org-internal, no visibility filter)',
  );

  const result = await pool.query<ProjectRow>(
    `SELECT ${PROJECT_COLS_PREFIXED}
     FROM projects p
     WHERE p.org_id = $1 AND p.id = $2`,
    [orgId, projectId],
  );

  logger.info(
    { route: 'projects.model.getProjectByIdInternal', orgId, projectId, found: result.rowCount },
    'Internal project lookup complete',
  );
  return result.rows[0] ?? null;
}

// ── Project - members of one project (with org role joined) ─────────────────

export async function getProjectMembers(
  orgId: string,
  projectId: number,
): Promise<OrgMemberRow[]> {
  logger.info(
    { route: 'projects.model.getProjectMembers', orgId, projectId },
    'Querying project members with org role',
  );

  const result = await pool.query<OrgMemberRow>(
    `SELECT
       u.id, u.name, u.email,
       uo.role, uo.role_label
     FROM project_members pm
     JOIN users     u  ON u.id  = pm.user_id
     JOIN user_orgs uo ON uo.user_id = pm.user_id AND uo.org_id = $1
     WHERE pm.project_id = $2
     ORDER BY u.name ASC NULLS LAST, u.email ASC`,
    [orgId, projectId],
  );

  logger.info(
    { route: 'projects.model.getProjectMembers', orgId, projectId, count: result.rows.length },
    'Project members query returned',
  );
  return result.rows;
}

// ── Project - ticket count + last activity for a single project ─────────────

export async function getProjectActivity(
  orgId: string,
  projectId: number,
): Promise<{ ticketCount: number; activeSprintName: string | null; lastActive: Date }> {
  logger.info(
    { route: 'projects.model.getProjectActivity', orgId, projectId },
    'Fetching project activity rollup',
  );

  const result = await pool.query<{
    ticket_count: number;
    active_sprint_name: string | null;
    last_active: Date;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM tickets t WHERE t.project_id = $2)::INT AS ticket_count,
       (SELECT s.name FROM sprints s
        WHERE s.project_id = $2 AND s.status = 'active' LIMIT 1)     AS active_sprint_name,
       COALESCE(
         (SELECT MAX(t.updated_at) FROM tickets t WHERE t.project_id = $2),
         (SELECT p.updated_at FROM projects p WHERE p.id = $2 AND p.org_id = $1)
       )                                                              AS last_active`,
    [orgId, projectId],
  );

  const row = result.rows[0]!;
  logger.info(
    { route: 'projects.model.getProjectActivity', orgId, projectId, ticketCount: row.ticket_count, activeSprintName: row.active_sprint_name },
    'Project activity rollup complete',
  );
  return {
    ticketCount: row.ticket_count,
    activeSprintName: row.active_sprint_name,
    lastActive: row.last_active,
  };
}

// ── Project - create (transaction: insert + add creator as member) ──────────

export async function createProject(
  orgId: string,
  creatorId: string,
  name: string,
  key: string,
  description: string | null,
  visibility: 'public' | 'private',
  avatarType: 'initials' | 'icon' = 'initials',
  avatarValue: string | null = null,
): Promise<ProjectRow> {
  logger.info(
    { route: 'projects.model.createProject', orgId, creatorId, key, visibility, avatarType },
    'Creating project (txn: insert + creator-as-member)',
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query<ProjectRow>(
      `INSERT INTO projects (org_id, name, key, description, visibility, created_by, avatar_type, avatar_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${PROJECT_COLS}`,
      [orgId, name, key, description, visibility, creatorId, avatarType, avatarValue],
    );
    const project = inserted.rows[0]!;
    logger.info(
      { route: 'projects.model.createProject', orgId, projectId: project.id, key },
      'INSERT projects ok',
    );

    await client.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)',
      [project.id, creatorId],
    );
    logger.info(
      { route: 'projects.model.createProject', orgId, projectId: project.id, creatorId },
      'INSERT project_members (creator) ok',
    );

    await client.query('COMMIT');
    logger.info(
      { route: 'projects.model.createProject', orgId, projectId: project.id },
      'Project creation transaction committed',
    );
    return project;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      { route: 'projects.model.createProject', orgId, creatorId, key, error: (err as Error).message },
      'Project creation transaction rolled back',
    );
    throw err;
  } finally {
    client.release();
  }
}

// ── Project - update (dynamic SET on whitelisted fields) ────────────────────

export async function updateProject(
  orgId: string,
  projectId: number,
  updates: {
    name?: string;
    description?: string | null;
    visibility?: 'public' | 'private';
    archived?: boolean;
    avatarType?: 'initials' | 'icon';
    avatarValue?: string | null;
  },
): Promise<ProjectRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.name        !== undefined) { fields.push(`name = $${i++}`);        values.push(updates.name); }
  if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description); }
  if (updates.visibility  !== undefined) { fields.push(`visibility = $${i++}`);  values.push(updates.visibility); }
  if (updates.avatarType  !== undefined) { fields.push(`avatar_type = $${i++}`);  values.push(updates.avatarType); }
  if (updates.avatarValue !== undefined) { fields.push(`avatar_value = $${i++}`); values.push(updates.avatarValue); }
  if (updates.archived    !== undefined) {
    fields.push(`archived = $${i++}`);
    values.push(updates.archived);
    // Sync archived_at with the boolean. Setting NOW() on archive gives us
    // the audit timestamp (display deferred to v3 per the v1-fixes batch);
    // clearing to NULL on unarchive lets the column re-fill cleanly on the
    // next archive. No conditional expression needed - write both fields.
    fields.push(`archived_at = ${updates.archived ? 'NOW()' : 'NULL'}`);
  }

  fields.push('updated_at = NOW()');
  values.push(orgId);
  values.push(projectId);

  logger.info(
    { route: 'projects.model.updateProject', orgId, projectId, fields: Object.keys(updates) },
    'Updating project',
  );

  const result = await pool.query<ProjectRow>(
    `UPDATE projects SET ${fields.join(', ')}
     WHERE org_id = $${i++} AND id = $${i}
     RETURNING ${PROJECT_COLS}`,
    values,
  );

  logger.info(
    { route: 'projects.model.updateProject', orgId, projectId, updated: result.rowCount },
    'Update project complete',
  );
  return result.rows[0] ?? null;
}

// ── Project - delete ────────────────────────────────────────────────────────

export async function deleteProject(orgId: string, projectId: number): Promise<boolean> {
  logger.info(
    { route: 'projects.model.deleteProject', orgId, projectId },
    'Deleting project (cascades to project_members/sprints/tickets/comments/history)',
  );

  const result = await pool.query(
    'DELETE FROM projects WHERE org_id = $1 AND id = $2 RETURNING id',
    [orgId, projectId],
  );

  logger.info(
    { route: 'projects.model.deleteProject', orgId, projectId, deleted: result.rowCount },
    'Project delete complete',
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Project - key collision check (org-scoped per Q13 UNIQUE constraint) ────

export async function projectKeyExists(orgId: string, key: string): Promise<boolean> {
  logger.info(
    { route: 'projects.model.projectKeyExists', orgId, key },
    'Checking project key uniqueness within org',
  );

  const result = await pool.query(
    'SELECT 1 FROM projects WHERE org_id = $1 AND key = $2',
    [orgId, key],
  );

  const exists = (result.rowCount ?? 0) > 0;
  logger.info(
    { route: 'projects.model.projectKeyExists', orgId, key, exists },
    'Project key check complete',
  );
  return exists;
}

// ── Members ─────────────────────────────────────────────────────────────────

export async function addProjectMember(
  orgId: string,
  projectId: number,
  targetUserId: string,
): Promise<void> {
  logger.info(
    { route: 'projects.model.addProjectMember', orgId, projectId, targetUserId },
    'Adding project member',
  );

  await pool.query(
    'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)',
    [projectId, targetUserId],
  );

  logger.info(
    { route: 'projects.model.addProjectMember', orgId, projectId, targetUserId },
    'Project member added',
  );
}

export async function removeProjectMember(
  orgId: string,
  projectId: number,
  targetUserId: string,
): Promise<boolean> {
  logger.info(
    { route: 'projects.model.removeProjectMember', orgId, projectId, targetUserId },
    'Removing project member',
  );

  // org_id is bound through projects FK - we re-confirm by joining to
  // projects so this can never affect a project from another org even if a
  // controller bug were to pass a mismatched projectId.
  const result = await pool.query(
    `DELETE FROM project_members
     USING projects
     WHERE project_members.project_id = projects.id
       AND projects.org_id   = $1
       AND projects.id       = $2
       AND project_members.user_id = $3
     RETURNING project_members.user_id`,
    [orgId, projectId, targetUserId],
  );

  logger.info(
    { route: 'projects.model.removeProjectMember', orgId, projectId, targetUserId, removed: result.rowCount },
    'Project member removal complete',
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isProjectMember(
  orgId: string,
  projectId: number,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE p.org_id     = $1
       AND pm.project_id = $2
       AND pm.user_id    = $3`,
    [orgId, projectId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Validate that a target user is a member of the *current org* before
 * adding them to a project. Org-scoped - we never want to add cross-org
 * users as project members. Returns the org-membership row if present.
 */
export async function findOrgMemberById(
  orgId: string,
  targetUserId: string,
): Promise<{ id: string; name: string | null; email: string } | null> {
  logger.info(
    { route: 'projects.model.findOrgMemberById', orgId, targetUserId },
    'Looking up target user as org member',
  );

  const result = await pool.query<{ id: string; name: string | null; email: string }>(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN user_orgs uo ON uo.user_id = u.id
     WHERE uo.org_id = $1 AND u.id = $2`,
    [orgId, targetUserId],
  );

  logger.info(
    { route: 'projects.model.findOrgMemberById', orgId, targetUserId, found: result.rowCount },
    'Org-member lookup complete',
  );
  return result.rows[0] ?? null;
}
