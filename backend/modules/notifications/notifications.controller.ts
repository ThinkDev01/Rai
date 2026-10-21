import type { Response } from 'express';
import logger from '../../config/logger';
import { param, query } from '../../types/common.types';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import {
  listNotifications, countUnread, markRead, markUnread, markAllRead,
  listPreferences, upsertPreference,
} from './notifications.model';
import { REGISTRY } from './templates';

const ROUTE = '/api/v1/notifications';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// GET /api/v1/notifications?limit=&before=  → feed page + unread count
export async function getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const limit = Math.min(Math.max(parseInt(query(req, 'limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const beforeRaw = parseInt(query(req, 'before'), 10);
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;

  logger.info({ route: ROUTE, method: 'GET', userId: user.id, limit, before }, 'List notifications - start');
  try {
    const [rows, unreadCount] = await Promise.all([
      listNotifications(user.id, limit, before),
      countUnread(user.id),
    ]);
    const nextBefore = rows.length === limit ? rows[rows.length - 1]!.id : null;
    res.status(200).json({
      success: true,
      data: { items: rows, unreadCount, nextBefore },
      error: '',
    } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId: user.id, error: (err as Error).message }, 'List notifications - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not load notifications' } satisfies ApiResponse);
  }
}

// GET /api/v1/notifications/unread-count  → lightweight badge poll
export async function getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  try {
    const count = await countUnread(user.id);
    res.status(200).json({ success: true, data: { count }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/unread-count`, userId: user.id, error: (err as Error).message }, 'Unread count - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not load unread count' } satisfies ApiResponse);
  }
}

// POST /api/v1/notifications/:id/read  → mark one read
export async function postMarkRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const id = parseInt(param(req, 'id'), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid notification id' } satisfies ApiResponse);
    return;
  }
  logger.info({ route: `${ROUTE}/:id/read`, userId: user.id, id }, 'Mark read - start');
  try {
    const changed = await markRead(user.id, id);
    res.status(200).json({ success: true, data: { changed }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/:id/read`, userId: user.id, id, error: (err as Error).message }, 'Mark read - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not update notification' } satisfies ApiResponse);
  }
}

// POST /api/v1/notifications/:id/unread  → mark one unread (undo a read)
export async function postMarkUnread(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const id = parseInt(param(req, 'id'), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ success: false, data: {}, error: 'Invalid notification id' } satisfies ApiResponse);
    return;
  }
  logger.info({ route: `${ROUTE}/:id/unread`, userId: user.id, id }, 'Mark unread - start');
  try {
    const changed = await markUnread(user.id, id);
    res.status(200).json({ success: true, data: { changed }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/:id/unread`, userId: user.id, id, error: (err as Error).message }, 'Mark unread - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not update notification' } satisfies ApiResponse);
  }
}

// POST /api/v1/notifications/read-all  → mark all read
export async function postMarkAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  logger.info({ route: `${ROUTE}/read-all`, userId: user.id }, 'Mark all read - start');
  try {
    const updated = await markAllRead(user.id);
    res.status(200).json({ success: true, data: { updated }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/read-all`, userId: user.id, error: (err as Error).message }, 'Mark all read - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not update notifications' } satisfies ApiResponse);
  }
}

// GET /api/v1/notifications/preferences  → per-type email toggle state for Settings
export async function getPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  try {
    const prefs = await listPreferences(user.id);
    const disabledEmail = new Set(
      prefs.filter((p) => p.channel === 'email' && !p.enabled).map((p) => p.notification_type),
    );
    const items = Object.entries(REGISTRY)
      .filter(([, e]) => e.defaultChannels.includes('email'))
      .map(([type, e]) => ({
        type,
        label: e.label,
        category: e.category,
        alwaysEmail: Boolean(e.alwaysEmail),
        // Critical types are locked on; others reflect the user's opt-out.
        emailEnabled: e.alwaysEmail ? true : !disabledEmail.has(type),
      }));
    res.status(200).json({ success: true, data: { items }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/preferences`, userId: user.id, error: (err as Error).message }, 'Get preferences - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not load preferences' } satisfies ApiResponse);
  }
}

// PATCH /api/v1/notifications/preferences  { type, channel, enabled }
export async function patchPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { type, channel, enabled } = req.body as { type?: unknown; channel?: unknown; enabled?: unknown };

  if (typeof type !== 'string' || !(type in REGISTRY)) {
    res.status(400).json({ success: false, data: {}, error: 'Unknown notification type' } satisfies ApiResponse);
    return;
  }
  // v2 only exposes the email channel (in-app inbox is always on).
  if (channel !== 'email') {
    res.status(400).json({ success: false, data: {}, error: 'Only the email channel is configurable' } satisfies ApiResponse);
    return;
  }
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, data: {}, error: 'enabled must be a boolean' } satisfies ApiResponse);
    return;
  }
  const entry = REGISTRY[type as keyof typeof REGISTRY];
  if (entry.alwaysEmail && !enabled) {
    res.status(400).json({ success: false, data: {}, error: 'This notification is required and cannot be turned off' } satisfies ApiResponse);
    return;
  }

  logger.info({ route: `${ROUTE}/preferences`, method: 'PATCH', userId: user.id, type, channel, enabled }, 'Update preference - start');
  try {
    await upsertPreference(user.id, type, channel, enabled);
    res.status(200).json({ success: true, data: { type, channel, enabled }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: `${ROUTE}/preferences`, userId: user.id, error: (err as Error).message }, 'Update preference - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not save preference' } satisfies ApiResponse);
  }
}
