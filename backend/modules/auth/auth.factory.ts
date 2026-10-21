import type { AuthService } from './auth.service';
import { CognitoAuthService } from './cognito-auth.service';
import { ManualAuthService } from './manual-auth.service';

let instance: AuthService | null = null;

/** Which auth provider this process uses. Default 'manual' (DB-backed, also
 *  accepted as 'custom'); 'aws' = Cognito. */
export function authProvider(): 'aws' | 'manual' {
  const raw = (process.env['AUTH_PROVIDER'] ?? 'manual').trim().toLowerCase();
  return raw === 'aws' ? 'aws' : 'manual';
}

/** Returns the active AuthService. Lazy - instantiated on first call. */
export function getAuthService(): AuthService {
  if (!instance) {
    instance = authProvider() === 'manual' ? new ManualAuthService() : new CognitoAuthService();
  }
  return instance;
}

/** Returns the active ManualAuthService, or null when running AWS mode. */
export function getManualAuthService(): ManualAuthService | null {
  const svc = getAuthService();
  return svc instanceof ManualAuthService ? svc : null;
}

/** Test seam - inject MockAuthService in unit tests. */
export function setAuthService(svc: AuthService): void {
  instance = svc;
}
