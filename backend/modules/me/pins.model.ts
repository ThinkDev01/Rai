import pool from '../../config/db';
import logger from '../../config/logger';

/**
 * Personal pins (My Work quick-access). A pin is per-user, per-org, and points
 * at exactly one target — a project or a ticket — backed by the polymorphic
 * `user_pins` table (migration 015). The read-side `isPinned` flag is folded
 * straight into the projects-list + assigned-tickets queries; this model only
 * owns the write paths + the existence/count checks the toggle handlers need.
 */

export type PinKind = 'project' | 'ticket';

/** Top-N pins per type, per user, per org. Enforced here (a partial unique
 *  index can guarantee one-pin-per-target but not a row count). */
export const PIN_LIMIT = 3;

// Internal enum → column. `kind` is never user-supplied as a raw string (the
// route fixes it), so this maps a controlled value, not arbitrary input.
function columnFor(kind: PinKind): 'project_id' | 'ticket_id' {
  return kind === 'project' ? 'project_id' : 'ticket_id';
}

/**
 * Confirm the target exists *within the caller's org* before pinning. This is
 * the tenant wall on the write path — without it a guessed integer id could
 * write a cross-org pin (harmless on read, but it would still count toward the
 * limit). Visibility is re-enforced when the list queries render the flag.
 */
export async function targetExistsInOrg(
  orgId: string,
  kind: PinKind,
  entityId: number,
): Promise<boolean> {
  const table = kind === 'project' ? 'projects' : 'tickets';
  const result = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2`,
    [entityId, orgId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** How many of this kind the user has already pinned in this org. */
export async function countPinsOfKind(
  userId: string,
  orgId: string,
  kind: PinKind,
): Promise<number> {
  const col = columnFor(kind);
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::INT AS count FROM user_pins
     WHERE user_id = $1 AND org_id = $2 AND ${col} IS NOT NULL`,
    [userId, orgId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** True if this exact target is already pinned by the user. */
export async function isPinned(
  userId: string,
  orgId: string,
  kind: PinKind,
  entityId: number,
): Promise<boolean> {
  const col = columnFor(kind);
  const result = await pool.query(
    `SELECT 1 FROM user_pins
     WHERE user_id = $1 AND org_id = $2 AND ${col} = $3`,
    [userId, orgId, entityId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Insert a pin. Caller has already checked existence + the limit. ON CONFLICT
 *  DO NOTHING makes a double-click idempotent rather than a 500. */
export async function insertPin(
  userId: string,
  orgId: string,
  kind: PinKind,
  entityId: number,
): Promise<void> {
  const col = columnFor(kind);
  logger.info(
    { route: 'pins.model.insertPin', userId, orgId, kind, entityId },
    'Inserting personal pin',
  );
  await pool.query(
    `INSERT INTO user_pins (user_id, org_id, ${col})
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, orgId, entityId],
  );
}

/** Remove a pin. Returns false when nothing matched (already unpinned). */
export async function deletePin(
  userId: string,
  orgId: string,
  kind: PinKind,
  entityId: number,
): Promise<boolean> {
  const col = columnFor(kind);
  logger.info(
    { route: 'pins.model.deletePin', userId, orgId, kind, entityId },
    'Removing personal pin',
  );
  const result = await pool.query(
    `DELETE FROM user_pins
     WHERE user_id = $1 AND org_id = $2 AND ${col} = $3
     RETURNING id`,
    [userId, orgId, entityId],
  );
  return (result.rowCount ?? 0) > 0;
}
