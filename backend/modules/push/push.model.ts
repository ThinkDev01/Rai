import pool from '../../config/db';
import logger from '../../config/logger';

// device_tokens DB access — the FCM registry. Pure data layer (no side effects
// beyond the query), per the module-layering rule. The push channel and the
// register/unregister endpoints are the only callers.

export interface DeviceToken {
  token:    string;
  platform: string;
}

/**
 * Register (or refresh) a device token for a user. The token is globally unique,
 * so on conflict we MOVE it to the current user and bump last_seen_at — this
 * cleanly handles re-login on a shared device and the app refreshing its token.
 */
export async function upsertToken(userId: string, token: string, platform: string): Promise<void> {
  logger.info({ route: 'push.model.upsert', userId, platform }, 'Registering device token');
  await pool.query(
    `INSERT INTO device_tokens (user_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     platform = EXCLUDED.platform,
                     last_seen_at = NOW()`,
    [userId, token, platform],
  );
}

/** Remove a single token (explicit logout / app uninstall handled client-side). */
export async function deleteToken(userId: string, token: string): Promise<boolean> {
  logger.info({ route: 'push.model.delete', userId }, 'Removing device token');
  const result = await pool.query(
    `DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`,
    [userId, token],
  );
  return (result.rowCount ?? 0) > 0;
}

/** All registered tokens for a user — the fan-out list for a push send. */
export async function listTokensForUser(userId: string): Promise<DeviceToken[]> {
  const result = await pool.query<DeviceToken>(
    `SELECT token, platform FROM device_tokens WHERE user_id = $1`,
    [userId],
  );
  return result.rows;
}

/**
 * Bulk-prune tokens FCM reported as dead (uninstalled / expired). Called by the
 * push channel after a send so the registry self-heals — no user_id scope needed
 * since the tokens themselves are unique and already known-bad.
 */
export async function deleteTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const result = await pool.query(`DELETE FROM device_tokens WHERE token = ANY($1::text[])`, [tokens]);
  const removed = result.rowCount ?? 0;
  if (removed > 0) logger.info({ route: 'push.model.prune', removed }, 'Pruned dead device tokens');
  return removed;
}
