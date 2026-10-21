import pool from '../../config/db';

// Org data export - gathers every tenant-scoped row for one org into flat
// arrays (one per entity). Each query filters by org_id, so an export can only
// ever contain the caller's own org data. IDs are kept, plus a few resolved
// names/keys/emails so the export is human-readable without cross-referencing.

export interface ExportBundle {
  org:      Record<string, unknown> | null;
  members:  Record<string, unknown>[];
  projects: Record<string, unknown>[];
  sprints:  Record<string, unknown>[];
  tickets:  Record<string, unknown>[];
  comments: Record<string, unknown>[];
}

export async function gatherOrgExport(orgId: string): Promise<ExportBundle> {
  const [org, members, projects, sprints, tickets, comments] = await Promise.all([
    pool.query(
      `SELECT id, name, slug, subscription_status, created_at
         FROM organizations WHERE id = $1`,
      [orgId],
    ),
    pool.query(
      `SELECT u.id AS user_id, u.name, u.email, uo.role, uo.role_label, uo.joined_at
         FROM user_orgs uo
         JOIN users u ON u.id = uo.user_id
        WHERE uo.org_id = $1
        ORDER BY uo.joined_at ASC`,
      [orgId],
    ),
    pool.query(
      `SELECT id, key, name, description, visibility, archived, created_at
         FROM projects WHERE org_id = $1 ORDER BY id ASC`,
      [orgId],
    ),
    pool.query(
      `SELECT s.id, s.project_id, p.key AS project_key, s.name, s.status,
              s.start_date, s.end_date, s.goal, s.created_at
         FROM sprints s
         JOIN projects p ON p.id = s.project_id
        WHERE s.org_id = $1
        ORDER BY s.id ASC`,
      [orgId],
    ),
    pool.query(
      `SELECT t.id, t.key, p.key AS project_key, t.sprint_id, parent.key AS parent_key,
              t.title, t.type, t.status, t.priority,
              t.story_points, t.epic_name, t.epic_color,
              t.acceptance_criteria, t.steps_to_reproduce, t.environment,
              a.email AS assignee_email, r.email AS reporter_email,
              t.description, t.created_at, t.updated_at
         FROM tickets t
         JOIN projects p      ON p.id = t.project_id
         LEFT JOIN tickets parent ON parent.id = t.parent_id
         LEFT JOIN users a    ON a.id = t.assignee_id
         JOIN users r         ON r.id = t.reporter_id
        WHERE t.org_id = $1
        ORDER BY t.id ASC`,
      [orgId],
    ),
    pool.query(
      `SELECT c.id, c.ticket_id, t.key AS ticket_key, u.email AS author_email,
              c.content, c.parent_comment_id, c.created_at, c.edited_at
         FROM comments c
         JOIN users u   ON u.id = c.user_id
         JOIN tickets t ON t.id = c.ticket_id
        WHERE c.org_id = $1
        ORDER BY c.id ASC`,
      [orgId],
    ),
  ]);

  return {
    org:      org.rows[0] ?? null,
    members:  members.rows,
    projects: projects.rows,
    sprints:  sprints.rows,
    tickets:  tickets.rows,
    comments: comments.rows,
  };
}
