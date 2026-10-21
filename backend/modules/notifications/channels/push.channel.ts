import logger from '../../../config/logger';
import { getMessaging } from '../../../config/firebase';
import { listTokensForUser, deleteTokens } from '../../push/push.model';

// Push channel — mobile push via Firebase Cloud Messaging (FCM).
//
// Best-effort by contract, like the email channel: the in-app row is the durable
// record, so any push failure is logged and swallowed — it must never bubble up
// and break the action that triggered the notification.
//
// Three short-circuits keep it cheap and safe before FCM is even configured:
//   1. FCM not configured (no FIREBASE_SERVICE_ACCOUNT) → no-op.
//   2. User has no registered devices                  → no-op.
//   3. Send done → prune any tokens FCM reports as dead (uninstalled / expired)
//      so the registry self-heals.

// FCM error codes that mean "this token is permanently dead — stop sending to it".
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export interface DeliverPushParams {
  userId:   string;
  type:     string;
  /** Notification title shown on the device. */
  title:    string;
  /** Notification body shown on the device. */
  body:     string;
  /** Relative in-org path for the app to deep-link to (e.g. /projects/1/tickets/2). */
  link:     string | null;
  /** Org slug, so the app can route into the right tenant. */
  orgSlug:  string | null;
}

export async function deliverPush(p: DeliverPushParams): Promise<void> {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      logger.debug({ route: 'notifications.push', userId: p.userId, type: p.type }, 'Push skipped - FCM not configured');
      return;
    }

    const devices = await listTokensForUser(p.userId);
    if (devices.length === 0) {
      logger.debug({ route: 'notifications.push', userId: p.userId, type: p.type }, 'Push skipped - no registered devices');
      return;
    }
    const tokens = devices.map((d) => d.token);

    // `data` values MUST all be strings (FCM requirement). Carries everything the
    // app needs to deep-link without re-fetching: notification type + target path.
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: p.title, body: p.body },
      data: {
        type:    p.type,
        link:    p.link ?? '',
        orgSlug: p.orgSlug ?? '',
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    // Collect tokens FCM rejected as dead and prune them in one bulk delete.
    const dead: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        if (DEAD_TOKEN_CODES.has(code)) dead.push(tokens[i]!);
        else logger.warn({ route: 'notifications.push', userId: p.userId, type: p.type, code }, 'Push to one device failed (transient)');
      }
    });
    if (dead.length > 0) await deleteTokens(dead);

    logger.info(
      { route: 'notifications.push', userId: p.userId, type: p.type, sent: response.successCount, failed: response.failureCount, pruned: dead.length },
      'Push dispatched',
    );
  } catch (err) {
    logger.error(
      { route: 'notifications.push', userId: p.userId, type: p.type, error: (err as Error).message },
      'Push failed - in-app notification still delivered',
    );
  }
}
