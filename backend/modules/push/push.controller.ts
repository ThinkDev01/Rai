import type { Response } from 'express';
import logger from '../../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { upsertToken, deleteToken } from './push.model';

const ROUTE = '/api/v1/devices';
const PLATFORMS = ['ios', 'android', 'web'];
// FCM tokens are ~150+ chars; cap generously to reject obvious junk without
// guessing the exact length (it varies by SDK version and is not contractually fixed).
const MAX_TOKEN_LEN = 4096;

// POST /api/v1/devices  { token, platform }  → register/refresh this device for push.
// User-scoped (authMiddleware only) — a device belongs to the user, not an org;
// the same device receives that user's cross-org notifications.
export async function registerDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { token, platform } = req.body as { token?: unknown; platform?: unknown };

  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LEN) {
    logger.warn({ route: ROUTE, userId: user.id }, 'Register device - rejected: missing/oversized token');
    res.status(400).json({ success: false, data: {}, error: 'A valid device token is required' } satisfies ApiResponse);
    return;
  }
  if (typeof platform !== 'string' || !PLATFORMS.includes(platform)) {
    logger.warn({ route: ROUTE, userId: user.id, platform }, 'Register device - rejected: bad platform');
    res.status(400).json({ success: false, data: {}, error: `platform must be one of: ${PLATFORMS.join(', ')}` } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ROUTE, method: 'POST', userId: user.id, platform }, 'Register device - start');
  try {
    await upsertToken(user.id, token, platform);
    res.status(200).json({ success: true, data: { registered: true }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId: user.id, error: (err as Error).message }, 'Register device - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not register device' } satisfies ApiResponse);
  }
}

// DELETE /api/v1/devices  { token }  → unregister this device (logout / disable push).
export async function unregisterDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { token } = req.body as { token?: unknown };

  if (typeof token !== 'string' || token.length === 0) {
    res.status(400).json({ success: false, data: {}, error: 'A device token is required' } satisfies ApiResponse);
    return;
  }

  logger.info({ route: ROUTE, method: 'DELETE', userId: user.id }, 'Unregister device - start');
  try {
    const removed = await deleteToken(user.id, token);
    res.status(200).json({ success: true, data: { removed }, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId: user.id, error: (err as Error).message }, 'Unregister device - DB error');
    res.status(500).json({ success: false, data: {}, error: 'Could not unregister device' } satisfies ApiResponse);
  }
}
