// Data layer for the email-OTP gate. The plaintext code is generated here,
// returned once to the caller (to email), and never persisted — only its
// SHA-256 hash lands in the DB. All multi-statement work runs in a transaction
// with a row lock so concurrent verifies can't both consume the same code or
// race the attempt counter.

import { createHash, randomInt } from 'crypto';
import { uuidv7 } from 'uuidv7';
import pool from '../../config/db';
import type { OtpAction } from './otp.types';

/** Code lifetime. Long enough to fetch an email, short enough to limit exposure. */
export const OTP_TTL_MINUTES = 10;
/** Wrong guesses before the live code is burned (forces a fresh request). */
export const OTP_MAX_ATTEMPTS = 3;
const OTP_CODE_LENGTH = 6;

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Crypto-strong 6-digit code, zero-padded (000000–999999). */
function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_CODE_LENGTH, '0');
}

/**
 * Mint a challenge for (user, action, target) and return the plaintext code for
 * the caller to email. Any prior unconsumed challenge for the same triple is
 * consumed first, so only the newest code is ever valid (a resend retires the
 * old one). `IS NOT DISTINCT FROM` makes the target match NULL-safe.
 */
export async function createChallenge(
  userId: string,
  action: OtpAction,
  targetId: string | null,
): Promise<string> {
  const code = generateOtpCode();
  const codeHash = hashOtp(code);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE otp_challenges SET consumed_at = NOW()
         WHERE user_id = $1 AND action = $2
           AND target_id IS NOT DISTINCT FROM $3
           AND consumed_at IS NULL`,
      [userId, action, targetId],
    );
    await client.query(
      `INSERT INTO otp_challenges (id, user_id, action, target_id, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)`,
      [uuidv7(), userId, action, targetId, codeHash, String(OTP_TTL_MINUTES)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return code;
}

export type VerifyReason = 'no_challenge' | 'expired' | 'too_many_attempts' | 'mismatch';
export interface VerifyResult {
  ok: boolean;
  reason?: VerifyReason;
}

/**
 * Verify a supplied code for (user, action, target).
 *   - success → the challenge is consumed (single-use)
 *   - expired / over the attempt cap → consumed, with the matching reason
 *   - wrong code → attempt counter bumps; consumed once it crosses the cap
 * The active row is locked FOR UPDATE so two parallel verifies can't both win.
 */
export async function verifyChallenge(
  userId: string,
  action: OtpAction,
  targetId: string | null,
  code: string,
): Promise<VerifyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{ id: string; code_hash: string; attempts: number; expired: boolean }>(
      `SELECT id, code_hash, attempts, (expires_at < NOW()) AS expired
         FROM otp_challenges
        WHERE user_id = $1 AND action = $2
          AND target_id IS NOT DISTINCT FROM $3
          AND consumed_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [userId, action, targetId],
    );
    const row = res.rows[0];

    if (!row) {
      await client.query('COMMIT');
      return { ok: false, reason: 'no_challenge' };
    }
    if (row.expired) {
      await client.query('UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      return { ok: false, reason: 'expired' };
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await client.query('UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      return { ok: false, reason: 'too_many_attempts' };
    }
    if (hashOtp(code) !== row.code_hash) {
      const attempts = row.attempts + 1;
      // Burn the code the moment it hits the cap so the next try reports
      // 'too_many_attempts' cleanly instead of another 'mismatch'.
      await client.query(
        // Cast the params: $2 is used both as an int column value and inside a
        // comparison, which makes Postgres' type deduction fail ("inconsistent
        // types deduced for parameter $2") under stricter versions (PG16+).
        `UPDATE otp_challenges
            SET attempts = $2::int,
                consumed_at = CASE WHEN $2::int >= $3::int THEN NOW() ELSE consumed_at END
          WHERE id = $1`,
        [row.id, attempts, OTP_MAX_ATTEMPTS],
      );
      await client.query('COMMIT');
      return { ok: false, reason: attempts >= OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'mismatch' };
    }

    await client.query('UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
