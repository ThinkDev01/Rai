import pool from '../../config/db';
import logger from '../../config/logger';
import type { OrgRole } from '../../types/common.types';

export interface SearchRow {
  id: number;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_role: OrgRole | null;
  assignee_role_label: string | null;
  project_id: number;
  project_name: string;
  project_key: string;
}

/**
 * Search tickets by title or key - case-insensitive ILIKE.
 *
 * Org-scoped: only tickets where `t.org_id = $1` are returned. Visibility
 * filtering matches `getProjectById`:
 *   - owner / admin: every non-archived project in the org
 *   - PM / user:     project must be public OR caller must be a member
 *
 * Key matches rank first; otherwise sorted by most-recently-updated.
 * Capped at 20 rows (matches v1 Header search dropdown size).
 */
export async function searchTickets(
  orgId: string,
  userId: string,
  role: OrgRole,
  q: string,
): Promise<SearchRow[]> {
  const pattern = `%${q}%`;
  const isOrgWide = role === 'owner' || role === 'admin';

  logger.info(
    { route: 'search.model.searchTickets', orgId, userId, role, q, isOrgWide },
    'Searching tickets',
  );

  const result = await pool.query<SearchRow>(
    `SELECT
       t.id, t.key, t.title, t.type, t.status, t.priority,
       a.id          AS assignee_id,
       a.name        AS assignee_name,
       a.email       AS assignee_email,
       ao.role       AS assignee_role,
       ao.role_label AS assignee_role_label,
       p.id          AS project_id,
       p.name        AS project_name,
       p.key         AS project_key
     FROM tickets t
     JOIN      projects  p  ON p.id = t.project_id AND p.archived = false
     LEFT JOIN users     a  ON a.id = t.assignee_id
     LEFT JOIN user_orgs ao ON ao.user_id = t.assignee_id AND ao.org_id = $1
     WHERE t.org_id = $1
       AND (t.title ILIKE $2 OR t.key ILIKE $2)
       AND (
         $3
         OR p.visibility = 'public'
         OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = $4
            )
       )
     ORDER BY
       CASE WHEN t.key ILIKE $2 THEN 0 ELSE 1 END,
       t.updated_at DESC
     LIMIT 20`,
    [orgId, pattern, isOrgWide, userId],
  );

  logger.info(
    { route: 'search.model.searchTickets', orgId, userId, q, count: result.rows.length },
    'Search complete',
  );
  return result.rows;
}
