import pool from '../../config/db';
import logger from '../../config/logger';

/**
 * Row shape for the cross-project AI-agent / My-Work listing - every ticket
 * assigned to a target user in the current org. Carries enough project +
 * sprint context to render the My-Work groupings (by project / by sprint /
 * by status) without follow-up requests. Status sort matches v1:
 *   in_progress → in_review → todo → done, then `updated_at DESC`.
 */
export interface UserTicketRow {
  id: number;
  key: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  parent_id: number | null;
  sprint_id: number | null;
  project_id: number;
  created_at: Date;
  updated_at: Date;
  assignee_name: string | null;
  reporter_name: string | null;
  sprint_name: string | null;
  sprint_status: string | null;
  sprint_start_date: Date | null;
  sprint_end_date: Date | null;
  project_name: string;
  project_key: string;
  project_archived: boolean;
  project_visibility: 'public' | 'private';
  project_avatar_type: 'initials' | 'icon';
  project_avatar_value: string | null;
  /** Whether the caller has pinned this ticket in My Work. */
  is_pinned: boolean;
}

/**
 * Confirm a user belongs to the current org. Returns the row (with name +
 * email) when present. Cross-org lookups always return null - the org-scoped
 * JOIN on user_orgs is the wall.
 */
export async function findOrgMember(
  orgId: string,
  userId: string,
): Promise<{ id: string; name: string | null; email: string } | null> {
  const result = await pool.query<{ id: string; name: string | null; email: string }>(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN user_orgs uo ON uo.user_id = u.id
     WHERE uo.org_id = $1 AND u.id = $2`,
    [orgId, userId],
  );
  return result.rows[0] ?? null;
}

/**
 * All tickets assigned to `userId` within the current org, across every
 * project they have an assignment in. Visibility-aware:
 *   - owner/admin (isOrgWide=true): every non-archived project
 *   - PM/user:                       project must be public OR caller is a member
 * Ordering: status-priority sort, then updated_at DESC.
 */
export async function getTicketsAssignedTo(
  orgId: string,
  callerUserId: string,
  isOrgWide: boolean,
  targetUserId: string,
): Promise<UserTicketRow[]> {
  logger.info(
    { route: 'users.model.getTicketsAssignedTo', orgId, callerUserId, isOrgWide, targetUserId },
    'Listing assignee tickets in org',
  );

  const result = await pool.query<UserTicketRow>(
    `SELECT
       t.id, t.key, t.title, t.description, t.type, t.status, t.priority,
       t.parent_id, t.sprint_id, t.project_id, t.created_at, t.updated_at,
       a.name        AS assignee_name,
       r.name        AS reporter_name,
       s.name        AS sprint_name,
       s.status      AS sprint_status,
       s.start_date  AS sprint_start_date,
       s.end_date    AS sprint_end_date,
       p.name         AS project_name,
       p.key          AS project_key,
       p.archived     AS project_archived,
       p.visibility   AS project_visibility,
       p.avatar_type  AS project_avatar_type,
       p.avatar_value AS project_avatar_value,
       -- Caller's personal pin on this ticket (My Work quick-access). Always
       -- the *caller's* pin, never the target's — pins are a "me" concept.
       EXISTS (
         SELECT 1 FROM user_pins up
         WHERE up.user_id = $4 AND up.org_id = $1 AND up.ticket_id = t.id
       )             AS is_pinned
     FROM tickets t
     JOIN      projects p  ON p.id = t.project_id AND p.archived = false
     LEFT JOIN users    a  ON a.id = t.assignee_id
     LEFT JOIN users    r  ON r.id = t.reporter_id
     LEFT JOIN sprints  s  ON s.id = t.sprint_id AND s.org_id = t.org_id
     WHERE t.org_id = $1
       AND t.assignee_id = $2
       AND (
         $3
         OR p.visibility = 'public'
         OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = $4
            )
       )
     ORDER BY
       CASE t.status
         WHEN 'in_progress' THEN 0
         WHEN 'in_review'   THEN 1
         WHEN 'todo'        THEN 2
         ELSE 3
       END,
       t.updated_at DESC`,
    [orgId, targetUserId, isOrgWide, callerUserId],
  );

  logger.info(
    { route: 'users.model.getTicketsAssignedTo', orgId, targetUserId, count: result.rows.length },
    'Assignee tickets listing returned',
  );
  return result.rows;
}
