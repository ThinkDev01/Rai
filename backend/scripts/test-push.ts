// Self-contained FCM smoke test — proves the Firebase credential is valid and the
// backend can reach Cloud Messaging, WITHOUT any mobile device, login, or HTTP.
//
// How it works: we ask Firebase Admin to push to a deliberately FAKE token. The
// interesting part is the ERROR FCM returns:
//   • messaging/invalid-argument OR registration-token-not-registered
//       → SUCCESS. FCM authenticated our credential and accepted the request — it
//         only rejected the bogus token. The pipeline works end to end.
//   • anything about credentials / project id / auth
//       → the service-account key is wrong or not loaded.
//
// Usage:  npm run test:push
//
// '../config/env' is imported first so dotenv loads .env before firebase reads it.
import '../config/env';
import logger from '../config/logger';
import { getMessaging } from '../config/firebase';

const ROUTE = 'test-push';
// Well-formed-looking but non-existent token, so FCM rejects it at the token layer
// (not the request layer) — that rejection is exactly what proves auth succeeded.
const FAKE_TOKEN = 'fake-token-for-smoke-test-' + 'x'.repeat(120);

// Codes that mean "your credential is fine, only the token was bad" = PASS.
const GOOD_REJECTIONS = new Set([
  'messaging/invalid-argument',
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

async function main(): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) {
    logger.error({ userId: 'system', route: ROUTE }, 'FAIL — FCM not configured. Is FIREBASE_SERVICE_ACCOUNT set in .env?');
    process.exit(1);
  }

  logger.info({ userId: 'system', route: ROUTE }, 'Sending a test push to a FAKE token (expecting FCM to reject the token)...');
  try {
    await messaging.send({
      token: FAKE_TOKEN,
      notification: { title: 'Rai test', body: 'If you can read this, something is very wrong' },
    });
    // Reaching here means FCM accepted a fake token — should never happen.
    logger.warn({ userId: 'system', route: ROUTE }, 'Unexpected: FCM accepted a fake token. Inconclusive.');
    process.exit(0);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (GOOD_REJECTIONS.has(code)) {
      logger.info({ userId: 'system', route: ROUTE, code }, 'PASS ✅ — credential valid, FCM reachable. It only rejected the fake token, exactly as expected.');
      process.exit(0);
    }
    logger.error({ userId: 'system', route: ROUTE, code, error: (err as Error).message }, 'FAIL ❌ — this is NOT a token error. Check the service-account credential.');
    process.exit(1);
  }
}

void main();
