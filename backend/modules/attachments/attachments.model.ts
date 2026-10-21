import pool from '../../config/db';
import type { AttachmentRow } from './attachments.types';

/** True when a ticket/comment with this id exists inside the org — used to
 *  validate an entityId supplied at presign time. */
export async function entityExistsInOrg(
  entityColumn: 'ticket_id' | 'comment_id',
  entityId: number,
  orgId: string,
): Promise<boolean> {
  const table = entityColumn === 'ticket_id' ? 'tickets' : 'comments';
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2
     ) AS exists`,
    [entityId, orgId],
  );
  return result.rows[0]?.exists ?? false;
}

export interface PendingAttachmentInsert {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  key: string;
}

/** Batch-insert pending rows at presign time (uploader picked files but the
 *  entity doesn't exist yet). One id/key per file. */
export async function insertPendingAttachments(
  orgId: string,
  uploaderId: string,
  rows: PendingAttachmentInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO attachments (id, org_id, uploader_id, name, mime_type, size, key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [r.id, orgId, uploaderId, r.name, r.mimeType, r.size, r.key],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Fetch pending rows by key for a given org+uploader — the link step's
 *  ownership check. Unknown / other-user / non-pending keys simply don't match. */
export async function findPendingByKeys(
  orgId: string,
  uploaderId: string,
  keys: string[],
): Promise<AttachmentRow[]> {
  if (keys.length === 0) return [];
  const result = await pool.query<AttachmentRow>(
    `SELECT id, org_id, ticket_id, comment_id, uploader_id, name, mime_type, size, key, status, created_at, confirmed_at, updated_at
     FROM attachments
     WHERE org_id = $1 AND uploader_id = $2 AND key = ANY($3) AND status = 'pending'`,
    [orgId, uploaderId, keys],
  );
  return result.rows;
}

/** Flip pending rows to confirmed + attach the entity. Returns how many rows
 *  actually updated (the guard is `status='pending'`, so a second link attempt
 *  for the same keys updates nothing — the 409 double-submit signal). */
export async function confirmAttachments(
  orgId: string,
  uploaderId: string,
  entityColumn: 'ticket_id' | 'comment_id',
  entityId: number,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  const result = await pool.query<{ n: number }>(
    `UPDATE attachments
     SET ${entityColumn} = $1, status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
     WHERE org_id = $2 AND uploader_id = $3 AND key = ANY($4) AND status = 'pending'
       AND ${entityColumn} IS NULL`,
    [entityId, orgId, uploaderId, keys],
  );
  return result.rowCount ?? 0;
}

/** All confirmed attachments for one entity, oldest first (read path). */
export async function attachmentsForEntity(
  orgId: string,
  entityColumn: 'ticket_id' | 'comment_id',
  entityId: number,
): Promise<AttachmentRow[]> {
  const result = await pool.query<AttachmentRow>(
    `SELECT id, org_id, ticket_id, comment_id, uploader_id, name, mime_type, size, key, status, created_at, confirmed_at, updated_at
     FROM attachments
     WHERE org_id = $1 AND ${entityColumn} = $2 AND status = 'confirmed'
     ORDER BY created_at ASC`,
    [orgId, entityId],
  );
  return result.rows;
}

/** Confirmed attachments for many entities at once (read path — avoids an
 *  N+1 for the ticket's comment list). Caller groups by row[entityColumn]. */
export async function attachmentsForEntities(
  orgId: string,
  entityColumn: 'ticket_id' | 'comment_id',
  entityIds: number[],
): Promise<AttachmentRow[]> {
  if (entityIds.length === 0) return [];
  const result = await pool.query<AttachmentRow>(
    `SELECT id, org_id, ticket_id, comment_id, uploader_id, name, mime_type, size, key, status, created_at, confirmed_at, updated_at
     FROM attachments
     WHERE org_id = $1 AND ${entityColumn} = ANY($2) AND status = 'confirmed'
     ORDER BY created_at ASC`,
    [orgId, entityIds],
  );
  return result.rows;
}

/** Keys of pending rows older than `before` — the cleanup sweep target. */
export async function pendingOrphanKeys(beforeIso: string): Promise<string[]> {  const result = await pool.query<{ key: string }>(
    `SELECT key FROM attachments
     WHERE status = 'pending' AND created_at < $1`,
    [beforeIso],
  );
  return result.rows.map(r => r.key);
}

/** A CONFIRMED attachment's key+name for one org — the oly thing the URL-refresh
 *  endpoint needs to presign fresh, org-scoped URLs. `status='pending'` rows
 *  (the cleanup job's targets) are never returned here: a caller can't mint
 *  fresh read URLs for an upload the backend never confirmed. */
export async function attachmentKeyForUrl(
  orgId: string,
  id: string,
): Promise<{ key: string; name: string } | null> {
  const result = await pool.query<{ key: string; name: string }>(
    `SELECT key, name FROM attachments WHERE org_id = $1 AND id = $2 AND status = 'confirmed'`,
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

/** Delete rows by key (called after the objects were removed). */
export async function deleteByKeys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const result = await pool.query(
    `DELETE FROM attachments WHERE key = ANY($1)`,
    [keys],
  );
  return result.rowCount ?? 0;
}

/** A confirmed attachment joined with the ticket it belongs to (resolved
 *  through its comment when the row links a comment instead). Used by the
 *  delete endpoint to (a) keep the lookup org-scoped and (b) enforce the
 *  can-edit rule (reporter/assignee/admin tier) against the REAL owning
 *  ticket, whether the file hangs off the ticket or one of its comments. */
export interface AttachmentWithTicket {
  id: string;
  org_id: string;
  ticket_id: number | null;
  comment_id: number | null;
  uploader_id: string;
  name: string;
  mime_type: string;
  size: number;
  key: string;
  status: 'pending' | 'confirmed';
  created_at: string;
  confirmed_at: string | null;
  entity_ticket_id: number | null;
  project_id: number | null;
  reporter_id: string | null;
  assignee_id: string | null;
}

export async function attachmentWithTicket(orgId: string, id: string): Promise<AttachmentWithTicket | null> {
  const result = await pool.query<AttachmentWithTicket>(
    `SELECT a.id, a.org_id, a.ticket_id, a.comment_id, a.uploader_id, a.name,
            a.mime_type, a.size, a.key, a.status, a.created_at, a.confirmed_at,
            t.id AS entity_ticket_id, t.project_id, t.reporter_id, t.assignee_id
     FROM attachments a
     LEFT JOIN LATERAL (
       SELECT t.id, t.project_id, t.reporter_id, t.assignee_id FROM tickets t WHERE t.id = a.ticket_id
       UNION ALL
       SELECT t.id, t.project_id, t.reporter_id, t.assignee_id FROM comments c JOIN tickets t ON t.id = c.ticket_id WHERE c.id = a.comment_id
     ) t ON TRUE
     WHERE a.org_id = $1 AND a.id = $2 AND a.status = 'confirmed'`,
    [orgId, id],
  );
  return result.rows[0] ?? null;
}
