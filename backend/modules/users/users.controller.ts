import type { Response } from 'express';
import logger from '../../config/logger';
import { findOrgMember, getTicketsAssignedTo } from './users.model';
import type { ApiResponse, AuthenticatedRequest } from '../../types/common.types';
import { param } from '../../types/common.types';

const ROUTE = {
  USER_TICKETS: '/api/v1/users/:id/tickets',
};

/**
 * Map a UserTicketRow to v1's MyWorkItem nested shape - `{ ticket, project,
 * sprint }`. v2 keeps this exact shape so the existing My-Work page renders
 * unchanged across the multi-tenant migration. Re-exported via
 * `users.service.shapeMyWorkItem` for `/api/v1/me/tickets` to share.
 */
export function shapeMyWorkItem(row: import('./users.model').UserTicketRow) {
  return {
    ticket: {
      id:            String(row.id),
      key:           row.key,
      title:         row.title,
      description:   row.description,
      type:          row.type,
      status:        row.status,
      priority:      row.priority,
      assignee:      null,
      reporter:      null,
      parentKey:     null,
      subTicketKeys: [],
      comments:      [],
      sprintId:      row.sprint_id !== null ? String(row.sprint_id) : null,
      projectId:     String(row.project_id),
      createdAt:     row.created_at.toISOString(),
      updatedAt:     row.updated_at.toISOString(),
      // Convenience strings the v1 frontend reads directly.
      assigneeName:  row.assignee_name,
      reporterName:  row.reporter_name,
      // Caller's personal pin — My Work floats pinned tickets to the top.
      isPinned:      row.is_pinned,
    },
    project: {
      id:               String(row.project_id),
      name:             row.project_name,
      key:              row.project_key,
      description:      null,
      archived:         row.project_archived,
      visibility:       row.project_visibility,
      avatarType:       row.project_avatar_type,
      avatarValue:      row.project_avatar_value,
      ticketCount:      0,
      memberCount:      0,
      activeSprintName: null,
      lastActive:       row.updated_at.toISOString(),
    },
    sprint: {
      id:        row.sprint_id !== null ? String(row.sprint_id) : '',
      name:      row.sprint_name ?? 'Backlog',
      status:    row.sprint_status ?? 'planned',
      startDate: row.sprint_start_date?.toISOString() ?? '',
      endDate:   row.sprint_end_date?.toISOString()   ?? '',
    },
  };
}

// ── GET /api/v1/users/:id/tickets ────────────────────────────────────────────
// AI-agent / cross-project surface. Returns tickets assigned to the target
// user in the current org, filtered by what the *caller* can see (visibility).

export async function getUserTicketsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const { org_id, role } = req.context!;
  const targetUserId = param(req, 'id');

  logger.info(
    { route: ROUTE.USER_TICKETS, method: 'GET', userId: callerId, orgId: org_id, role, targetUserId },
    'Get user tickets - start',
  );

  if (!targetUserId) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid user id' } satisfies ApiResponse);
    return;
  }

  try {
    const target = await findOrgMember(org_id, targetUserId);
    if (!target) {
      logger.info(
        { route: ROUTE.USER_TICKETS, userId: callerId, orgId: org_id, targetUserId },
        'Target user not in this org - 404',
      );
      res.status(404).json({ success: false, data: {}, error: 'User not found in this organization' } satisfies ApiResponse);
      return;
    }

    const isOrgWide = role === 'owner' || role === 'admin';
    const rows = await getTicketsAssignedTo(org_id, callerId, isOrgWide, targetUserId);
    const data = rows.map(shapeMyWorkItem);

    logger.info(
      { route: ROUTE.USER_TICKETS, userId: callerId, orgId: org_id, targetUserId, count: data.length },
      'Get user tickets - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ROUTE.USER_TICKETS, userId: callerId, orgId: org_id, targetUserId, error: (err as Error).message },
      'Get user tickets - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load user tickets' } satisfies ApiResponse);
  }
}
