import type { Response } from 'express';
import logger from '../../config/logger';
import pool from '../../config/db';
import { getAuthService } from '../auth/auth.factory';
import {
  insertOrgWithOwner,
  listMembersForOrg,
  updateOrgName,
  updateOrgDiscoverable,
  updateMemberRole,
  removeMember,
  getMemberRole,
  transferOwnership,
  softDeleteOrg,
  restoreOrg,
  listDeletedOrgsForOwner,
  findOrgsByOwnerEmailDomain,
  ORG_RESTORE_WINDOW_DAYS,
} from './orgs.model';
import { getMembership } from '../auth/auth.model';
import { getOrgSliver } from '../invites/invites.model';
import { notify } from '../notifications/notifications.service';
import { verifyActionOtp } from '../otp/otp.service';
import { ensureTrialForOrg } from '../billing/billing.service';
import { TRIAL_DAYS } from '../billing/billing.types';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { param } from '../../types/common.types';
import type { CreateOrgResponse, UpdateOrgResponse } from './orgs.types';

const ORGS                = '/api/v1/orgs';
const ORGS_ID             = '/api/v1/orgs/:id';
const ORGS_MEMBERS        = '/api/v1/orgs/:id/members';
const ORGS_MEMBER         = '/api/v1/orgs/:id/members/:userId';
const ORGS_TRANSFER       = '/api/v1/orgs/:id/transfer-ownership';
const ORGS_LEAVE          = '/api/v1/orgs/:id/leave';
const ORGS_DELETE         = '/api/v1/orgs/:id';
const ORGS_RESTORE        = '/api/v1/orgs/:id/restore';
const ORGS_DELETED        = '/api/v1/orgs/deleted';
const ORGS_DISCOVER       = '/api/v1/orgs/discover-by-domain';

// Public-email-domain blocklist for the discover-by-domain endpoint. These
// addresses don't represent a "company" - hundreds of millions of unrelated
// users share each one, so the "an org with your email domain exists" hint
// would always fire and be useless. List is intentionally small (covers
// ~99% of consumer signup volume); add more if abuse logs surface them.
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'aol.com', 'mail.com', 'gmx.com', 'gmx.net',
  'zoho.com', 'fastmail.com', 'tutanota.com',
]);

const ASSIGNABLE_ROLES = ['admin', 'project_manager', 'user'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// Org name: 2-100 trimmed chars. Slug: lowercase alnum + hyphens, 2-50 chars,
// must start with a letter (so URLs like /orgs/123 don't collide with numeric IDs
// once vanity-slug routing lands per upgrades.md).
const NAME_MIN = 2;
const NAME_MAX = 100;
const SLUG_REGEX = /^[a-z][a-z0-9-]{1,49}$/;

// Custom role-label cap. 20 chars is the same friendly upper bound used for
// user display names — keeps chips inside the member row, the org switcher
// dropdown's role line, and the role badge column from blowing out.
const ROLE_LABEL_MAX = 20;

/** Roles that can edit org settings per docs/rbac.md (owner + admin). */
async function callerCanEditOrg(userId: string, orgId: string): Promise<boolean> {
  const res = await pool.query<{ role: string }>(
    'SELECT role FROM user_orgs WHERE user_id = $1 AND org_id = $2',
    [userId, orgId],
  );
  const role = res.rows[0]?.role;
  return role === 'owner' || role === 'admin';
}

export async function createOrg(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId         = req.user!.id;
  const externalAuthId = req.user!.externalAuthId;
  const { name, slug } = req.body as { name?: unknown; slug?: unknown };

  // ── Validation ────────────────────────────────────────────────────────────
  if (typeof name !== 'string') {
    res.status(400).json({ success: false, data: {}, error: 'Org name is required' } satisfies ApiResponse);
    return;
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed.length < NAME_MIN || nameTrimmed.length > NAME_MAX) {
    res.status(400).json({ success: false, data: {}, error: `Org name must be ${NAME_MIN}-${NAME_MAX} characters` } satisfies ApiResponse);
    return;
  }

  if (typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
    res.status(400).json({
      success: false,
      data: {},
      error: 'Org identifier must be 2-50 lowercase letters, numbers, or hyphens, starting with a letter',
    } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ORGS, method: 'POST', userId, slug }, 'Create org - start');

  // ── DB insert ─────────────────────────────────────────────────────────────
  let org;
  try {
    org = await insertOrgWithOwner(nameTrimmed, slug, userId);
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'uq_organizations_slug') {
      logger.warn({ route: ORGS, userId, slug }, 'Slug already taken');
      res.status(409).json({ success: false, data: {}, error: 'Org identifier is already taken' } satisfies ApiResponse);
      return;
    }
    logger.error(
      { route: ORGS, userId, slug, error: (err as Error).message, stack: (err as Error).stack },
      'Create org failed',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not create organization' } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ORGS, userId, orgId: org.id, slug }, 'Org created');

  // ── Start the 30-day free trial (subscriptions row) ───────────────────────
  // Best-effort: the org gate defaults to 'trial' regardless, and getSummary
  // lazily creates the row on first billing-page load — so a failure here never
  // blocks org creation or access.
  try {
    const sub = await ensureTrialForOrg(org.id);
    logger.info({ route: ORGS, userId, orgId: org.id }, 'Trial subscription created');

    // Welcome the owner with the trial details (in-app + email). notify() never
    // throws, so this can't affect org creation.
    if (sub?.trial_ends_at) {
      const trialEndsOn = new Date(sub.trial_ends_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      await notify({
        userId,
        type: 'trial_started',
        orgId: org.id,
        orgSlug: org.slug,
        link: '/settings/billing',
        data: { orgName: org.name, trialDays: TRIAL_DAYS, trialEndsOn },
      });
    }
  } catch (err) {
    logger.warn(
      { route: ORGS, userId, orgId: org.id, error: (err as Error).message },
      'Trial subscription create failed - will be created lazily on first billing load',
    );
  }

  // ── Set as current org in Cognito ─────────────────────────────────────────
  // Best-effort: failure doesn't block the response. The user already has the
  // membership in the DB; they can switch to it later via the switch-org flow.
  try {
    await getAuthService().switchOrg(externalAuthId, org.id);
    logger.info({ route: ORGS, userId, orgId: org.id }, 'Cognito current_org_id set');
  } catch (err) {
    logger.warn(
      { route: ORGS, userId, orgId: org.id, error: (err as Error).message },
      'switchOrg after createOrg failed - user can switch manually later',
    );
  }

  res.status(201).json({
    success: true,
    data: { org, mustRefreshToken: true },
    error: '',
  } satisfies ApiResponse<CreateOrgResponse>);
}

// ── PATCH /api/v1/orgs/:id ─────────────────────────────────────────────────
//
// Org settings update. Today: name only (slug intentionally locked - renaming
// breaks invite links + tenancy URLs; slug rename parked for v3 with redirects).
// Role-gated to owner + admin per rbac.md §Org-level actions ("Edit org settings").
export async function updateOrg(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId  = param(req, 'id');
  const userId = req.user!.id;
  const body   = req.body as { name?: unknown; discoverable?: unknown };

  // Two fields supported: `name` (owner+admin) and `discoverable` (owner-only).
  // Both optional; at least one must be present. Mixing both in one request
  // requires both gates.
  const hasName         = body.name !== undefined;
  const hasDiscoverable = body.discoverable !== undefined;

  logger.info(
    { route: ORGS_ID, method: 'PATCH', userId, orgId, hasName, hasDiscoverable },
    'Update org - start',
  );

  if (!hasName && !hasDiscoverable) {
    res.status(400).json({ success: false, data: {}, error: 'No editable fields provided' } satisfies ApiResponse);
    return;
  }

  // ── Resolve caller role for permission checks ────────────────────────────
  let callerRole;
  try {
    callerRole = await getMemberRole(orgId, userId);
  } catch (err) {
    logger.error({ route: ORGS_ID, userId, orgId, error: (err as Error).message }, 'Role lookup failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not verify permission' } satisfies ApiResponse);
    return;
  }
  if (!callerRole) {
    res.status(403).json({ success: false, data: {}, error: 'You do not have permission to edit this organization' } satisfies ApiResponse);
    return;
  }
  const isOwner       = callerRole === 'owner';
  const canEditName   = isOwner || callerRole === 'admin';

  // Track the latest org row across one or both updates. Whichever update
  // ran last gives the final state; if both ran, the last RETURNING wins.
  let latestOrg: import('./orgs.types').OrgRow | null = null;

  // ── Name change (owner + admin) ──────────────────────────────────────────
  if (hasName) {
    if (!canEditName) {
      res.status(403).json({ success: false, data: {}, error: 'Only owners and admins can rename the organization' } satisfies ApiResponse);
      return;
    }
    if (typeof body.name !== 'string') {
      res.status(400).json({ success: false, data: {}, error: 'Org name must be a string' } satisfies ApiResponse);
      return;
    }
    const name = body.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      res.status(400).json({
        success: false, data: {},
        error: `Org name must be ${NAME_MIN}-${NAME_MAX} characters`,
      } satisfies ApiResponse);
      return;
    }
    try {
      latestOrg = await updateOrgName(orgId, name);
      if (!latestOrg) {
        res.status(404).json({ success: false, data: {}, error: 'Organization not found' } satisfies ApiResponse);
        return;
      }
      logger.info({ route: ORGS_ID, userId, orgId, orgName: name }, 'Org name updated');
    } catch (err) {
      logger.error({ route: ORGS_ID, userId, orgId, error: (err as Error).message }, 'Update org name failed');
      res.status(500).json({ success: false, data: {}, error: 'Could not update organization' } satisfies ApiResponse);
      return;
    }
  }

  // ── Discoverable toggle (owner only) ──────────────────────────────────────
  if (hasDiscoverable) {
    if (!isOwner) {
      res.status(403).json({ success: false, data: {}, error: 'Only the owner can change discoverability' } satisfies ApiResponse);
      return;
    }
    if (typeof body.discoverable !== 'boolean') {
      res.status(400).json({ success: false, data: {}, error: 'discoverable must be a boolean' } satisfies ApiResponse);
      return;
    }
    try {
      latestOrg = await updateOrgDiscoverable(orgId, body.discoverable);
      if (!latestOrg) {
        res.status(404).json({ success: false, data: {}, error: 'Organization not found' } satisfies ApiResponse);
        return;
      }
      logger.info({ route: ORGS_ID, userId, orgId, discoverable: body.discoverable }, 'Org discoverable updated');
    } catch (err) {
      logger.error({ route: ORGS_ID, userId, orgId, error: (err as Error).message }, 'Update org discoverable failed');
      res.status(500).json({ success: false, data: {}, error: 'Could not update discoverability' } satisfies ApiResponse);
      return;
    }
  }

  if (!latestOrg) {
    // Defensive - validation above ensures at least one field, but the type
    // checker can't see that across branches.
    res.status(500).json({ success: false, data: {}, error: 'No updates applied' } satisfies ApiResponse);
    return;
  }
  res.status(200).json({ success: true, data: { org: latestOrg }, error: '' } satisfies ApiResponse<UpdateOrgResponse>);
}

// ── GET /api/v1/orgs/:id/members ────────────────────────────────────────────
//
// Anyone who is a member of the org can view the member list (Slack/Linear
// convention - knowing who's in the workspace isn't privileged information).
// No role gate beyond membership; only the standard cancelled-subscription
// gate from getMembership.
export async function listOrgMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orgId  = param(req, 'id');
  const userId = req.user!.id;

  logger.info({ route: ORGS_MEMBERS, method: 'GET', userId, orgId }, 'List org members - start');

  let membership;
  try {
    membership = await getMembership(userId, orgId);
  } catch (err) {
    logger.error({ route: ORGS_MEMBERS, userId, orgId, error: (err as Error).message }, 'Membership lookup failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not verify org membership' } satisfies ApiResponse);
    return;
  }

  if (!membership) {
    logger.warn({ route: ORGS_MEMBERS, userId, orgId }, 'Forbidden - caller is not a member of this org');
    res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ORGS_MEMBERS, userId, orgId }, 'Membership verified - querying DB');

  try {
    const members = await listMembersForOrg(orgId);
    logger.info({ route: ORGS_MEMBERS, userId, orgId, count: members.length }, 'List org members - success');
    res.status(200).json({ success: true, data: { members }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ORGS_MEMBERS, userId, orgId, error: (err as Error).message }, 'List members failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not load members' } satisfies ApiResponse);
  }
}

// ── PATCH /api/v1/orgs/:id/members/:userId ───────────────────────────────────
//
// Change another member's org role + display label. Per docs/rbac.md:
//   - Only owner / admin can change roles
//   - Owner role cannot be assigned or removed via this endpoint (ownership
//     transfer is a separate flow - Q11 / RF: stuck-owner)
//   - Cannot change your own role (prevents an admin from accidentally
//     demoting themselves out of the admin tier)

export async function updateMemberRoleHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');
  const targetId = param(req, 'userId');

  logger.info(
    { route: ORGS_MEMBER, method: 'PATCH', userId: callerId, orgId, targetUserId: targetId },
    'Update member role - start',
  );

  const { role_type: newRole, role_name: newRoleLabel } = (req.body ?? {}) as {
    role_type?: unknown;
    role_name?: unknown;
  };

  // Both fields are optional, but at least one must be present. role_type
  // accepts only assignable values when provided (owner is set via the
  // transfer-ownership flow, not here). role_name must be non-empty if set.
  if (newRole !== undefined && (typeof newRole !== 'string' || !(ASSIGNABLE_ROLES as readonly string[]).includes(newRole))) {
    logger.warn(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, role_type: newRole },
      'Reject - role_type must be one of admin/project_manager/user when provided',
    );
    res.status(400).json({
      success: false, data: {},
      error: `role_type must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
    } satisfies ApiResponse);
    return;
  }
  if (newRoleLabel !== undefined && newRoleLabel !== null && (typeof newRoleLabel !== 'string' || !newRoleLabel.trim())) {
    res.status(400).json({ success: false, data: {}, error: 'role_name must be a non-empty string when provided' } satisfies ApiResponse);
    return;
  }
  if (typeof newRoleLabel === 'string' && newRoleLabel.trim().length > ROLE_LABEL_MAX) {
    logger.warn(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, length: newRoleLabel.trim().length },
      'Patch member - role_name exceeds max length',
    );
    res.status(400).json({
      success: false, data: {},
      error: `role_name must be at most ${ROLE_LABEL_MAX} characters`,
    } satisfies ApiResponse);
    return;
  }
  if (newRole === undefined && newRoleLabel === undefined) {
    res.status(400).json({ success: false, data: {}, error: 'role_type or role_name is required' } satisfies ApiResponse);
    return;
  }

  // ── Authorization ────────────────────────────────────────────────────────
  try {
    const callerRole = await getMemberRole(orgId, callerId);
    if (!callerRole) {
      logger.warn({ route: ORGS_MEMBER, userId: callerId, orgId }, 'Caller is not a member of this org');
      res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
      return;
    }

    const targetRole = await getMemberRole(orgId, targetId);
    if (!targetRole) {
      res.status(404).json({ success: false, data: {}, error: 'Member not found in this org' } satisfies ApiResponse);
      return;
    }

    // Is the request actually trying to change the role TYPE, or just the
    // display label? The two cases have different rules.
    const isTypeChanging = newRole !== undefined && newRole !== targetRole;

    if (callerId === targetId) {
      // Self-update. Owner can rename "Founder" → "CEO" while staying owner.
      // Any tier can rename their own custom label. But NO ONE can change
      // their own role TYPE through this endpoint (admins demote via the
      // path goes through someone else; owner uses the transfer flow).
      if (isTypeChanging) {
        logger.warn(
          { route: ORGS_MEMBER, userId: callerId, orgId },
          'Reject - self role-type change (label-only self-edits are allowed)',
        );
        res.status(403).json({
          success: false, data: {},
          error: 'You can rename your own display label, but cannot change your own role type',
        } satisfies ApiResponse);
        return;
      }
    } else {
      // Editing someone else - same rules as before: owner/admin only.
      if (callerRole !== 'owner' && callerRole !== 'admin') {
        logger.warn({ route: ORGS_MEMBER, userId: callerId, orgId, callerRole }, 'Reject - only owner/admin can change others');
        res.status(403).json({ success: false, data: {}, error: 'Only owners and admins can change member roles' } satisfies ApiResponse);
        return;
      }
      // Owner target: type cannot be changed via this endpoint (transfer flow).
      // Label edits on the owner are NOT allowed from outside - owner controls
      // their own label, no one else can rewrite it.
      if (targetRole === 'owner') {
        logger.warn(
          { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, isTypeChanging },
          'Reject - owner row cannot be edited by another user (transfer ownership to take that seat)',
        );
        res.status(403).json({
          success: false, data: {},
          error: 'Owner row cannot be edited - transfer ownership to take that seat',
        } satisfies ApiResponse);
        return;
      }
    }

    // ── Apply ──────────────────────────────────────────────────────────────
    // Pass the EXISTING role through when only label is changing. This is
    // how owner-self-renaming works: the model writes role='owner' back
    // unchanged + role_label = new value.
    const effectiveRole = isTypeChanging ? (newRole as string) : targetRole;

    logger.info(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, isTypeChanging, from: targetRole, to: effectiveRole },
      'Authorization passed - writing update',
    );

    const updated = await updateMemberRole(
      orgId,
      targetId,
      effectiveRole as 'owner' | AssignableRole,
      typeof newRoleLabel === 'string' ? newRoleLabel.trim() : null,
    );
    if (!updated) {
      res.status(404).json({ success: false, data: {}, error: 'Member not found in this org' } satisfies ApiResponse);
      return;
    }

    // Notify the member their org role changed (in-app + email) — only on a real
    // role-TYPE change, not a label-only edit. Fire-and-forget.
    if (isTypeChanging) {
      const org = await getOrgSliver(orgId);
      void notify({
        userId: targetId,
        type: 'org_role_changed',
        orgId,
        orgSlug: org?.slug ?? null,
        link: '/team',
        data: { orgName: org?.name ?? 'your organization', roleType: effectiveRole },
      });
    }

    logger.info(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, from: targetRole, to: newRole },
      'Update member role - success',
    );
    res.status(200).json({ success: true, data: { member: updated }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, error: (err as Error).message },
      'Update member role - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not update role' } satisfies ApiResponse);
  }
}

// ── POST /api/v1/orgs/:id/transfer-ownership ─────────────────────────────────
//
// Ownership transfer per docs/rbac.md §Org-level actions. Only the current
// owner can call. Body: { recipientId: string }. The model layer wraps the
// demote+promote pair in a single transaction so the one-owner-per-org
// partial unique index always sees a consistent state on commit.
//
// Gated by an email OTP (action 'transfer_ownership', target = orgId): the
// caller must supply a code from POST /api/v1/otp/request before the transfer
// runs. Body: { recipientId: string, otpCode: string }.

export async function transferOwnershipHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');
  const { recipientId, otpCode } = (req.body ?? {}) as { recipientId?: unknown; otpCode?: unknown };

  logger.info(
    { route: ORGS_TRANSFER, method: 'POST', userId: callerId, orgId, recipientId },
    'Transfer ownership - start',
  );

  if (typeof recipientId !== 'string' || !recipientId.trim()) {
    logger.warn({ route: ORGS_TRANSFER, userId: callerId, orgId }, 'Reject - recipientId missing');
    res.status(400).json({ success: false, data: {}, error: 'recipientId is required' } satisfies ApiResponse);
    return;
  }

  if (callerId === recipientId) {
    logger.warn({ route: ORGS_TRANSFER, userId: callerId, orgId }, 'Reject - self-transfer');
    res.status(400).json({ success: false, data: {}, error: 'You are already the owner' } satisfies ApiResponse);
    return;
  }

  try {
    // Authorization: only current owner can transfer.
    const callerRole = await getMemberRole(orgId, callerId);
    if (callerRole !== 'owner') {
      logger.warn({ route: ORGS_TRANSFER, userId: callerId, orgId, callerRole }, 'Reject - caller is not owner');
      res.status(403).json({
        success: false, data: {},
        error: 'Only the current owner can transfer ownership',
      } satisfies ApiResponse);
      return;
    }

    // Sanity: recipient exists in this org.
    const recipientRole = await getMemberRole(orgId, recipientId);
    if (!recipientRole) {
      logger.warn(
        { route: ORGS_TRANSFER, userId: callerId, orgId, recipientId },
        'Reject - recipient is not a member of this org',
      );
      res.status(404).json({
        success: false, data: {},
        error: 'Recipient is not a member of this organization',
      } satisfies ApiResponse);
      return;
    }

    // OTP gate — verify the emailed code before the irreversible transfer.
    const otp = await verifyActionOtp(callerId, 'transfer_ownership', orgId, otpCode);
    if (!otp.ok) {
      res.status(otp.status).json({ success: false, data: {}, error: otp.error } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ORGS_TRANSFER, userId: callerId, orgId, recipientId, recipientRole },
      'Authorization + OTP passed - running atomic transfer',
    );

    await transferOwnership(orgId, callerId, recipientId);

    logger.info(
      { route: ORGS_TRANSFER, userId: callerId, orgId, recipientId },
      'Transfer ownership - success (caller demoted to admin, recipient promoted to owner)',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(
      { route: ORGS_TRANSFER, userId: callerId, orgId, recipientId, error: msg },
      'Transfer ownership - failed',
    );
    // Pass through the model's domain errors with 409, server failures with 500.
    if (msg === 'caller is no longer owner' || msg === 'recipient is not a member of this org' || msg === 'recipient is already the owner') {
      res.status(409).json({ success: false, data: {}, error: msg } satisfies ApiResponse);
      return;
    }
    res.status(500).json({ success: false, data: {}, error: 'Could not transfer ownership' } satisfies ApiResponse);
  }
}

// ── DELETE /api/v1/orgs/:id/members/:userId ──────────────────────────────────
//
// Remove a member from the org. Per docs/rbac.md:
//   - Only owner / admin can remove others
//   - Owner cannot be removed (ownership-transfer-first)
//   - Self-removal goes through a separate "leave org" flow (not implemented
//     here yet - owner-leaves policy locked in Q11)

export async function removeMemberHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');
  const targetId = param(req, 'userId');

  logger.info(
    { route: ORGS_MEMBER, method: 'DELETE', userId: callerId, orgId, targetUserId: targetId },
    'Remove member - start',
  );

  try {
    const callerRole = await getMemberRole(orgId, callerId);
    if (!callerRole) {
      res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
      return;
    }
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      logger.warn({ route: ORGS_MEMBER, userId: callerId, orgId, callerRole }, 'Reject - only owner/admin can remove members');
      res.status(403).json({ success: false, data: {}, error: 'Only owners and admins can remove members' } satisfies ApiResponse);
      return;
    }

    if (callerId === targetId) {
      logger.warn({ route: ORGS_MEMBER, userId: callerId, orgId }, 'Reject - self-removal via this endpoint');
      res.status(403).json({ success: false, data: {}, error: 'Use the Leave Organization flow to remove yourself' } satisfies ApiResponse);
      return;
    }

    const targetRole = await getMemberRole(orgId, targetId);
    if (!targetRole) {
      res.status(404).json({ success: false, data: {}, error: 'Member not found in this org' } satisfies ApiResponse);
      return;
    }
    if (targetRole === 'owner') {
      logger.warn({ route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId }, 'Reject - cannot remove owner');
      res.status(403).json({
        success: false, data: {},
        error: 'Owner cannot be removed - transfer ownership first',
      } satisfies ApiResponse);
      return;
    }

    const removed = await removeMember(orgId, targetId);
    if (!removed) {
      res.status(404).json({ success: false, data: {}, error: 'Member not found in this org' } satisfies ApiResponse);
      return;
    }

    // Notify the removed member (always email — system-critical). No link.
    const removedOrg = await getOrgSliver(orgId);
    void notify({
      userId: targetId,
      type: 'org_member_removed',
      orgId,
      orgSlug: removedOrg?.slug ?? null,
      link: null,
      data: { orgName: removedOrg?.name ?? 'the organization' },
    });

    logger.info(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, formerRole: targetRole },
      'Remove member - success',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ORGS_MEMBER, userId: callerId, orgId, targetUserId: targetId, error: (err as Error).message },
      'Remove member - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not remove member' } satisfies ApiResponse);
  }
}

/**
 * POST /api/v1/orgs/:id/leave - user-initiated org exit.
 *
 * Owners cannot leave directly - they must transfer ownership first. This
 * preserves the "every org always has exactly one owner" invariant enforced
 * by the partial unique index `one_owner_per_org`.
 *
 * Frontend flow: Settings -> Danger zone -> "Leave organization" button ->
 * confirm modal -> POST here -> on success, frontend navigates to /welcome
 * (or another org's dashboard if memberships > 0).
 */
export async function leaveOrgHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');

  logger.info(
    { route: ORGS_LEAVE, method: 'POST', userId: callerId, orgId },
    'Leave org - start',
  );

  try {
    const callerRole = await getMemberRole(orgId, callerId);
    if (!callerRole) {
      res.status(404).json({ success: false, data: {}, error: 'You are not a member of this organization' } satisfies ApiResponse);
      return;
    }
    if (callerRole === 'owner') {
      logger.warn({ route: ORGS_LEAVE, userId: callerId, orgId }, 'Reject - owner cannot leave without transfer');
      res.status(403).json({
        success: false, data: {},
        error: 'Owners cannot leave - transfer ownership to another member first',
      } satisfies ApiResponse);
      return;
    }

    const removed = await removeMember(orgId, callerId);
    if (!removed) {
      res.status(404).json({ success: false, data: {}, error: 'Membership not found' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ORGS_LEAVE, userId: callerId, orgId, formerRole: callerRole },
      'Leave org - success',
    );
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ORGS_LEAVE, userId: callerId, orgId, error: (err as Error).message },
      'Leave org - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not leave organization' } satisfies ApiResponse);
  }
}

/**
 * DELETE /api/v1/orgs/:id - owner-only org deletion (soft delete / recycle bin).
 *
 * Stamps `deleted_at` instead of cascading a hard wipe. The org + all its data
 * vanish from the app immediately (every membership query filters
 * `deleted_at IS NULL`) but stay recoverable for ORG_RESTORE_WINDOW_DAYS via
 * POST /:id/restore. The actual CASCADE wipe happens later in
 * scripts/purge-orgs.ts once the window lapses.
 *
 * Backend gate: caller must be the org's owner AND supply a valid email OTP
 * (action 'delete_org', target = orgId). Body: { otpCode: string }.
 */
export async function deleteOrgHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');
  const { otpCode } = (req.body ?? {}) as { otpCode?: unknown };

  logger.info(
    { route: ORGS_DELETE, method: 'DELETE', userId: callerId, orgId },
    'Soft-delete org - start',
  );

  try {
    const callerRole = await getMemberRole(orgId, callerId);
    if (!callerRole) {
      res.status(403).json({ success: false, data: {}, error: 'Forbidden' } satisfies ApiResponse);
      return;
    }
    if (callerRole !== 'owner') {
      logger.warn({ route: ORGS_DELETE, userId: callerId, orgId, callerRole }, 'Reject - only owner can delete org');
      res.status(403).json({
        success: false, data: {},
        error: 'Only the owner can delete this organization',
      } satisfies ApiResponse);
      return;
    }

    // OTP gate — verify the emailed code before the (recoverable but high-impact)
    // soft-delete runs.
    const otp = await verifyActionOtp(callerId, 'delete_org', orgId, otpCode);
    if (!otp.ok) {
      res.status(otp.status).json({ success: false, data: {}, error: otp.error } satisfies ApiResponse);
      return;
    }

    const deleted = await softDeleteOrg(orgId, callerId);
    if (!deleted) {
      // Either gone, or already soft-deleted (idempotent guard didn't match).
      logger.warn({ route: ORGS_DELETE, userId: callerId, orgId }, 'Soft-delete org - nothing to delete (missing or already deleted)');
      res.status(404).json({ success: false, data: {}, error: 'Organization not found' } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ORGS_DELETE, userId: callerId, orgId, restoreWindowDays: ORG_RESTORE_WINDOW_DAYS },
      'Soft-delete org - success (recoverable within window)',
    );
    res.status(200).json({
      success: true,
      data: { restoreWindowDays: ORG_RESTORE_WINDOW_DAYS },
      error: '',
    } satisfies ApiResponse<{ restoreWindowDays: number }>);
  } catch (err) {
    logger.error(
      { route: ORGS_DELETE, userId: callerId, orgId, error: (err as Error).message },
      'Soft-delete org - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not delete organization' } satisfies ApiResponse);
  }
}

/**
 * POST /api/v1/orgs/:id/restore - owner-only restore of a soft-deleted org.
 *
 * Brings a recycle-binned org back, but only while it's inside the recovery
 * window. Auth uses getMemberRole (reads user_orgs directly, so it still works
 * on a soft-deleted org whose membership rows are intact) - getMembership can't
 * be used here because it filters out deleted orgs by design.
 */
export async function restoreOrgHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;
  const orgId    = param(req, 'id');

  logger.info(
    { route: ORGS_RESTORE, method: 'POST', userId: callerId, orgId },
    'Restore org - start',
  );

  try {
    // Membership rows survive soft-delete, so the owner check works as normal.
    const callerRole = await getMemberRole(orgId, callerId);
    if (callerRole !== 'owner') {
      logger.warn({ route: ORGS_RESTORE, userId: callerId, orgId, callerRole }, 'Reject - only owner can restore org');
      res.status(403).json({
        success: false, data: {},
        error: 'Only the owner can restore this organization',
      } satisfies ApiResponse);
      return;
    }

    const result = await restoreOrg(orgId);
    if (result === 'not_deleted') {
      logger.warn({ route: ORGS_RESTORE, userId: callerId, orgId }, 'Restore org - not soft-deleted');
      res.status(404).json({ success: false, data: {}, error: 'Organization is not in the recycle bin' } satisfies ApiResponse);
      return;
    }
    if (result === 'window_expired') {
      logger.warn({ route: ORGS_RESTORE, userId: callerId, orgId }, 'Restore org - window expired');
      res.status(410).json({
        success: false, data: {},
        error: `This organization is past its ${ORG_RESTORE_WINDOW_DAYS}-day recovery window and can no longer be restored`,
      } satisfies ApiResponse);
      return;
    }

    logger.info(
      { route: ORGS_RESTORE, userId: callerId, orgId, slug: result.slug },
      'Restore org - success',
    );
    res.status(200).json({ success: true, data: { org: result }, error: '' } satisfies ApiResponse<{ org: typeof result }>);
  } catch (err) {
    logger.error(
      { route: ORGS_RESTORE, userId: callerId, orgId, error: (err as Error).message },
      'Restore org - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not restore organization' } satisfies ApiResponse);
  }
}

/**
 * GET /api/v1/orgs/deleted - the caller's "recently deleted" orgs (owner-only
 * rows, still inside the recovery window). Powers the restore list on the
 * create-org / welcome page. Static path - registered before the `/:id` routes.
 */
export async function listDeletedOrgsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId = req.user!.id;

  logger.info({ route: ORGS_DELETED, method: 'GET', userId: callerId }, 'List deleted orgs - start');

  try {
    const orgs = await listDeletedOrgsForOwner(callerId);
    logger.info({ route: ORGS_DELETED, userId: callerId, count: orgs.length }, 'List deleted orgs - success');
    res.status(200).json({ success: true, data: { orgs }, error: '' } satisfies ApiResponse<{ orgs: typeof orgs }>);
  } catch (err) {
    logger.error(
      { route: ORGS_DELETED, userId: callerId, error: (err as Error).message },
      'List deleted orgs - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not load deleted organizations' } satisfies ApiResponse);
  }
}

/**
 * GET /api/v1/orgs/discover-by-domain - returns the names of orgs whose
 * owners share the caller's email domain. Used for the "an org with your
 * email domain already exists" soft warning on the create-org form + the
 * dashboard banner for admins/owners.
 *
 * Domain is derived from the authenticated caller's email - NOT user-supplied
 * - so this can't be used to enumerate arbitrary domains.
 *
 * Skips public-email domains (gmail / outlook / etc.) where the warning
 * would always fire and be useless.
 *
 * Returns: `{ orgs: [{ id, name }] }`. Owner email, member count, role,
 * subscription state, slug are NOT included - that level of detail is a
 * privacy leak. Just enough so the caller recognizes the org.
 */
export async function discoverOrgsByDomain(req: AuthenticatedRequest, res: Response): Promise<void> {
  const callerId    = req.user!.id;
  const callerEmail = req.user!.email;
  const domain      = callerEmail.split('@')[1]?.toLowerCase() ?? '';

  logger.info(
    { route: ORGS_DISCOVER, userId: callerId, domain },
    'Discover orgs by domain - start',
  );

  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) {
    logger.info(
      { route: ORGS_DISCOVER, userId: callerId, domain, reason: 'public-email-domain' },
      'Discover orgs by domain - skipping (public domain)',
    );
    res.status(200).json({ success: true, data: { orgs: [] }, error: '' } satisfies ApiResponse);
    return;
  }

  try {
    const orgs = await findOrgsByOwnerEmailDomain(domain, callerId);
    logger.info(
      { route: ORGS_DISCOVER, userId: callerId, domain, count: orgs.length },
      'Discover orgs by domain - success',
    );
    res.status(200).json({ success: true, data: { orgs }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ORGS_DISCOVER, userId: callerId, domain, error: (err as Error).message },
      'Discover orgs by domain - DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Could not look up domain peers' } satisfies ApiResponse);
  }
}
