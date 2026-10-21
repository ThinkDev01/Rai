import type { Response } from 'express';
import logger from '../../config/logger';
import pool from '../../config/db';
import { getAuthService } from '../auth/auth.factory';
import { sendEmail } from '../email/email.service';
import { inviteEmail } from '../email/templates/invite.template';
import {
  insertInviteWithSupersede,
  listPendingInvitesForOrg,
  findInviteById,
  findInviteByToken,
  revokeInvite,
  acceptInviteTxn,
  getCallerRoleInOrg,
  getOrgSliver,
  generateInviteToken,
  INVITE_TTL_DAYS,
} from './invites.model';
import { findUserByEmail } from '../auth/auth.model';
import { notify } from '../notifications/notifications.service';
import type {
  InvitableRole,
  CreateInviteResponse,
  AcceptInviteResponse,
  PreviewInviteResponse,
} from './invites.types';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { param } from '../../types/common.types';
import type { Request } from 'express';

const ROUTE_ORGS_INVITES        = '/api/v1/orgs/:id/invites';
const ROUTE_INVITES_REVOKE      = '/api/v1/invites/:id/revoke';
const ROUTE_INVITES_ACCEPT      = '/api/v1/invites/accept';
const ROUTE_INVITES_PREVIEW     = '/api/v1/invites/preview/:token';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: InvitableRole[] = ['admin', 'project_manager', 'user'];

/** Owner / admin / PM can invite + revoke (rbac.md:33-34). */
function canManageInvites(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'project_manager';
}

// ── POST /orgs/:id/invites ──────────────────────────────────────────────────
//
// Q6 + RF-12: validate input → role-check caller → pre-flight 409 if email
// already a member → INSERT with supersede in same txn → SES send (best-effort,
// failure surfaces to caller).
export async function createInvite(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId  = param(req, 'id');
  const userId = req.user!.id;

  // ── Validate ──────────────────────────────────────────────────────────────
  const { email: rawEmail, role: rawRole } = req.body as { email?: unknown; role?: unknown };

  if (typeof rawEmail !== 'string' || !EMAIL_REGEX.test(rawEmail.trim())) {
    res.status(400).json({ success: false, data: {}, error: 'Valid email is required' } satisfies ApiResponse);
    return;
  }
  const email = rawEmail.trim().toLowerCase();

  if (typeof rawRole !== 'string' || !VALID_ROLES.includes(rawRole as InvitableRole)) {
    res.status(400).json({ success: false, data: {}, error: 'Role must be admin, project_manager, or user' } satisfies ApiResponse);
    return;
  }
  const role = rawRole as InvitableRole;

  logger.info({ route: ROUTE_ORGS_INVITES, method: 'POST', userId, orgId, invitedEmail: email, role }, 'Create invite - start');

  // ── Role check ────────────────────────────────────────────────────────────
  let callerRole;
  try {
    callerRole = await getCallerRoleInOrg(userId, orgId);
  } catch (err) {
    logger.error({ route: ROUTE_ORGS_INVITES, userId, orgId, error: (err as Error).message }, 'Role lookup failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not verify org membership' } satisfies ApiResponse);
    return;
  }
  if (!canManageInvites(callerRole)) {
    logger.warn({ route: ROUTE_ORGS_INVITES, userId, orgId, callerRole }, 'Forbidden - caller cannot invite');
    res.status(403).json({ success: false, data: {}, error: 'You do not have permission to invite members' } satisfies ApiResponse);
    return;
  }

  // ── Pre-flight already-a-member check (RF-12 decision D) ──────────────────
  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      const existingRole = await getCallerRoleInOrg(existing.id, orgId);
      if (existingRole) {
        logger.info({ route: ROUTE_ORGS_INVITES, userId, orgId, invitedEmail: email }, 'Already a member - 409');
        res.status(409).json({ success: false, data: {}, error: `${email} is already a member of this org` } satisfies ApiResponse);
        return;
      }
    }
  } catch (err) {
    logger.error({ route: ROUTE_ORGS_INVITES, userId, orgId, error: (err as Error).message }, 'Pre-flight membership lookup failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not verify invitee status' } satisfies ApiResponse);
    return;
  }

  // ── Inserts (supersede + insert in same txn per RF-12) ────────────────────
  const token     = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  let invite;
  try {
    invite = await insertInviteWithSupersede({
      orgId, email, role, invitedBy: userId, token, expiresAt,
    });
  } catch (err) {
    logger.error({ route: ROUTE_ORGS_INVITES, userId, orgId, error: (err as Error).message }, 'Insert invite failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not create invite' } satisfies ApiResponse);
    return;
  }

  // ── Send email ────────────────────────────────────────────────────────────
  // If SES fails we delete the invite row + return the error - better than leaving
  // a token in the DB that the invitee will never see. Recoverable via Team-page
  // resend (which is just creating a fresh invite).
  const frontendBase = process.env['FRONTEND_BASE_URL'] ?? 'http://localhost:3000';
  const acceptUrl    = `${frontendBase}/invite/${token}`;

  // Look up org name + inviter info for the email body. Both should always
  // succeed at this point (we just verified the caller's role on this org).
  const [orgRow, inviterRow] = await Promise.all([
    getOrgSliver(orgId),
    pool.query<{ name: string | null; email: string }>(
      'SELECT name, email FROM users WHERE id = $1',
      [userId],
    ),
  ]);
  const orgName       = orgRow?.name ?? 'your organization';
  const inviterName   = inviterRow.rows[0]?.name?.trim() || (inviterRow.rows[0]?.email ?? 'A teammate').split('@')[0]!;
  const inviterEmail  = inviterRow.rows[0]?.email ?? '';

  const { subject, textBody, htmlBody } = inviteEmail({
    inviterName, inviterEmail, orgName, role, acceptUrl, expiresInDays: INVITE_TTL_DAYS,
  });

  try {
    await sendEmail({ to: email, subject, textBody, htmlBody });
  } catch (err) {
    // Roll back the invite row so the admin can retry cleanly.
    await pool.query('DELETE FROM invites WHERE id = $1', [invite.id]).catch(() => { /* swallow cleanup error */ });
    const errName = (err as { name?: string }).name ?? '';
    const isSandboxReject = errName === 'MessageRejected';
    const msg = isSandboxReject
      ? `Couldn't send email to ${email} - recipient not verified in SES sandbox. Verify the address in AWS Console first.`
      : 'Invite created but email delivery failed - please try again';
    logger.error({ route: ROUTE_ORGS_INVITES, userId, orgId, invitedEmail: email, errorName: errName }, 'Email send failed - invite rolled back');
    res.status(502).json({ success: false, data: {}, error: msg } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ROUTE_ORGS_INVITES, userId, orgId, inviteId: invite.id, invitedEmail: email }, 'Invite created + email sent');

  res.status(201).json({
    success: true,
    data: {
      invite: {
        id:            invite.id,
        invited_email: invite.invited_email,
        role:          invite.role,
        expires_at:    invite.expires_at,
      },
    },
    error: '',
  } satisfies ApiResponse<CreateInviteResponse>);
}

// ── GET /orgs/:id/invites?status=pending ────────────────────────────────────
export async function listPendingInvites(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId  = param(req, 'id');
  const userId = req.user!.id;

  logger.info({ route: ROUTE_ORGS_INVITES, method: 'GET', userId, orgId }, 'List pending invites - start');

  const callerRole = await getCallerRoleInOrg(userId, orgId).catch(() => null);
  if (!canManageInvites(callerRole)) {
    logger.warn({ route: ROUTE_ORGS_INVITES, userId, orgId, callerRole }, 'Forbidden - caller cannot list invites');
    res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
    return;
  }

  try {
    const invites = await listPendingInvitesForOrg(orgId);
    logger.info({ route: ROUTE_ORGS_INVITES, userId, orgId, count: invites.length }, 'List pending invites - success');
    res.status(200).json({ success: true, data: { invites }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE_ORGS_INVITES, userId, orgId, error: (err as Error).message }, 'List pending invites failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not load pending invites' } satisfies ApiResponse);
  }
}

// ── POST /invites/:id/revoke ────────────────────────────────────────────────
export async function revokeInviteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const inviteId = param(req, 'id');
  const userId   = req.user!.id;

  logger.info({ route: ROUTE_INVITES_REVOKE, method: 'POST', userId, inviteId }, 'Revoke invite - start');

  const invite = await findInviteById(inviteId).catch(() => null);
  if (!invite) {
    logger.warn({ route: ROUTE_INVITES_REVOKE, userId, inviteId }, 'Invite not found');
    res.status(404).json({ success: false, data: {}, error: 'Invite not found' } satisfies ApiResponse);
    return;
  }

  const callerRole = await getCallerRoleInOrg(userId, invite.org_id).catch(() => null);
  if (!canManageInvites(callerRole)) {
    logger.warn({ route: ROUTE_INVITES_REVOKE, userId, inviteId, orgId: invite.org_id, callerRole }, 'Forbidden - caller cannot revoke');
    res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
    return;
  }

  try {
    await revokeInvite(inviteId);
    logger.info({ route: ROUTE_INVITES_REVOKE, userId, inviteId, orgId: invite.org_id }, 'Invite revoked successfully');
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE_INVITES_REVOKE, userId, inviteId, error: (err as Error).message }, 'Revoke failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not revoke invite' } satisfies ApiResponse);
  }
}

// ── GET /invites/preview/:token (PUBLIC, no auth) ───────────────────────────
//
// Powers the "Join <org> as <role>?" confirm card on /invite/[token]. Returns
// only the public-safe fields - never the token, never the inviter id, never
// any membership list. Lifecycle state is collapsed to a single enum so the
// frontend renders one of four states without leaking timestamps.
export async function previewInviteHandler(req: Request, res: Response): Promise<void> {
  const token = param(req as AuthenticatedRequest, 'token');

  logger.info({ route: ROUTE_INVITES_PREVIEW, method: 'GET', userId: 'anonymous', tokenPrefix: token.slice(0, 8) }, 'Preview invite - start');

  if (!token) {
    logger.warn({ route: ROUTE_INVITES_PREVIEW }, 'Preview rejected - token missing');
    res.status(400).json({ success: false, data: {}, error: 'Token is required' } satisfies ApiResponse);
    return;
  }

  const invite = await findInviteByToken(token).catch(() => null);
  if (!invite) {
    logger.info({ route: ROUTE_INVITES_PREVIEW, tokenPrefix: token.slice(0, 8) }, 'Preview - token unknown');
    res.status(404).json({ success: false, data: {}, error: 'Invite link is invalid' } satisfies ApiResponse);
    return;
  }

  const org = await getOrgSliver(invite.org_id).catch(() => null);
  if (!org) {
    logger.warn({ route: ROUTE_INVITES_PREVIEW, inviteId: invite.id, orgId: invite.org_id }, 'Preview - org vanished');
    res.status(404).json({ success: false, data: {}, error: 'Organization no longer exists' } satisfies ApiResponse);
    return;
  }

  let state: PreviewInviteResponse['state'] = 'pending';
  if (invite.used_at)                       state = 'used';
  else if (invite.revoked_at)               state = 'revoked';
  else if (invite.expires_at <= new Date()) state = 'expired';

  logger.info({ route: ROUTE_INVITES_PREVIEW, inviteId: invite.id, orgId: invite.org_id, state, invitedEmail: invite.invited_email }, 'Preview invite - success');

  res.status(200).json({
    success: true,
    data: {
      org_name:      org.name,
      role:          invite.role,
      invited_email: invite.invited_email,
      state,
      expires_at:    invite.expires_at,
    },
    error: '',
  } satisfies ApiResponse<PreviewInviteResponse>);
}

// ── POST /invites/accept ────────────────────────────────────────────────────
//
// Caller is authenticated (authMiddleware ran). Body: { token }. Validates
// email match (invite was sent to a specific address), token freshness, then
// runs the accept transaction. Sets the new org as current via Cognito so the
// frontend's next /me sees the new currentOrgId.
export async function acceptInviteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId         = req.user!.id;
  const userEmail      = req.user!.email.toLowerCase();
  const externalAuthId = req.user!.externalAuthId;
  const { token: rawToken } = req.body as { token?: unknown };

  if (typeof rawToken !== 'string' || !rawToken) {
    res.status(400).json({ success: false, data: {}, error: 'Invite token is required' } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ROUTE_INVITES_ACCEPT, method: 'POST', userId }, 'Accept invite - start');

  const invite = await findInviteByToken(rawToken).catch(() => null);
  if (!invite) {
    res.status(404).json({ success: false, data: {}, error: 'Invite link is invalid' } satisfies ApiResponse);
    return;
  }

  // Lifecycle checks - one collapsed message, but the log captures which path.
  if (invite.used_at) {
    logger.info({ route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id }, 'Invite already used');
    res.status(410).json({ success: false, data: {}, error: 'This invite has already been used' } satisfies ApiResponse);
    return;
  }
  if (invite.revoked_at) {
    logger.info({ route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id }, 'Invite revoked');
    res.status(410).json({ success: false, data: {}, error: 'This invite has been revoked - ask for a new one' } satisfies ApiResponse);
    return;
  }
  if (invite.expires_at <= new Date()) {
    logger.info({ route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id }, 'Invite expired');
    res.status(410).json({ success: false, data: {}, error: 'This invite has expired - ask for a new one' } satisfies ApiResponse);
    return;
  }

  // Email match - invite is bound to the email it was sent to. Different account
  // logged in → reject so a forwarded link can't be redeemed by someone else.
  if (invite.invited_email.toLowerCase() !== userEmail) {
    logger.warn(
      { route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id, expected: invite.invited_email, actual: userEmail },
      'Invite email does not match logged-in user',
    );
    res.status(403).json({
      success: false,
      data: {},
      error: `This invite was sent to ${invite.invited_email}. Sign in with that email to accept.`,
    } satisfies ApiResponse);
    return;
  }

  // ── Accept (txn) ──────────────────────────────────────────────────────────
  try {
    await acceptInviteTxn({ inviteId: invite.id, userId, orgId: invite.org_id, role: invite.role });
  } catch (err) {
    logger.error({ route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id, error: (err as Error).message }, 'Accept txn failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not accept invite' } satisfies ApiResponse);
    return;
  }

  const orgRow = await getOrgSliver(invite.org_id).catch(() => null);
  if (!orgRow) {
    // Org row vanished between txn commit and response - shouldn't happen,
    // but degrade gracefully so the user knows the invite was accepted.
    res.status(200).json({
      success: true,
      data: { org: { id: invite.org_id, name: '', slug: '' }, mustRefreshToken: false },
      error: '',
    } satisfies ApiResponse<AcceptInviteResponse>);
    return;
  }

  // Notify the inviter that their invite was accepted (in-app + email).
  if (invite.invited_by && invite.invited_by !== userId) {
    const inviteeName = req.user!.name || userEmail.split('@')[0]!;
    void notify({
      userId: invite.invited_by,
      type: 'invite_accepted',
      orgId: invite.org_id,
      orgSlug: orgRow.slug,
      link: '/team',
      data: { inviteeName, orgName: orgRow.name },
    });
  }

  // Set as current org in Cognito - best-effort, same pattern as createOrg.
  let mustRefreshToken = false;
  try {
    await getAuthService().switchOrg(externalAuthId, invite.org_id);
    mustRefreshToken = true;
    logger.info({ route: ROUTE_INVITES_ACCEPT, userId, orgId: invite.org_id }, 'Cognito current_org_id set after accept');
  } catch (err) {
    logger.warn(
      { route: ROUTE_INVITES_ACCEPT, userId, orgId: invite.org_id, error: (err as Error).message },
      'switchOrg after accept failed - user can switch manually later',
    );
  }

  logger.info({ route: ROUTE_INVITES_ACCEPT, userId, inviteId: invite.id, orgId: invite.org_id }, 'Invite accepted');

  res.status(200).json({
    success: true,
    data: { org: orgRow, mustRefreshToken },
    error: '',
  } satisfies ApiResponse<AcceptInviteResponse>);
}
