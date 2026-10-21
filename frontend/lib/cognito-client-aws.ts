'use client';

import { runAuthStorageGuard } from './auth-storage-guard';
import { ENV, logEnvSummary } from './env';
import { logger } from './logger';
import { markFreshLogin } from './boardFilters';

/**
 * Direct Cognito client - replaces aws-amplify SDK for the entire auth flow.
 *
 * Why this exists:
 *   Amplify v6's auth state machine triggers WebCrypto + storage observer +
 *   Hub event work BEFORE making any HTTP call. Keystroke-encryption browser
 *   security software (Webroot Identity Shield, certain corporate AVs) hooks
 *   those APIs and intercepts the pre-flight - Amplify hangs indefinitely,
 *   no request ever leaves the browser. See feedback_avoid_amplify_sdk.md.
 *
 * What this is:
 *   Thin fetch-based wrapper over Cognito's documented HTTPS API
 *   (`cognito-idp.<region>.amazonaws.com/` and `<domain>/oauth2/token` for
 *   federation). No SDK, no WebCrypto for SRP, no internal state machine.
 *   AWS-supported public API - the same one the AWS CLI uses for
 *   `cognito-idp initiate-auth`.
 *
 * Coverage:
 *   - signIn (USER_PASSWORD_AUTH)
 *   - signOut (GlobalSignOut + local clear)
 *   - signUp / confirmSignUp / resendSignUpCode
 *   - forgotPassword / confirmForgotPassword
 *   - getIdToken (auto-refresh near expiry)
 *   - refreshTokens (forced - used after backend org-switch)
 *   - parseIdTokenClaims
 *   - startFederatedSignIn / completeFederatedSignIn (Google + Microsoft)
 *
 * Token storage: single localStorage key (`rai.cognito.tokens`). PKCE state
 * lives in sessionStorage (dies on tab close - narrower attack window).
 *
 * Production-safe: direct API calls to Cognito are documented, versioned,
 * and stable. Many enterprise apps use this pattern when SDKs hit
 * client-environment edge cases.
 */

// ── Env (centralized in ./env, baked at build time) ─────────────────────────
const REGION       = ENV.AWS_REGION;
const USER_POOL_ID = ENV.USER_POOL_ID;
const CLIENT_ID    = ENV.CLIENT_ID;
const DOMAIN       = ENV.COGNITO_DOMAIN;
const OAUTH_REDIRECT = ENV.OAUTH_SIGNIN;

if (typeof window !== 'undefined') {
  logEnvSummary();
  if (ENV.AUTH_PROVIDER !== 'manual' && ENV.AUTH_PROVIDER !== 'custom' && (!REGION || !USER_POOL_ID || !CLIENT_ID)) {
    logger.error('cognito-client', 'FATAL: Cognito env vars missing — NEXT_PUBLIC_COGNITO_REGION / NEXT_PUBLIC_COGNITO_POOL_ID / NEXT_PUBLIC_COGNITO_CLIENT_ID');
  } else if (ENV.AUTH_PROVIDER !== 'manual' && ENV.AUTH_PROVIDER !== 'custom') {
    // Run storage guard on first module import so stale browser state from a
    // previous pool/client is sanitized before any auth call. Skipped in
    // manual mode — there's no Cognito storage to guard.
    try {
      runAuthStorageGuard(USER_POOL_ID, CLIENT_ID);
    } catch (err) {
      logger.error('cognito-client', 'Storage guard threw — proceeding anyway', { err: String(err) });
    }
  }
}

const ENDPOINT    = `https://cognito-idp.${REGION}.amazonaws.com/`;
const STORAGE_KEY = 'rai.cognito.tokens';

// ── Types ───────────────────────────────────────────────────────────────────
export interface CognitoTokens {
  idToken:      string;
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;  // ms epoch when accessToken expires
}

export interface SignInResult {
  isSignedIn: boolean;
  nextStep:   string | null;  // Cognito ChallengeName when additional step required
}

export interface SignUpResult {
  userConfirmed:  boolean;
  deliveryMedium: string | null;  // 'EMAIL' typically
  destination:    string | null;  // masked email
}

interface InitiateAuthResponse {
  AuthenticationResult?: {
    AccessToken:   string;
    IdToken:       string;
    RefreshToken?: string;
    ExpiresIn:     number;
    TokenType:     string;
  };
  ChallengeName?:       string;
  ChallengeParameters?: Record<string, string>;
  Session?:             string;
}

interface SignUpResponse {
  UserSub:         string;
  UserConfirmed:   boolean;
  CodeDeliveryDetails?: {
    DeliveryMedium: string;
    Destination:    string;
  };
}

interface OAuthTokenResponse {
  id_token:      string;
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  token_type:    string;
}

// ── Single chokepoint for cognito-idp HTTPS API calls ──────────────────────
async function cognito<T>(target: string, body: object, opLabel: string): Promise<T> {
  logger.info('cognito-client', `${opLabel} — calling Cognito`, { target });
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    logger.error('cognito-client', `${opLabel} — network error`, { ms, err: String(err) });
    throw err;
  }

  const ms   = Math.round(performance.now() - started);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errName    = (data.__type as string | undefined)?.split('#').pop() ?? 'CognitoError';
    const errMessage = (data.message as string | undefined) ?? `Cognito ${target} failed (${res.status})`;
    const err = new Error(errMessage);
    err.name = errName;
    logger.error('cognito-client', `${opLabel} — Cognito returned an error`, { ms, status: res.status, name: errName, message: errMessage });
    throw err;
  }

  logger.info('cognito-client', `${opLabel} — success`, { ms });
  return data as T;
}

// ── Local token storage ─────────────────────────────────────────────────────
export function getTokens(): CognitoTokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    logger.warn('cognito-client', 'Stored token blob is corrupt — clearing it');
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function storeTokens(t: CognitoTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Sign-in (USER_PASSWORD_AUTH) ────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<SignInResult> {
  logger.info('cognito-client', 'Sign-in started', { email });
  const res = await cognito<InitiateAuthResponse>(
    'InitiateAuth',
    {
      AuthFlow:       'USER_PASSWORD_AUTH',
      ClientId:       CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    },
    'InitiateAuth(USER_PASSWORD_AUTH)',
  );

  if (res.ChallengeName) {
    logger.info('cognito-client', 'Sign-in needs an extra challenge step', { challenge: res.ChallengeName });
    return { isSignedIn: false, nextStep: res.ChallengeName };
  }

  if (!res.AuthenticationResult) {
    throw new Error('Cognito returned neither tokens nor a challenge');
  }

  storeTokens({
    idToken:      res.AuthenticationResult.IdToken,
    accessToken:  res.AuthenticationResult.AccessToken,
    refreshToken: res.AuthenticationResult.RefreshToken ?? '',
    expiresAt:    Date.now() + res.AuthenticationResult.ExpiresIn * 1000,
  });
  // Fresh login (not a silent token refresh) - flag it so hydrate() clears
  // this user's saved board assignee filter once /me resolves their real
  // (DB) user id. Can't clear by id here directly: all we have at this
  // point is the Cognito sub, which is a different id from the one
  // ProjectSubNav's storage keys use (see boardFilters.ts).
  markFreshLogin();
  logger.info('cognito-client', 'Sign-in succeeded');
  return { isSignedIn: true, nextStep: null };
}

// ── Sign-out ────────────────────────────────────────────────────────────────
// GlobalSignOut requires the `aws.cognito.signin.user.admin` scope on the
// access token. Native (USER_PASSWORD_AUTH) tokens have it. Federated
// (Google/Microsoft via Hosted UI) tokens DON'T - they only carry the OAuth
// scopes we requested (`openid email profile`). Trying GlobalSignOut on a
// federated token returns 400 NotAuthorizedException. So we check first and
// skip the call when the scope is absent. Local token clear runs either way -
// that's what actually logs the user out as far as the UI is concerned.
export async function signOut(): Promise<void> {
  logger.info('cognito-client', 'Sign-out started');
  const tokens = getTokens();
  if (tokens?.accessToken && accessTokenHasAdminScope(tokens.accessToken)) {
    try {
      await cognito<unknown>(
        'GlobalSignOut',
        { AccessToken: tokens.accessToken },
        'GlobalSignOut',
      );
    } catch (err) {
      logger.warn('cognito-client', 'Sign-out — server-side token revoke failed (ignored, clearing locally)', { err: String(err) });
    }
  } else if (tokens) {
    logger.info('cognito-client', 'Sign-out — federated token has no admin scope, skipping server-side revoke');
  }
  clearTokens();
}

function accessTokenHasAdminScope(accessToken: string): boolean {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return false;
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/'))) as { scope?: string };
    const scopes  = decoded.scope?.split(' ') ?? [];
    return scopes.includes('aws.cognito.signin.user.admin');
  } catch {
    return false;
  }
}

// ── Sign-up ─────────────────────────────────────────────────────────────────
export async function signUp(email: string, password: string, name: string): Promise<SignUpResult> {
  logger.info('cognito-client', 'Sign-up started', { email, hasName: Boolean(name) });
  const res = await cognito<SignUpResponse>(
    'SignUp',
    {
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name',  Value: name  },
      ],
    },
    'SignUp',
  );
  return {
    userConfirmed:  res.UserConfirmed,
    deliveryMedium: res.CodeDeliveryDetails?.DeliveryMedium ?? null,
    destination:    res.CodeDeliveryDetails?.Destination    ?? null,
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  logger.info('cognito-client', 'Confirming sign-up code', { email });
  await cognito<unknown>(
    'ConfirmSignUp',
    {
      ClientId:         CLIENT_ID,
      Username:         email,
      ConfirmationCode: code,
    },
    'ConfirmSignUp',
  );
}

export async function resendSignUpCode(email: string): Promise<void> {
  logger.info('cognito-client', 'Resending sign-up confirmation code', { email });
  await cognito<unknown>(
    'ResendConfirmationCode',
    { ClientId: CLIENT_ID, Username: email },
    'ResendConfirmationCode',
  );
}

// ── Change password (authenticated user, knows current password) ───────────
// Distinct from ForgotPassword (which is the "I lost my password" reset flow).
// Cognito's ChangePassword API takes the access token (not id token), the
// current password, and the new one. Returns standard error names on policy
// violations / wrong current password - frontend parses to friendly text.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  logger.info('cognito-client', 'Changing password for the signed-in user');
  const tokens = getTokens();
  if (!tokens?.accessToken) {
    throw new Error('Not signed in');
  }
  await cognito<unknown>(
    'ChangePassword',
    {
      AccessToken:      tokens.accessToken,
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword,
    },
    'ChangePassword',
  );
}

// ── Forgot password (request code) ─────────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  logger.info('cognito-client', 'Requesting a password-reset code', { email });
  await cognito<unknown>(
    'ForgotPassword',
    { ClientId: CLIENT_ID, Username: email },
    'ForgotPassword',
  );
}

// ── Forgot password (confirm new password with code) ───────────────────────
export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  logger.info('cognito-client', 'Confirming password reset with code', { email });
  await cognito<unknown>(
    'ConfirmForgotPassword',
    {
      ClientId:         CLIENT_ID,
      Username:         email,
      ConfirmationCode: code,
      Password:         newPassword,
    },
    'ConfirmForgotPassword',
  );
}

// ── Token getter (auto-refresh near expiry) ────────────────────────────────
export async function getIdToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;

  const expiringSoon = Date.now() > tokens.expiresAt - 60_000;
  if (!expiringSoon) return tokens.idToken;

  if (!tokens.refreshToken) {
    logger.warn('cognito-client', 'No refresh token available — clearing tokens');
    clearTokens();
    return null;
  }

  logger.info('cognito-client', 'Access token expiring soon — refreshing');
  try {
    const res = await cognito<InitiateAuthResponse>(
      'InitiateAuth',
      {
        AuthFlow:       'REFRESH_TOKEN_AUTH',
        ClientId:       CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: tokens.refreshToken },
      },
      'InitiateAuth(REFRESH_TOKEN_AUTH)',
    );

    if (!res.AuthenticationResult) {
      throw new Error('Refresh returned no AuthenticationResult');
    }

    const refreshed: CognitoTokens = {
      idToken:      res.AuthenticationResult.IdToken,
      accessToken:  res.AuthenticationResult.AccessToken,
      refreshToken: res.AuthenticationResult.RefreshToken ?? tokens.refreshToken,
      expiresAt:    Date.now() + res.AuthenticationResult.ExpiresIn * 1000,
    };
    storeTokens(refreshed);
    return refreshed.idToken;
  } catch (err) {
    logger.error('cognito-client', 'Token refresh failed — clearing tokens', { err: String(err) });
    clearTokens();
    return null;
  }
}

// ── Force refresh (used after backend org-switch updates current_org_id) ───
export async function refreshTokens(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  storeTokens({ ...tokens, expiresAt: 0 });
  return getIdToken();
}

// ── Read claims locally (backend verifies signature) ───────────────────────
export function parseIdTokenClaims(): Record<string, unknown> | null {
  const tokens = getTokens();
  if (!tokens) return null;
  try {
    const payload = tokens.idToken.split('.')[1];
    if (!payload) return null;
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch (err) {
    logger.error('cognito-client', 'Failed to parse ID token claims', { err: String(err) });
    return null;
  }
}

// ── Sub of the currently stored ID token (cross-tab identity check) ───────
// Returns the `sub` claim of whatever ID token is in localStorage right now,
// or null if no tokens / unparseable. Used by the (app) layout's storage-event
// listener to detect when another tab signed in as a different account: if
// the sub of the stored token no longer matches the sub of the user in our
// zustand store, this tab's session is stale and must be reconciled.
export function getStoredIdTokenSub(): string | null {
  const claims = parseIdTokenClaims();
  if (!claims) return null;
  const sub = claims['sub'];
  return typeof sub === 'string' ? sub : null;
}

// ── Federation detection from the current ID token ────────────────────────
// Federated users (Google/Microsoft) sign in via the IdP - they have no
// Cognito-managed password, so ChangePassword always 400s for them. Settings
// uses this to hide the password-change UI for federated accounts.
//
// Cognito stamps the `identities` claim on JWTs for federated users; native
// password users have no `identities` claim at all. The claim is sometimes an
// array, sometimes a JSON string (varies by token type) - handle both.
export function isFederatedUser(): boolean {
  const claims = parseIdTokenClaims();
  if (!claims) return false;
  const raw = claims['identities'];
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/** Best-effort name of the federated provider (e.g. "Google") or null for native. */
export function federatedProvider(): string | null {
  const claims = parseIdTokenClaims();
  if (!claims) return null;
  const raw = claims['identities'];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) list = p; } catch { /* noop */ }
  }
  const first = list[0] as { providerName?: string } | undefined;
  return first?.providerName ?? null;
}

// ── Federation (Google + Microsoft via Cognito Hosted UI) ──────────────────
// The OAuth flow is: redirect to Cognito Hosted UI -> Cognito routes to IdP ->
// IdP authenticates -> Cognito creates/links user -> redirects back with code
// -> we exchange code for tokens at /oauth2/token.
//
// PKCE state lives in sessionStorage (cleared on tab close). Code-verifier
// and state are 256-bit random; SHA-256(verifier) is the challenge.

const PKCE_VERIFIER_KEY = 'rai.oauth.verifier';
const PKCE_STATE_KEY    = 'rai.oauth.state';
const PKCE_PROVIDER_KEY = 'rai.oauth.provider';
// Where to land after a successful OAuth round-trip. Persisted across the
// IdP redirect so the callback can honor an invite link (or any other
// pre-auth target) instead of always falling back to /welcome.
const POST_LOGIN_KEY    = 'rai.oauth.postLogin';

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startFederatedSignIn(
  provider: 'Google' | 'Microsoft',
  /**
   * Optional path to navigate to after the OAuth callback completes. Used to
   * preserve an invite link across the IdP roundtrip: caller passes
   * `/invite/<token>`; callback reads it back via `consumePostLoginRedirect`.
   * If omitted (or null), callback defaults to `/welcome`.
   */
  postLoginPath?: string | null,
): Promise<void> {
  logger.info('cognito-client', 'Federated sign-in started', { provider, postLoginPath });
  if (!DOMAIN) throw new Error('NEXT_PUBLIC_COGNITO_DOMAIN not configured');
  if (!CLIENT_ID) throw new Error('NEXT_PUBLIC_COGNITO_APP_CLIENT_ID not configured');

  // PKCE: 32 random bytes → base64url verifier; SHA-256 → base64url challenge.
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier      = base64UrlEncode(verifierBytes.buffer);
  const challengeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge     = base64UrlEncode(challengeHash);
  const state         = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer);

  // sessionStorage - narrower attack window than localStorage; cleared on tab close.
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY,    state);
  sessionStorage.setItem(PKCE_PROVIDER_KEY, provider);
  // Always start clean - a stale value from a previous attempt could redirect
  // the user somewhere they didn't intend.
  if (postLoginPath) {
    sessionStorage.setItem(POST_LOGIN_KEY, postLoginPath);
  } else {
    sessionStorage.removeItem(POST_LOGIN_KEY);
  }

  const url = `https://${DOMAIN}/oauth2/authorize?` + new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          OAUTH_REDIRECT,
    scope:                 'openid email profile',
    identity_provider:     provider,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  logger.info('cognito-client', 'Redirecting to Cognito Hosted UI', { provider });
  window.location.href = url;
}

export async function completeFederatedSignIn(code: string, returnedState: string | null): Promise<void> {
  logger.info('cognito-client', 'Completing federated sign-in', { codePrefix: code.slice(0, 8) });
  if (!DOMAIN) throw new Error('NEXT_PUBLIC_COGNITO_DOMAIN not configured');
  if (!CLIENT_ID) throw new Error('NEXT_PUBLIC_COGNITO_APP_CLIENT_ID not configured');

  const verifier    = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const storedState = sessionStorage.getItem(PKCE_STATE_KEY);

  if (!verifier) {
    throw new Error('PKCE verifier missing - start sign-in again from /auth/login');
  }
  if (returnedState && storedState && returnedState !== storedState) {
    throw new Error('OAuth state mismatch - possible CSRF, please retry from /auth/login');
  }

  const tokenUrl = `https://${DOMAIN}/oauth2/token`;
  logger.info('cognito-client', 'Exchanging auth code at /oauth2/token');
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        code,
        redirect_uri:  OAUTH_REDIRECT,
        code_verifier: verifier,
      }).toString(),
    });
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    logger.error('cognito-client', '/oauth2/token network error', { ms, err: String(err) });
    throw err;
  }

  const ms = Math.round(performance.now() - started);
  if (!res.ok) {
    const body = await res.text();
    logger.error('cognito-client', '/oauth2/token returned an error', { ms, status: res.status, bodyPreview: body.slice(0, 200) });
    throw new Error(`Cognito /oauth2/token returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const tokens = (await res.json()) as OAuthTokenResponse;
  logger.info('cognito-client', '/oauth2/token succeeded', { ms, hasIdToken: Boolean(tokens.id_token) });

  if (!tokens.id_token) throw new Error('Token endpoint returned no id_token');

  storeTokens({
    idToken:      tokens.id_token,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt:    Date.now() + tokens.expires_in * 1000,
  });

  // Fresh login (not a silent token refresh) - see the same note in signIn()
  // above: flag it, let hydrate() clear by the real (DB) user id once known.
  markFreshLogin();

  // Clean up PKCE state - no longer needed.
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_PROVIDER_KEY);

  logger.info('cognito-client', 'Federated sign-in completed');
}

// ── Federation domain availability check (for conditional UI rendering) ────
export const isFederationConfigured = Boolean(DOMAIN);

/**
 * Read + clear the post-login redirect path that startFederatedSignIn stashed.
 * Returns null if none was set (the common case - default to /welcome).
 * Always consumes (one-shot) so a stale value can't redirect a later sign-in.
 */
export function consumePostLoginRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(POST_LOGIN_KEY);
  if (value) sessionStorage.removeItem(POST_LOGIN_KEY);
  return value;
}
