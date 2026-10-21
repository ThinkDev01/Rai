import pool from '../../config/db';
import logger from '../../config/logger';

// ── In-app feed (the bell/inbox) ────────────────────────────────────────────

export interface InsertNotificationParams {
  userId: string;
  orgId:  string | null;
  type:   string;
  title:  string;
  link:   string | null;
}

export async function insertNotification(p: InsertNotificationParams): Promise<{ id: number; created_at: string }> {
  logger.info({ route: 'notifications.model.insert', userId: p.userId, type: p.type, orgId: p.orgId }, 'Writing in-app notification');
  const result = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO notifications (user_id, org_id, type, title, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [p.userId, p.orgId, p.type, p.title, p.link],
  );
  return result.rows[0]!;
}

export interface NotificationListRow {
  id:         number;
  type:       string;
  title:      string;
  link:       string | null;
  read_at:    string | null;
  created_at: string;
  org_id:     string | null;
  org_slug:   string | null;
  org_name:   string | null;
}

export async function listNotifications(userId: string, limit: number, beforeId?: number): Promise<NotificationListRow[]> {
  const params: unknown[] = [userId];
  let where = 'n.user_id = $1';
  if (beforeId) {
    params.push(beforeId);
    where += ` AND n.id < $${params.length}`;
  }
  params.push(limit);
  const result = await pool.query<NotificationListRow>(
    `SELECT n.id, n.type, n.title, n.link, n.read_at, n.created_at,
            n.org_id, o.slug AS org_slug, o.name AS org_name
       FROM notifications n
       LEFT JOIN organizations o ON o.id = n.org_id
      WHERE ${where}
      ORDER BY n.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

export async function countUnread(userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

export async function markRead(userId: string, id: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = $2 AND read_at IS NULL`,
    [userId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markUnread(userId: string, id: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications SET read_at = NULL WHERE user_id = $1 AND id = $2 AND read_at IS NOT NULL`,
    [userId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}

// ── Lookups used by the service when dispatching ────────────────────────────

export async function getUserContact(userId: string): Promise<{ email: string; name: string | null } | null> {
  const result = await pool.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getOrgSlug(orgId: string): Promise<string | null> {
  const result = await pool.query<{ slug: string }>(
    `SELECT slug FROM organizations WHERE id = $1`,
    [orgId],
  );
  return result.rows[0]?.slug ?? null;
}

// ── Preferences ─────────────────────────────────────────────────────────────
// A channel is ENABLED by default; an explicit row with enabled=false opts out.

export async function isEmailEnabled(userId: string, type: string): Promise<boolean> {
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM notification_preferences
      WHERE user_id = $1 AND notification_type = $2 AND channel = 'email'`,
    [userId, type],
  );
  return result.rows[0]?.enabled ?? true;
}

export interface PreferenceRow {
  notification_type: string;
  channel:           string;
  enabled:           boolean;
}

export async function listPreferences(userId: string): Promise<PreferenceRow[]> {
  const result = await pool.query<PreferenceRow>(
    `SELECT notification_type, channel, enabled FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  return result.rows;
}

export async function upsertPreference(userId: string, type: string, channel: string, enabled: boolean): Promise<void> {
  logger.info({ route: 'notifications.model.upsertPref', userId, type, channel, enabled }, 'Saving notification preference');
  await pool.query(
    `INSERT INTO notification_preferences (user_id, notification_type, channel, enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, notification_type, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [userId, type, channel, enabled],
  );
}
