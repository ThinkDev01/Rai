import type { Response } from 'express';
import logger from '../../config/logger';
import { getMembershipsForUser, updateUserName } from '../auth/auth.model';
import { getTicketsAssignedTo, shapeMyWorkItem } from '../users/users.service';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';

const ME = '/api/v1/me';
const ME_TICKETS = '/api/v1/me/tickets';

// Display-name bounds. 20 cap keeps sidebar / header / org-switcher row layouts
// predictable — a 100-char name fits via truncate but still bloats some chip
// widths and email-style mention rendering. 20 is a friendly upper bound that
// covers real names (first + last) without inviting display-breaking input.
const NAME_MIN = 2;
const NAME_MAX = 20;

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  logger.info({ route: ME, method: 'GET', userId: user.id }, 'Get /me - start');

  const memberships = await getMembershipsForUser(user.id);

  logger.info({ route: ME, userId: user.id, membershipsCount: memberships.length }, 'Get /me - success');

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        currentOrgId: user.currentOrgId,
      },
      memberships,
    },
    error: '',
  } satisfies ApiResponse);
}

// ── PATCH /api/v1/me ────────────────────────────────────────────────────────
//
// Profile updates. Today: name only. Cognito's `name` attribute is mostly
// internal to Cognito (signup display, Hosted UI); the source of truth for the
// app is `users.name` in our DB - that's what /me returns and what every UI
// renders. We don't sync Cognito on every name change to keep the path simple
// + avoid the Admin* IAM round-trip; if a Cognito-side display ever matters
// we'd add a backend AdminUpdateUserAttributes call here.
export async function patchMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { name: rawName } = req.body as { name?: unknown };

  logger.info({ route: ME, method: 'PATCH', userId: user.id }, 'Patch /me - start');

  if (typeof rawName !== 'string') {
    logger.warn({ route: ME, userId: user.id }, 'Patch /me - name missing or invalid type');
    res.status(400).json({ success: false, data: {}, error: 'Name is required' } satisfies ApiResponse);
    return;
  }

  const name = rawName.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    logger.warn({ route: ME, userId: user.id, length: name.length }, 'Patch /me - name length out of bounds');
    res.status(400).json({
      success: false,
      data: {},
      error: `Name must be ${NAME_MIN}-${NAME_MAX} characters`,
    } satisfies ApiResponse);
    return;
  }

  try {
    await updateUserName(user.id, name);
    logger.info({ route: ME, userId: user.id }, 'Patch /me - name updated');
  } catch (err) {
    logger.error({ route: ME, userId: user.id, error: (err as Error).message }, 'Patch /me - DB update failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not update profile' } satisfies ApiResponse);
    return;
  }

  res.status(200).json({
    success: true,
    data: { user: { id: user.id, email: user.email, emailVerified: user.emailVerified, name, currentOrgId: user.currentOrgId } },
    error: '',
  } satisfies ApiResponse);
}

// ── GET /api/v1/me/tickets ──────────────────────────────────────────────────
//
// All tickets assigned to me within my current org. Same model layer as
// /api/v1/users/:id/tickets - re-uses the visibility-aware filter so users
// only see tickets in projects they have access to.

export async function getMyTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { org_id, role } = req.context!;

  logger.info(
    { route: ME_TICKETS, method: 'GET', userId: user.id, orgId: org_id, role },
    'Get /me/tickets - start',
  );

  try {
    const isOrgWide = role === 'owner' || role === 'admin';
    const rows = await getTicketsAssignedTo(org_id, user.id, isOrgWide, user.id);
    const data = rows.map(shapeMyWorkItem);

    logger.info(
      { route: ME_TICKETS, userId: user.id, orgId: org_id, count: data.length },
      'Get /me/tickets - success',
    );
    res.status(200).json({ success: true, data, error: '' } satisfies ApiResponse<typeof data>);
  } catch (err) {
    logger.error(
      { route: ME_TICKETS, userId: user.id, orgId: org_id, error: (err as Error).message },
      'Get /me/tickets - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load your tickets' } satisfies ApiResponse);
  }
}
