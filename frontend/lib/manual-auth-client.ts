'use client';

// Manual auth client — AUTH_PROVIDER=manual. Thin fetch wrapper over the
// backend /auth/* endpoints, mirroring the EXACT public surface (names, shapes,
// error names) of cognito-client.ts so pages don't care which provider is on.
//
//   - Tokens live in the SAME localStorage key (rai.cognito.tokens) with the
//     same CognitoTokens shape, so getTokens/hydrate/CrossTabSync work unchanged.
//   - The idToken here is our own HS256 JWT (signed with the backend's
//     JWT_SECRET) — sub == users.id == external_auth_id.
//   - Backend errors carry a `code` (Cognito-style exception name, e.g.
//     NotAuthorizedException); we set err.name to it so the pages' existing
//     parseAuthError() branches keep working.
//   - No federation (Google/Microsoft): isFederationConfigured is false, so
//     the login page never renders the SSO buttons.

import { ENV } from './env';
import { logger } from './logger';
import { markFreshLogin } from './boardFilters';

const STORAGE_KEY = 'rai.cognito.tokens';

// ── Types (same shape as cognito-client) ────────────────────────────────────
export interface CognitoTokens {
  idToken:      string;
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number;  // ms epoch when accessToken expires
}

export interface SignInResult {
  isSignedIn: boolean;
  nextStep:   string | null;
}

export interface SignUpResult {
  userConfirmed:  boolean;
  deliveryMedium: string | null;
  destination:    string | null;
}

// ── HTTP helper (raw fetch — no axios, so no import cycle with lib/api.ts) ──
async function post<T>(path: string, body: object, token?: string | null): Promise<T> {
  const res = await fetch(`${ENV.API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try { data = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON body */ }

  if (!res.ok) {
    const message = typeof data['error'] === 'string' ? data['error'] : `Request failed (${res.status})`;
    const code = typeof data['code'] === 'string' ? data['code'] : undefined;
    const err = new Error(message);
    if (code) err.name = code;
    throw err;
  }
  return (data['data'] ?? {}) as T;
}

// ── Local token storage (same key as cognito mode) ─────────────────────────
export function getTokens(): CognitoTokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    logger.warn('manual-auth-client', 'Stored token blob is corrupt — clearing it');
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

// ── Sign-in ─────────────────────────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<SignInResult> {
  logger.info('manual-auth-client', 'Sign-in started', { email });
  const tokens = await post<CognitoTokens>('/auth/login', { email, password });
  storeTokens(tokens);
  // Fresh login — flag it so hydrate() clears this user's saved board filter
  // (same contract as cognito-client).
  markFreshLogin();
  logger.info('manual-auth-client', 'Sign-in succeeded');
  return { isSignedIn: true, nextStep: null };
}

// ── Sign-out ────────────────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  logger.info('manual-auth-client', 'Sign-out started');
  const tokens = getTokens();
  if (tokens?.idToken) {
    try {
      await post<Record<string, unknown>>('/auth/logout', {}, tokens.idToken);
    } catch (err) {
      logger.warn('manual-auth-client', 'Sign-out — server-side revoke failed (ignored, clearing locally)', { err: String(err) });
    }
  }
  clearTokens();
}

// ── Sign-up ─────────────────────────────────────────────────────────────────
export async function signUp(email: string, password: string, name: string): Promise<SignUpResult> {
  logger.info('manual-auth-client', 'Sign-up started', { email, hasName: Boolean(name) });
  const res = await post<{ deliveryConfirmation: string; destination: string }>(
    '/auth/signup',
    { email, password, name },
  );
  return {
    userConfirmed:  false,
    deliveryMedium: res.deliveryConfirmation ?? 'EMAIL',
    destination:    res.destination ?? null,
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  logger.info('manual-auth-client', 'Confirming sign-up code', { email });
  await post<Record<string, unknown>>('/auth/confirm-signup', { email, code });
}

export async function resendSignUpCode(email: string): Promise<void> {
  logger.info('manual-auth-client', 'Resending sign-up confirmation code', { email });
  await post<Record<string, unknown>>('/auth/resend-signup-code', { email });
}

// ── Change password (authenticated user, knows current password) ───────────
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  logger.info('manual-auth-client', 'Changing password for the signed-in user');
  const tokens = getTokens();
  if (!tokens?.idToken) {
    throw new Error('Not signed in');
  }
  await post<Record<string, unknown>>(
    '/auth/change-password',
    { currentPassword, newPassword },
    tokens.idToken,
  );
}

// ── Forgot password (request code) ─────────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  logger.info('manual-auth-client', 'Requesting a password-reset code', { email });
  await post<Record<string, unknown>>('/auth/forgot-password', { email });
}

// ── Forgot password (confirm new password with code) ───────────────────────
export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  logger.info('manual-auth-client', 'Confirming password reset with code', { email });
  await post<Record<string, unknown>>('/auth/confirm-forgot-password', { email, code, newPassword });
}

// ── Token getter (auto-refresh near expiry) ────────────────────────────────
export async function getIdToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;

  const expiringSoon = Date.now() > tokens.expiresAt - 60_000;
  if (!expiringSoon) return tokens.idToken;

  if (!tokens.refreshToken) {
    logger.warn('manual-auth-client', 'No refresh token available — clearing tokens');
    clearTokens();
    return null;
  }

  logger.info('manual-auth-client', 'Access token expiring soon — refreshing');
  try {
    const refreshed = await post<CognitoTokens>('/auth/refresh', { refreshToken: tokens.refreshToken });
    storeTokens(refreshed);
    return refreshed.idToken;
  } catch (err) {
    logger.error('manual-auth-client', 'Token refresh failed — clearing tokens', { err: String(err) });
    clearTokens();
    return null;
  }
}

// ── Force refresh (used after backend org-switch) ──────────────────────────
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
    logger.error('manual-auth-client', 'Failed to parse ID token claims', { err: String(err) });
    return null;
  }
}

// ── Sub of the currently stored ID token (cross-tab identity check) ───────
export function getStoredIdTokenSub(): string | null {
  const claims = parseIdTokenClaims();
  if (!claims) return null;
  const sub = claims['sub'];
  return typeof sub === 'string' ? sub : null;
}

// ── Federation — NOT available in manual mode ──────────────────────────────
export const isFederationConfigured = false;

export function isFederatedUser(): boolean {
  return false;
}

export function federatedProvider(): string | null {
  return null;
}

export async function startFederatedSignIn(): Promise<void> {
  throw new Error('Social sign-in is not available — use email and password');
}

export async function completeFederatedSignIn(): Promise<void> {
  throw new Error('Social sign-in is not available — use email and password');
}

const POST_LOGIN_KEY = 'rai.oauth.postLogin';

export function consumePostLoginRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(POST_LOGIN_KEY);
  if (value) sessionStorage.removeItem(POST_LOGIN_KEY);
  return value;
}