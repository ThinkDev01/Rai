import axios from 'axios';
import api from '@/lib/api';
import { logger } from '@/lib/logger';

// Persist "last active org" to Cognito's `custom:current_org_id` attribute
// via POST /auth/switch-org. Called continuously from the org layout's
// slug-mirror effect (fire-and-forget). Result is "next fresh login lands the
// user back on this org" — survives session expiry + cross-device.
//
// Failure policy:
//   - Transient (network error, 5xx, 408, 429) → bounded retry with backoff
//   - Permanent (4xx other than 408/429)       → log + give up
//   - Final failure after retries              → logger.error with [ALERT]
//     prefix so it stands out in console. The user's actual session is
//     unaffected — only the "remember this org" niceity is lost for now.
//
// Why we don't surface failures in UI: this is a background convenience
// write. The user's current-session navigation works regardless (URL slug is
// source of truth). Bothering them about a Cognito write failure they can't
// fix would be noise.

const MAX_ATTEMPTS    = 3;
const BACKOFF_BASE_MS = 400; // 400ms, 800ms, 1600ms

export async function rememberLastOrgForNextLogin(orgId: string | null): Promise<void> {
  if (!orgId) return;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await api.post('/auth/switch-org', { orgId });
      logger.info('lastOrg', 'persisted last org to Cognito for next login', {
        orgId,
        attempt,
      });
      return;
    } catch (err) {
      const isLast       = attempt === MAX_ATTEMPTS;
      const retriable    = isRetriable(err);
      const status       = axios.isAxiosError(err) ? err.response?.status : undefined;
      const errMessage   = err instanceof Error ? err.message : String(err);

      if (!retriable) {
        logger.error('lastOrg', '[ALERT] failed to persist last org (non-retriable) - giving up', {
          orgId, attempt, status, error: errMessage,
        });
        return;
      }

      if (isLast) {
        logger.error('lastOrg', '[ALERT] failed to persist last org after all retries - giving up', {
          orgId, attempts: MAX_ATTEMPTS, status, error: errMessage,
        });
        return;
      }

      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      logger.warn('lastOrg', 'transient failure persisting last org - retrying', {
        orgId, attempt, nextDelayMs: delayMs, status, error: errMessage,
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Retriable: network error (no response), or HTTP status in the transient set.
// 408 Request Timeout, 429 Too Many Requests, 5xx server errors.
// Everything else (400 bad request, 401 unauthorized, 403 forbidden, 404 not
// found, etc.) is permanent — retrying just wastes attempts.
function isRetriable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) {
    // Not an axios error - likely thrown by a non-network code path. Treat as
    // retriable; if it keeps failing, the final-error log will surface it.
    return true;
  }
  if (!err.response) {
    // Network error / timeout / DNS / connection-refused / etc.
    return true;
  }
  const status = err.response.status;
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}
