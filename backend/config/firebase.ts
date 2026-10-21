import admin from 'firebase-admin';
import logger from './logger';

// Firebase Admin singleton — the one place the FCM credential is loaded and the
// app is initialised. Mirrors the SES client pattern in email.service: lazy,
// best-effort, and NEVER fatal at boot. Push is an enhancement layered on top of
// the always-on in-app + email channels, so a missing/broken Firebase credential
// must not stop the backend from starting (it just means push is disabled).
//
// Credential source — ONE env var, two accepted forms:
//   FIREBASE_SERVICE_ACCOUNT  = the service-account JSON, either
//     (a) base64-encoded  (RECOMMENDED — survives .env files: no quoting / newline
//          mangling of the private_key), or
//     (b) the raw JSON string.
// Unset → push silently disabled (getMessaging() returns null, the channel no-ops).

let messaging: admin.messaging.Messaging | null = null;
// Init is attempted exactly once. After that this flag short-circuits — a failed
// init never retries on every notification (would spam logs + waste cycles).
let initialised = false;

function init(): void {
  initialised = true;

  const raw = (process.env['FIREBASE_SERVICE_ACCOUNT'] ?? '').trim();
  if (!raw) {
    logger.info(
      { userId: 'system', route: 'firebase' },
      'FIREBASE_SERVICE_ACCOUNT not set - mobile push disabled (in-app + email unaffected)',
    );
    return;
  }

  try {
    // Base64 unless it already looks like JSON (starts with '{').
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const creds = JSON.parse(json) as admin.ServiceAccount & { project_id?: string };

    const app = admin.initializeApp({ credential: admin.credential.cert(creds) });
    messaging = app.messaging();

    logger.info(
      { userId: 'system', route: 'firebase', projectId: creds.projectId ?? creds.project_id ?? '(unknown)' },
      'Firebase Admin initialised - mobile push enabled',
    );
  } catch (err) {
    // Bad credential is logged and swallowed: push stays disabled, backend runs.
    messaging = null;
    logger.error(
      { userId: 'system', route: 'firebase', error: (err as Error).message },
      'Firebase Admin init failed - mobile push disabled (check FIREBASE_SERVICE_ACCOUNT)',
    );
  }
}

/** Returns the FCM messaging client, or null when push is not configured. */
export function getMessaging(): admin.messaging.Messaging | null {
  if (!initialised) init();
  return messaging;
}

/** True when FCM is configured and ready (used to skip token lookups early). */
export function isPushEnabled(): boolean {
  return getMessaging() !== null;
}
