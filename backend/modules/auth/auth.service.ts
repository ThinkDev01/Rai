/**
 * AuthService - backend abstraction over the auth provider.
 * Frontend uses the provider SDK (Amplify) directly; backend uses this for
 * server-side ops that need admin credentials or JWT verification.
 *
 * Locked in docs/standards.md §8 (RF-16). Implementations:
 *   - CognitoAuthService - v2 production (this folder)
 *   - MockAuthService    - unit tests (deferred until test fixture work)
 */

export interface ExternalIdentity {
  providerName: string;   // 'Google' | 'Microsoft' | 'Cognito'
  providerType: string;   // 'Google' | 'OIDC' | 'Cognito'
  userId: string;
}

export interface NormalizedAuthContext {
  externalAuthId: string;
  email: string;
  emailVerified: boolean;
  /** Display name pulled from JWT - `name` claim preferred, falls back to
   *  `given_name + family_name`. Null when neither is present (rare). */
  name: string | null;
  currentOrgId: string | null;
  identities: ExternalIdentity[];
}

export interface AuthService {
  /** Verify a JWT and return normalized claims. Used by authMiddleware. */
  verifyAccessToken(token: string): Promise<NormalizedAuthContext>;

  /** Set the user's current_org_id custom attribute. User must refresh tokens to see the new claim. */
  switchOrg(externalAuthId: string, newOrgId: string): Promise<void>;

  /** Revoke all refresh tokens for a user (server-side logout). */
  logoutAll(externalAuthId: string): Promise<void>;

  /**
   * Link a federated identity to an existing native Cognito user.
   * Called by middleware on first federated login when email matches an existing verified user.
   */
  linkProvider(
    destExternalAuthId: string,
    sourceProviderName: 'Google' | 'Microsoft',
    sourceExternalAuthId: string,
  ): Promise<void>;
}
