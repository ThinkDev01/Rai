import type { Response } from 'express';
import logger from '../../config/logger';
import { searchTickets } from './search.model';
import type { ApiResponse, AuthenticatedRequest, OrgRole } from '../../types/common.types';
import { query as queryParam } from '../../types/common.types';

const ROUTE = '/api/v1/search';

const ROLE_DISPLAY: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  user: 'Member',
};

function computeInitials(name: string | null, email: string): string {
  const source = (name && name.trim()) ? name.trim() : email;
  const parts = source.split(/\s+/);
  return parts.length === 1
    ? (parts[0]?.[0] ?? '?').toUpperCase()
    : ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export async function searchHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { org_id, role } = req.context!;

  const q = queryParam(req, 'q').trim();
  logger.info(
    { route: ROUTE, method: 'GET', userId, orgId: org_id, role, qLength: q.length },
    'Search - start',
  );

  if (q.length < 2) {
    logger.info({ route: ROUTE, userId, orgId: org_id, qLength: q.length }, 'Reject - query too short');
    res.status(400).json({ success: false, data: [], error: 'Query must be at least 2 characters' } satisfies ApiResponse<[]>);
    return;
  }

  try {
    const rows = await searchTickets(org_id, userId, role, q);

    const data = rows.map(row => ({
      id:          String(row.id),
      key:         row.key,
      title:       row.title,
      type:        row.type,
      status:      row.status,
      priority:    row.priority,
      assignee:    row.assignee_id !== null && row.assignee_role !== null
        ? {
            id:        row.assignee_id,
            name:      row.assignee_name ?? row.assignee_email!,
            email:     row.assignee_email!,
            role_type: row.assignee_role,
            role_name: row.assignee_role_label ?? ROLE_DISPLAY[row.assignee_role],
            initials:  computeInitials(row.assignee_name, row.assignee_email!),
          }
        : null,
      projectId:   String(row.project_id),
      projectName: row.project_name,
      projectKey:  row.project_key,
    }));

    logger.info(
      { route: ROUTE, userId, orgId: org_id, q, count: data.length },
      'Search - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE, userId, orgId: org_id, q, error: (err as Error).message },
      'Search - DB error',
    );
    res.status(500).json({ success: false, data: [], error: 'Search failed' } satisfies ApiResponse<[]>);
  }
}
