import pool from '../../config/db';
import { uuidv7 } from 'uuidv7';
import logger from '../../config/logger';

export interface UserRow {
  id: string;
  external_auth_id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  /** Default org persisted locally (manual auth) — mirrors Cognito's
   *  custom:current_org_id claim under AUTH_PROVIDER=aws. Validated against
   *  membership on every request, never trusted on its own. */
  current_org_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MembershipRow {
  org_id: string;
  org_name: string;
  org_slug: string;
  subscription_status: 'trial' | 'active' | 'suspended' | 'cancelled';
  discoverable: boolean;
  role: 'owner' | 'admin' | 'project_manager' | 'user';
  role_label: string | null;
}

// Latest subscription per org (any status) — its dates are OUR source of truth.
const LATEST_SUB_JOIN = `
  LEFT JOIN LATERAL (
    SELECT status, trial_ends_at, current_period_end
      FROM subscriptions WHERE org_id = o.id
     ORDER BY created_at DESC LIMIT 1
  ) s ON TRUE`;

// Read-only gate derived from access TRUTH (trial/period dates), not the provider
// label — so a Razorpay cancellation can't read-only an org that still has trial
// or paid time owed. Mirror of billing.model `gateForSubscription`; keep in sync.
//   - hard-cancelled org (hidden) → keep 'cancelled'
//   - no subscription row         → fall back to the stored column
//   - trialing + trial not over   → 'trial'
//   - any future trial/period     → 'active' (full access, even if sub canceled)
//   - otherwise                   → 'suspended' (read-only)
const EFFECTIVE_GATE_SQL = `
  CASE
    WHEN o.subscription_status = 'cancelled' THEN 'cancelled'
    WHEN s.status IS NULL THEN o.subscription_status
    WHEN s.status = 'trialing' AND s.trial_ends_at > NOW() THEN 'trial'
    WHEN s.trial_ends_at > NOW() OR s.current_period_end > NOW() THEN 'active'
    ELSE 'suspended'
  END AS subscription_status`;

export async function findUserByExternalAuthId(externalAuthId: string): Promise<UserRow | null> {
  const res = await pool.query<UserRow>(
    'SELECT * FROM users WHERE external_auth_id = $1',
    [externalAuthId],
  );
  return res.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email],
  );
  return res.rows[0] ?? null;
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const res = await pool.query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  return res.rows[0] ?? null;
}

/** Credentials row for login — the password hash is read out-of-band so it
 *  never rides along in UserRow (`SELECT *` feeds lazy-sync + /me). */
export interface UserCredentials {
  id: string;
  password: string | null;
  email_verified: boolean;
}

export async function findUserCredentialsByEmail(email: string): Promise<UserCredentials | null> {
  const res = await pool.query<UserCredentials>(
    'SELECT id, password_hash AS password, email_verified FROM users WHERE email = $1',
    [email],
  );
  return res.rows[0] ?? null;
}

/**
 * Lazy-sync insert. Three idempotent paths:
 *   1. New user → INSERT (with name from JWT if present).
 *   2. Same external_auth_id seen before (concurrent request) → ON CONFLICT updates
 *      email_verified + (defensively) name when the existing row has none.
 *   3. Same email but different external_auth_id (Cognito pool rotation re-issues users a
 *      fresh sub for the same email) → re-point the existing row to the new sub.
 *
 * Name handling: insert uses the JWT name when present. On conflict, only fill name
 * if the existing row has NULL - never overwrite a name the user set explicitly
 * via Settings → PATCH /me (otherwise federated sign-in would clobber edits).
 */
export async function insertUser(
  externalAuthId: string,
  email: string,
  emailVerified: boolean,
  name: string | null,
): Promise<UserRow> {
  const id = uuidv7();
  try {
    const res = await pool.query<UserRow>(
      `INSERT INTO users (id, external_auth_id, email, email_verified, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_auth_id) DO UPDATE
         SET email_verified = EXCLUDED.email_verified,
             name           = COALESCE(users.name, EXCLUDED.name)
       RETURNING *`,
      [id, externalAuthId, email, emailVerified, name],
    );
    return res.rows[0]!;
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    // Email collision after a Cognito pool/sub rotation - same person, new sub.
    // Re-point the existing row to the new external_auth_id.
    if (pgErr.code === '23505' && pgErr.constraint === 'uq_users_email') {
      logger.warn(
        { email, newSub: externalAuthId, route: 'auth.model' },
        'Email exists with a different external_auth_id - updating to the new sub (pool rotation handling)',
      );
      const res = await pool.query<UserRow>(
        `UPDATE users
         SET external_auth_id = $1,
             email_verified   = $2,
             name             = COALESCE(name, $3),
             updated_at       = NOW()
         WHERE email = $4
         RETURNING *`,
        [externalAuthId, emailVerified, name, email],
      );
      return res.rows[0]!;
    }
    throw err;
  }
}

export async function getMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  const res = await pool.query<MembershipRow>(
    `SELECT
       o.id           AS org_id,
       o.name         AS org_name,
       o.slug         AS org_slug,
       ${EFFECTIVE_GATE_SQL},
       o.discoverable,
       uo.role,
       uo.role_label
     FROM user_orgs uo
     JOIN organizations o ON o.id = uo.org_id${LATEST_SUB_JOIN}
     WHERE uo.user_id = $1
       AND o.deleted_at IS NULL
     ORDER BY uo.joined_at ASC`,
    [userId],
  );
  return res.rows;
}

/** Update display name on the users row. Used by PATCH /me. */
export async function updateUserName(userId: string, name: string): Promise<void> {
  await pool.query(
    'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2',
    [name, userId],
  );
}

/**
 * Look up the user's membership for one org. Returns the membership row when
 * the user belongs to the org AND the org isn't cancelled AND the org isn't
 * soft-deleted (deleted_at IS NULL); null otherwise. The soft-delete filter is
 * what makes a recycle-binned org un-resolvable as tenant context the moment
 * it's deleted - see migration 012 + orgs.model softDeleteOrg.
 *
 * Used in two places:
 *   1. authMiddleware - to validate `claims.currentOrgId` per request and
 *      attach `currentOrgRole` to `req.user`.
 *   2. Org-switch / membership-gated controllers - to check before mutating
 *      Cognito attributes or returning org-internal data.
 */
export async function getMembership(userId: string, orgId: string): Promise<MembershipRow | null> {
  const res = await pool.query<MembershipRow>(
    `SELECT
       o.id           AS org_id,
       o.name         AS org_name,
       o.slug         AS org_slug,
       ${EFFECTIVE_GATE_SQL},
       o.discoverable,
       uo.role,
       uo.role_label
     FROM user_orgs uo
     JOIN organizations o ON o.id = uo.org_id${LATEST_SUB_JOIN}
     WHERE uo.user_id = $1
       AND uo.org_id  = $2
       AND o.deleted_at IS NULL
       AND o.subscription_status != 'cancelled'`,
    [userId, orgId],
  );
  return res.rows[0] ?? null;
}

// ── Manual auth (AUTH_PROVIDER=manual) ─────────────────────────────────────
// SQL for the DB-backed auth provider. Crypto (hashing, JWT) stays in
// manual-auth.service.ts; this file only owns rows.

export async function insertManualUser(
  id: string,
  email: string,
  name: string | null,
  passwordHash: string,
): Promise<void> {
  // $1 (id) and $2 (external_auth_id) are the SAME value but passed as two
  // params — the columns have different types (UUID vs VARCHAR), and reusing
  // one param for both makes PG16+ fail with "inconsistent types deduced".
  await pool.query(
    `INSERT INTO users (id, external_auth_id, email, name, password_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, id, email, name, passwordHash],
  );
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query(
    'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
    [userId, passwordHash],
  );
}

export async function setUserEmailVerified(userId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1',
    [userId],
  );
}

export async function setUserCurrentOrgId(externalAuthId: string, orgId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET current_org_id = $2, updated_at = NOW() WHERE external_auth_id = $1',
    [externalAuthId, orgId],
  );
}

export interface RefreshTokenRow {
  user_id: string;
  expires_at: Date;
}

export async function insertRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv7(), userId, tokenHash, expiresAt],
  );
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const res = await pool.query<RefreshTokenRow>(
    'SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function deleteRefreshTokenByHash(tokenHash: string): Promise<void> {
  await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export interface AuthCodeRow {
  id: string;
  code_hash: string;
  attempts: number;
  expired: boolean;
}

export async function createAuthCode(
  userId: string,
  action: string,
  codeHash: string,
  ttlMinutes: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One live code per (user, action) — a resend retires the previous one.
    await client.query(
      `UPDATE auth_codes SET consumed_at = NOW()
        WHERE user_id = $1 AND action = $2 AND consumed_at IS NULL`,
      [userId, action],
    );
    await client.query(
      `INSERT INTO auth_codes (id, user_id, action, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`,
      [uuidv7(), userId, action, codeHash, String(ttlMinutes)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyAuthCode(
  userId: string,
  action: string,
  codeHash: string,
  maxAttempts: number,
): Promise<'ok' | 'no_code' | 'expired' | 'too_many_attempts' | 'mismatch'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<AuthCodeRow>(
      `SELECT id, code_hash, attempts, (expires_at < NOW()) AS expired
         FROM auth_codes
        WHERE user_id = $1 AND action = $2 AND consumed_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [userId, action],
    );
    const row = res.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return 'no_code';
    }
    if (row.expired) {
      await client.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      return 'expired';
    }
    if (row.attempts >= maxAttempts) {
      await client.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      return 'too_many_attempts';
    }
    if (row.code_hash !== codeHash) {
      const attempts = row.attempts + 1;
      await client.query(
        `UPDATE auth_codes
            SET attempts = $2::int,
                consumed_at = CASE WHEN $2::int >= $3::int THEN NOW() ELSE consumed_at END
          WHERE id = $1`,
        [row.id, attempts, maxAttempts],
      );
      await client.query('COMMIT');
      return attempts >= maxAttempts ? 'too_many_attempts' : 'mismatch';
    }
    await client.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
