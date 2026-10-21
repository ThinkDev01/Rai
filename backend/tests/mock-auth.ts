/**
 * MockAuthService — the test double for the Cognito-backed AuthService.
 *
 * The `AuthService` interface (modules/auth/auth.service.ts) is the only seam
 * between our code and the real identity provider. `setAuthService()` lets tests
 * swap in this mock so NO real Cognito call ever happens. A "token" here is just
 * the user's external auth id (sub) — `register(token, …)` teaches the mock who
 * that token belongs to, and `verifyAccessToken` hands back the claims our
 * authMiddleware expects.
 *
 * Org context is NOT carried in the token here — tests pick the active org per
 * request via the `X-Org-Id` header (see helpers.ts → req()), exactly like the
 * real frontend does. That keeps tokens stateless across org switches.
 */
import type { AuthService, NormalizedAuthContext } from '../modules/auth/auth.service';
import { setAuthService } from '../modules/auth/auth.factory';

class MockAuthService implements AuthService {
  private users = new Map<string, { email: string; name: string | null }>();

  /** Teach the mock about a token (sub) → identity. Call before using the token. */
  register(token: string, email: string, name: string | null): void {
    this.users.set(token, { email, name });
  }

  /** Forget all tokens — call between tests to avoid cross-test leakage. */
  reset(): void {
    this.users.clear();
  }

  async verifyAccessToken(token: string): Promise<NormalizedAuthContext> {
    const u = this.users.get(token);
    if (!u) throw new Error(`MockAuthService: unknown token "${token}"`);
    return {
      externalAuthId: token,
      email: u.email,
      emailVerified: true,
      name: u.name,
      currentOrgId: null, // org is resolved from the X-Org-Id header in tests
      identities: [{ providerName: 'Cognito', providerType: 'Cognito', userId: token }],
    };
  }

  // The mutating provider calls are no-ops in tests — we assert on DB/HTTP state,
  // not on Cognito side effects.
  async switchOrg(): Promise<void> {}
  async logoutAll(): Promise<void> {}
  async linkProvider(): Promise<void> {}
}

/** Shared mock instance, injected into the factory on import. */
export const mockAuth = new MockAuthService();
setAuthService(mockAuth);
