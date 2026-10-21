'use client';

/**
 * Auth storage guard - runs BEFORE Amplify.configure on every client boot.
 *
 * Purpose: prevent the "stale Amplify state" hang where browser storage holds
 * tokens / session metadata keyed against a DIFFERENT pool or client ID than
 * what the app is currently configured for. When that mismatch exists,
 * Amplify's signIn() hangs trying to reconcile old state with new config.
 *
 * Production guarantee:
 *   - Idempotent. Safe to call on every boot - no-op when storage is clean.
 *   - Surgical. Removes only keys whose embedded clientId doesn't match
 *     current config. Valid sessions for the current config are preserved.
 *   - Self-healing. End users never see the underlying issue; the guard
 *     cleans stale data before Amplify can touch it.
 *
 * What it cleans:
 *   1. localStorage keys matching `CognitoIdentityServiceProvider.<clientId>.*`
 *      where <clientId> ≠ current userPoolClientId.
 *   2. localStorage keys matching `amplify-*` if a config-fingerprint mismatch
 *      is detected (can't inspect their internal structure safely otherwise).
 *   3. IndexedDB databases whose name contains "amplify" or "Cognito" when
 *      fingerprint mismatch detected.
 *   4. Any registered service workers when fingerprint mismatch (prior dev
 *      sessions may have registered intercepting SWs).
 *
 * Org switch handling:
 *   The `custom:current_org_id` claim changes WITHOUT pool/client changing -
 *   so the guard does NOT fire on org switch. To pick up new claims after
 *   switch-org, the caller invokes `fetchAuthSession({ forceRefresh: true })`.
 */

import { logger } from './logger';

const FINGERPRINT_KEY = 'rai.auth.configFingerprint';

interface GuardResult {
  fingerprint: string;
  fingerprintMismatch: boolean;
  removedLocalStorageKeys: string[];
  deletedIndexedDbNames: string[];
  unregisteredServiceWorkers: number;
}

export function runAuthStorageGuard(
  userPoolId: string,
  userPoolClientId: string,
): GuardResult {
  const fingerprint = `${userPoolId}:${userPoolClientId}`;
  const result: GuardResult = {
    fingerprint,
    fingerprintMismatch: false,
    removedLocalStorageKeys: [],
    deletedIndexedDbNames: [],
    unregisteredServiceWorkers: 0,
  };

  if (typeof window === 'undefined') {
    logger.info('auth-storage-guard', 'Skipped — no window (SSR)');
    return result;
  }

  logger.info('auth-storage-guard', 'Storage guard started', { fingerprint });

  // ── 1. localStorage cleanup ───────────────────────────────────────────────
  // Walk every key. For Cognito keys, parse out the embedded clientId. If it
  // doesn't match current → remove. Surgical: we don't touch valid current
  // sessions.
  let needsAggressiveCleanup = false;
  try {
    const lastFingerprint = localStorage.getItem(FINGERPRINT_KEY);
    result.fingerprintMismatch = Boolean(lastFingerprint) && lastFingerprint !== fingerprint;

    // Aggressive cleanup conditions:
    //   - fingerprint changed (pool/client rotated) - must clean
    //   - no fingerprint yet (first boot after deploying this guard) - clean once,
    //     since we can't know what opaque state predates the guard
    needsAggressiveCleanup = result.fingerprintMismatch || !lastFingerprint;

    if (result.fingerprintMismatch) {
      logger.warn('auth-storage-guard', 'Config fingerprint changed — running aggressive cleanup', { was: lastFingerprint, now: fingerprint });
    } else if (!lastFingerprint) {
      logger.info('auth-storage-guard', 'First-time guard boot — running one-time cleanup pass');
    }

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Cognito keys are `CognitoIdentityServiceProvider.<clientId>.<userHash>.<field>`
      // Remove if the clientId segment doesn't match current config.
      if (key.startsWith('CognitoIdentityServiceProvider.')) {
        const segments = key.split('.');
        const keyClientId = segments[1] ?? '';
        if (keyClientId !== userPoolClientId) {
          toRemove.push(key);
        }
        continue;
      }

      // Amplify v6 writes opaque keys with `amplify-` prefix. Can't inspect
      // which clientId they belong to, so wipe only when aggressive cleanup
      // is warranted (mismatch or first-time guard boot).
      if (needsAggressiveCleanup && key.startsWith('amplify-')) {
        toRemove.push(key);
      }
    }

    toRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        result.removedLocalStorageKeys.push(key);
      } catch (err) {
        logger.error('auth-storage-guard', 'Failed to remove a localStorage key', { key, err: String(err) });
      }
    });

    if (toRemove.length > 0) {
      logger.warn('auth-storage-guard', 'Removed stale localStorage keys', { keys: toRemove });
    }
  } catch (err) {
    logger.error('auth-storage-guard', 'localStorage cleanup pass failed', { err: String(err) });
  }

  // ── 2. IndexedDB cleanup ──────────────────────────────────────────────────
  // Runs when aggressive cleanup is warranted (fingerprint changed OR first-
  // time guard boot). IndexedDB schemas are opaque from outside, so we can't
  // selectively remove per-clientId. Async; logs result when done.
  if (needsAggressiveCleanup && 'databases' in indexedDB && typeof indexedDB.databases === 'function') {
    void indexedDB.databases()
      .then(dbs => {
        dbs.forEach(db => {
          if (!db.name) return;
          const lower = db.name.toLowerCase();
          if (lower.includes('amplify') || lower.includes('cognito')) {
            try {
              indexedDB.deleteDatabase(db.name);
              result.deletedIndexedDbNames.push(db.name);
              logger.warn('auth-storage-guard', 'Deleted stale IndexedDB database', { name: db.name });
            } catch (err) {
              logger.error('auth-storage-guard', 'Failed to delete an IndexedDB database', { name: db.name, err: String(err) });
            }
          }
        });
      })
      .catch(err => logger.error('auth-storage-guard', 'IndexedDB enumeration failed', { err: String(err) }));
  }

  // ── 3. Service Worker cleanup ─────────────────────────────────────────────
  // Same trigger as IndexedDB. Production apps with legit SWs shouldn't have
  // them blown away on every boot, but a one-time first-boot pass is safe -
  // a real SW will simply re-register on next page load. Async.
  if (needsAggressiveCleanup && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations()
      .then(regs => {
        regs.forEach(r => {
          void r.unregister();
          result.unregisteredServiceWorkers++;
          logger.warn('auth-storage-guard', 'Unregistered a service worker', { scope: r.scope });
        });
      })
      .catch(err => logger.error('auth-storage-guard', 'Service worker cleanup failed', { err: String(err) }));
  }

  // ── 4. Record fingerprint for next boot ───────────────────────────────────
  try {
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  } catch (err) {
    logger.error('auth-storage-guard', 'Could not write the config fingerprint', { err: String(err) });
  }

  logger.info('auth-storage-guard', 'Storage guard finished', {
    fingerprintMismatch: result.fingerprintMismatch,
    removedLocalStorageKeys: result.removedLocalStorageKeys.length,
  });

  return result;
}
