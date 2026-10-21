import pool from '../../config/db';
import logger from '../../config/logger';

// ── Burndown ─────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

/**
 * Daily burndown for a sprint within the caller's org. For each day from
 * sprint start to sprint end (or today, for an active sprint), count tickets
 * that were NOT yet 'done' at end-of-day. Status changes come from
 * ticket_status_history; ticket creation timestamps gate "in the sprint yet".
 */
export async function getBurndownData(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<{ points: BurndownPoint[]; startDate: string; endDate: string; totalTickets: number }> {
  logger.info(
    { route: 'reports.model.getBurndownData', orgId, projectId, sprintId },
    'Building burndown data',
  );

  const sprintResult = await pool.query<{
    start_date: Date | null;
    end_date: Date | null;
    status: string;
  }>(
    `SELECT start_date, end_date, status
     FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND id = $3`,
    [orgId, projectId, sprintId],
  );
  const sprint = sprintResult.rows[0];
  if (!sprint || !sprint.start_date) {
    logger.info(
      { route: 'reports.model.getBurndownData', orgId, projectId, sprintId, reason: !sprint ? 'no-sprint' : 'no-start-date' },
      'No burndown - empty result',
    );
    return { points: [], startDate: '', endDate: '', totalTickets: 0 };
  }

  const startDate = sprint.start_date;
  const endDate = sprint.end_date ?? new Date();
  const today = new Date();
  const lastDate = sprint.status === 'active'
    ? (today < endDate ? today : endDate)
    : endDate;

  const ticketsResult = await pool.query<{ id: number; created_at: Date; status: string }>(
    `SELECT DISTINCT t.id, t.created_at, t.status
     FROM tickets t
     WHERE t.org_id = $1 AND t.sprint_id = $2 AND t.project_id = $3`,
    [orgId, sprintId, projectId],
  );
  const sprintTickets = ticketsResult.rows;
  const totalTickets = sprintTickets.length;

  if (totalTickets === 0) {
    return {
      points: [],
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      totalTickets: 0,
    };
  }

  const ticketIds = sprintTickets.map(t => t.id);
  const historyResult = await pool.query<{ ticket_id: number; new_status: string; changed_at: Date }>(
    `SELECT ticket_id, new_status, changed_at
     FROM ticket_status_history
     WHERE org_id = $1 AND ticket_id = ANY($2)
     ORDER BY changed_at ASC`,
    [orgId, ticketIds],
  );

  const historyMap = new Map<number, { status: string; at: Date }[]>();
  for (const row of historyResult.rows) {
    if (!historyMap.has(row.ticket_id)) historyMap.set(row.ticket_id, []);
    historyMap.get(row.ticket_id)!.push({ status: row.new_status, at: row.changed_at });
  }

  const points: BurndownPoint[] = [];
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const currentDay = new Date(startDate);
  currentDay.setHours(23, 59, 59, 999);

  let dayIndex = 0;
  while (currentDay <= lastDate || dayIndex === 0) {
    let remaining = 0;
    for (const ticket of sprintTickets) {
      const changes = historyMap.get(ticket.id) ?? [];
      let latestStatus: string | null = null;
      for (const change of changes) {
        if (change.at <= currentDay) latestStatus = change.status;
      }
      if (latestStatus === null) {
        if (ticket.created_at > currentDay) continue;
        latestStatus = 'todo';
      }
      if (latestStatus !== 'done') remaining++;
    }

    const ideal = totalDays > 0
      ? Math.round(totalTickets * (1 - dayIndex / totalDays) * 100) / 100
      : 0;

    points.push({
      date: currentDay.toISOString().slice(0, 10),
      remaining,
      ideal: Math.max(0, ideal),
    });

    dayIndex++;
    currentDay.setDate(currentDay.getDate() + 1);
    currentDay.setHours(23, 59, 59, 999);
  }

  logger.info(
    { route: 'reports.model.getBurndownData', orgId, projectId, sprintId, points: points.length, totalTickets },
    'Burndown data built',
  );
  return {
    points,
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    totalTickets,
  };
}

// ── Sprint Report ────────────────────────────────────────────────────────────

export interface SprintReportTicket {
  id: number;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee_name: string | null;
}

export interface SprintReportData {
  sprintName: string;
  sprintStatus: string;
  startDate: string;
  endDate: string;
  completed: SprintReportTicket[];
  incomplete: SprintReportTicket[];
  removed: SprintReportTicket[];
}

export async function getSprintReportData(
  orgId: string,
  projectId: number,
  sprintId: number,
): Promise<SprintReportData | null> {
  logger.info(
    { route: 'reports.model.getSprintReportData', orgId, projectId, sprintId },
    'Building sprint report',
  );

  const sprintResult = await pool.query<{
    name: string; status: string; start_date: Date | null; end_date: Date | null;
  }>(
    `SELECT name, status, start_date, end_date
     FROM sprints
     WHERE org_id = $1 AND project_id = $2 AND id = $3`,
    [orgId, projectId, sprintId],
  );
  const sprint = sprintResult.rows[0];
  if (!sprint) {
    logger.info({ route: 'reports.model.getSprintReportData', orgId, projectId, sprintId }, 'Sprint not found');
    return null;
  }

  const ticketsResult = await pool.query<SprintReportTicket>(
    `SELECT t.id, t.key, t.title, t.type, t.status, t.priority, a.name AS assignee_name
     FROM tickets t
     LEFT JOIN users a ON a.id = t.assignee_id
     WHERE t.org_id = $1 AND t.sprint_id = $2 AND t.project_id = $3
     ORDER BY t.key ASC`,
    [orgId, sprintId, projectId],
  );

  const completed  = ticketsResult.rows.filter(t => t.status === 'done');
  const incomplete = ticketsResult.rows.filter(t => t.status !== 'done');

  const removedResult = await pool.query<SprintReportTicket>(
    `SELECT DISTINCT t.id, t.key, t.title, t.type, t.status, t.priority, a.name AS assignee_name
     FROM ticket_status_history tsh
     JOIN tickets t ON t.id = tsh.ticket_id
     LEFT JOIN users a ON a.id = t.assignee_id
     WHERE tsh.org_id = $1
       AND tsh.sprint_id = $2
       AND t.org_id = $1
       AND t.project_id = $3
       AND (t.sprint_id IS NULL OR t.sprint_id != $2)
     ORDER BY t.key ASC`,
    [orgId, sprintId, projectId],
  );

  logger.info(
    {
      route: 'reports.model.getSprintReportData', orgId, projectId, sprintId,
      completed: completed.length, incomplete: incomplete.length, removed: removedResult.rows.length,
    },
    'Sprint report built',
  );

  return {
    sprintName: sprint.name,
    sprintStatus: sprint.status,
    startDate: sprint.start_date?.toISOString().slice(0, 10) ?? '',
    endDate: sprint.end_date?.toISOString().slice(0, 10) ?? '',
    completed,
    incomplete,
    removed: removedResult.rows,
  };
}

// ── Velocity ─────────────────────────────────────────────────────────────────

export interface VelocityPoint {
  sprintId: number;
  sprintName: string;
  committed: number;
  completed: number;
  status: string;
}

export async function getVelocityData(orgId: string, projectId: number): Promise<VelocityPoint[]> {
  logger.info(
    { route: 'reports.model.getVelocityData', orgId, projectId },
    'Building velocity series',
  );

  const result = await pool.query<{
    id: number; name: string; status: string; total: number; done: number;
  }>(
    `SELECT
       s.id, s.name, s.status,
       COUNT(t.id)::INT                              AS total,
       COUNT(t.id) FILTER (WHERE t.status = 'done')::INT AS done
     FROM sprints s
     LEFT JOIN tickets t ON t.sprint_id = s.id AND t.org_id = s.org_id
     WHERE s.org_id = $1 AND s.project_id = $2
     GROUP BY s.id, s.name, s.status
     ORDER BY s.created_at ASC`,
    [orgId, projectId],
  );

  logger.info(
    { route: 'reports.model.getVelocityData', orgId, projectId, sprints: result.rows.length },
    'Velocity built',
  );

  return result.rows.map(r => ({
    sprintId: r.id,
    sprintName: r.name,
    committed: r.total,
    completed: r.done,
    status: r.status,
  }));
}
