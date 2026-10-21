import crypto from 'crypto';
import { uuidv7 } from 'uuidv7';
import pool from '../../config/db';
import type { InviteRow, InvitableRole, PendingInviteRow } from './invites.types';

// 7-day TTL per Q6. Stored as a constant (not env-driven) - changing it would
// invalidate the "expires in 7 days" copy in the email template at the same time.
export const INVITE_TTL_DAYS = 7;

/** 32 random bytes, base64url-encoded → ~43-char URL-safe opaque token. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Atomically supersede any existing live invite for (org_id, email) and insert
 * the new one. RF-12 decision A - newer invite always wins. Same transaction
 * so two concurrent invite-creates can't both succeed and leave two live tokens.
 *
 * The DB partial unique index (uq_invites_one_live_per_org_email) is the
 * backstop - if a race somehow gets past the app-level supersede, the second
 * INSERT raises 23505 and the caller surfaces a generic 500. Should never happen
 * inside a single transaction; exists for cross-request races.
 */
export async function insertInviteWithSupersede(args: {
  orgId:        string;
  email:        string;
  role:         InvitableRole;
  invitedBy:    string;
  token:        string;
  expiresAt:    Date;
}): Promise<InviteRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Revoke any prior live invite for the same (org, email). NOOP if none.
    await client.query(
      `UPDATE invites
         SET revoked_at = NOW()
       WHERE org_id        = $1
         AND invited_email = $2
         AND used_at       IS NULL
         AND revoked_at    IS NULL
         AND expires_at    > NOW()`,
      [args.orgId, args.email],
    );

    const id = uuidv7();
    const res = await client.query<InviteRow>(
      `INSERT INTO invites (id, token, org_id, role, invited_email, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, args.token, args.orgId, args.role, args.email, args.invitedBy, args.expiresAt],
    );

    await client.query('COMMIT');
    return res.rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Pending invites for an org, ordered newest first. Used by Team page. */
export async function listPendingInvitesForOrg(orgId: string): Promise<PendingInviteRow[]> {
  const res = await pool.query<PendingInviteRow>(
    `SELECT
       i.id,
       i.invited_email,
       i.role,
       u.name  AS invited_by_name,
       u.email AS invited_by_email,
       i.expires_at,
       i.created_at
     FROM invites i
     JOIN users u ON u.id = i.invited_by
     WHERE i.org_id     = $1
       AND i.used_at    IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [orgId],
  );
  return res.rows;
}

/** Single invite by id - used by revoke endpoint to look up org for role check. */
export async function findInviteById(id: string): Promise<InviteRow | null> {
  const res = await pool.query<InviteRow>('SELECT * FROM invites WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/**
 * Find an invite by token. Returns the row regardless of state (used/revoked/expired)
 * so the controller can render distinct error messages per lifecycle state. The
 * caller MUST check `used_at`, `revoked_at`, and `expires_at` before honoring it.
 */
export async function findInviteByToken(token: string): Promise<InviteRow | null> {
  const res = await pool.query<InviteRow>('SELECT * FROM invites WHERE token = $1', [token]);
  return res.rows[0] ?? null;
}

export async function revokeInvite(id: string): Promise<void> {
  await pool.query(
    'UPDATE invites SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL AND used_at IS NULL',
    [id],
  );
}

/**
 * Atomically mark the invite used and create the user_orgs row. If either step
 * fails the whole thing rolls back so we never have a half-applied accept
 * (membership without used_at, or used_at without membership).
 *
 * Conflict on user_orgs PK → user is already a member (race with another open
 * tab accepting the same invite). Swallow silently and still mark used -
 * end-state is the same.
 */
export async function acceptInviteTxn(args: {
  inviteId:  string;
  userId:    string;
  orgId:     string;
  role:      InvitableRole;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE invites SET used_at = NOW() WHERE id = $1`,
      [args.inviteId],
    );

    await client.query(
      `INSERT INTO user_orgs (user_id, org_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, org_id) DO NOTHING`,
      [args.userId, args.orgId, args.role],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Caller's role in the target org, or null if not a member. Used for org-action
 * authorization (invite, revoke). v2 has no requireRole middleware yet - each
 * controller does this lookup inline.
 */
export async function getCallerRoleInOrg(userId: string, orgId: string): Promise<InvitableRole | 'owner' | null> {
  const res = await pool.query<{ role: 'owner' | InvitableRole }>(
    'SELECT role FROM user_orgs WHERE user_id = $1 AND org_id = $2',
    [userId, orgId],
  );
  return res.rows[0]?.role ?? null;
}

/**
 * Cleanup sweep (RF-12) — hard-delete invites that lapsed without being accepted.
 * Used by the invite-cleanup cron.
 *
 * Targets every unaccepted invite past its expiry (covers plain-expired AND
 * revoked-then-expired rows). Accepted invites (used_at set) are kept as the
 * accept record. Removing dead rows also frees the
 * `uq_invites_one_live_per_org_email` slot a stale token would otherwise hold,
 * so re-inviting the same email never collides. Idempotent — only touches rows
 * already past expires_at.
 */
export async function deleteExpiredInvites(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM invites
      WHERE used_at IS NULL
        AND expires_at < NOW()`,
  );
  return res.rowCount ?? 0;
}

/** Org row sliver used in invite emails and accept response. */
export async function getOrgSliver(orgId: string): Promise<{ id: string; name: string; slug: string } | null> {
  const res = await pool.query<{ id: string; name: string; slug: string }>(
    'SELECT id, name, slug FROM organizations WHERE id = $1',
    [orgId],
  );
  return res.rows[0] ?? null;
}
