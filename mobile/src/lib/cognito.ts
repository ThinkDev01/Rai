/**
 * Direct Cognito client for React Native — ported from web lib/cognito-client.ts.
 *
 * Same approach as the web app: thin fetch wrapper over Cognito's documented
 * HTTPS API (`cognito-idp.<region>.amazonaws.com/`). No Amplify SDK, no SRP.
 *
 * RN differences vs web:
 *   - Tokens live in AsyncStorage (async) instead of localStorage (sync), so
 *     getTokens() / signOut() are async.
 *   - JWT claims decoded with a local base64url decoder (no atob dependency).
 *   - Federated (Google/Microsoft) PKCE flow requires extra native polyfills
 *     (react-native-get-random-values + a SHA-256 impl) and deep-link wiring;
 *     it's stubbed to throw a clear error until those are added. Native
 *     email/password auth is fully functional.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { ENV } from '@/config/env';
import { randomBase64Url, pkceChallenge } from '@/lib/pkce';

const REGION = ENV.AWS_REGION;
const CLIENT_ID = ENV.CLIENT_ID;
const DOMAIN = ENV.COGNITO_DOMAIN;
const OAUTH_REDIRECT = ENV.OAUTH_REDIRECT;
const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;
const STORAGE_KEY = 'rai.cognito.tokens';
const PKCE_VERIFIER_KEY = 'rai.oauth.verifier';
const PKCE_STATE_KEY = 'rai.oauth.state';

/** Manual x-www-form-urlencoded encoder (RN's URLSearchParams can be unreliable). */
function urlEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch when accessToken expires
}

export interface SignInResult {
  isSignedIn: boolean;
  nextStep: string | null;
}

export interface SignUpResult {
  userConfirmed: boolean;
  deliveryMedium: string | null;
  destination: string | null;
}

interface InitiateAuthResponse {
  AuthenticationResult?: {
    AccessToken: string;
    IdToken: string;
    RefreshToken?: string;
    ExpiresIn: number;
    TokenType: string;
  };
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
}

interface SignUpResponse {
  UserSub: string;
  UserConfirmed: boolean;
  CodeDeliveryDetails?: { DeliveryMedium: string; Destination: string };
}

// ── Single chokepoint for cognito-idp HTTPS API calls ──────────────────────────
async function cognito<T>(target: string, body: object): Promise<T> {
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
    throw err;
  }

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const d = data as { __type?: string; message?: string };
    const errName = d.__type?.split('#').pop() ?? 'CognitoError';
    const errMessage = d.message ?? `Cognito ${target} failed (${res.status})`;
    const err = new Error(errMessage);
    err.name = errName;
    throw err;
  }
  return data as T;
}

// ── Token storage (AsyncStorage) ───────────────────────────────────────────────
export async function getTokens(): Promise<CognitoTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return null;
  }
}

async function storeTokens(t: CognitoTokens): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

async function clearTokens(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ── base64url JWT decode (no atob dependency) ──────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Decode(input: string): string {
  let str = input.replace(/=+$/, '');
  let output = '';
  let bc = 0;
  let bs = 0;
  for (let i = 0; i < str.length; i++) {
    const buffer = B64.indexOf(str.charAt(i));
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }
  return output;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      base64Decode(b64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Sign-in (USER_PASSWORD_AUTH) ───────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const res = await cognito<InitiateAuthResponse>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (res.ChallengeName) return { isSignedIn: false, nextStep: res.ChallengeName };
  if (!res.AuthenticationResult) {
    throw new Error('Cognito returned neither tokens nor a challenge');
  }
  await storeTokens({
    idToken: res.AuthenticationResult.IdToken,
    accessToken: res.AuthenticationResult.AccessToken,
    refreshToken: res.AuthenticationResult.RefreshToken ?? '',
    expiresAt: Date.now() + res.AuthenticationResult.ExpiresIn * 1000,
  });
  return { isSignedIn: true, nextStep: null };
}

// ── Sign-out ───────────────────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  const tokens = await getTokens();
  // Clear local tokens FIRST so logout is immediate and never blocked by the
  // (untimed) GlobalSignOut network call.
  await clearTokens();
  if (tokens?.accessToken && accessTokenHasAdminScope(tokens.accessToken)) {
    try {
      await cognito<unknown>('GlobalSignOut', { AccessToken: tokens.accessToken });
    } catch {
      /* best-effort server-side revoke */
    }
  }
}

function accessTokenHasAdminScope(accessToken: string): boolean {
  const payload = decodeJwtPayload(accessToken) as { scope?: string } | null;
  const scopes = payload?.scope?.split(' ') ?? [];
  return scopes.includes('aws.cognito.signin.user.admin');
}

// ── Sign-up ─────────────────────────────────────────────────────────────────────
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  const res = await cognito<SignUpResponse>('SignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
    ],
  });
  return {
    userConfirmed: res.UserConfirmed,
    deliveryMedium: res.CodeDeliveryDetails?.DeliveryMedium ?? null,
    destination: res.CodeDeliveryDetails?.Destination ?? null,
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognito<unknown>('ConfirmSignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function resendSignUpCode(email: string): Promise<void> {
  await cognito<unknown>('ResendConfirmationCode', {
    ClientId: CLIENT_ID,
    Username: email,
  });
}

// ── Change password (authenticated) ────────────────────────────────────────────
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const tokens = await getTokens();
  if (!tokens?.accessToken) throw new Error('Not signed in');
  await cognito<unknown>('ChangePassword', {
    AccessToken: tokens.accessToken,
    PreviousPassword: currentPassword,
    ProposedPassword: newPassword,
  });
}

// ── Forgot password ─────────────────────────────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  await cognito<unknown>('ForgotPassword', { ClientId: CLIENT_ID, Username: email });
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await cognito<unknown>('ConfirmForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

// ── Token getter (auto-refresh near expiry) ─────────────────────────────────────
export async function getIdToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  const expiringSoon = Date.now() > tokens.expiresAt - 60_000;
  if (!expiringSoon) return tokens.idToken;

  if (!tokens.refreshToken) {
    await clearTokens();
    return null;
  }
  try {
    const res = await cognito<InitiateAuthResponse>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: tokens.refreshToken },
    });
    if (!res.AuthenticationResult) throw new Error('Refresh returned no result');
    const refreshed: CognitoTokens = {
      idToken: res.AuthenticationResult.IdToken,
      accessToken: res.AuthenticationResult.AccessToken,
      refreshToken: res.AuthenticationResult.RefreshToken ?? tokens.refreshToken,
      expiresAt: Date.now() + res.AuthenticationResult.ExpiresIn * 1000,
    };
    await storeTokens(refreshed);
    return refreshed.idToken;
  } catch {
    await clearTokens();
    return null;
  }
}

/** Force a token refresh (used after backend org-switch). */
export async function refreshTokens(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  await storeTokens({ ...tokens, expiresAt: 0 });
  return getIdToken();
}

// ── Claims ───────────────────────────────────────────────────────────────────────
export async function parseIdTokenClaims(): Promise<Record<string, unknown> | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  return decodeJwtPayload(tokens.idToken);
}

export async function isFederatedUser(): Promise<boolean> {
  const claims = await parseIdTokenClaims();
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

export async function federatedProvider(): Promise<string | null> {
  const claims = await parseIdTokenClaims();
  if (!claims) return null;
  const raw = claims['identities'];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) list = p;
    } catch {
      /* noop */
    }
  }
  const first = list[0] as { providerName?: string } | undefined;
  return first?.providerName ?? null;
}

// ── Federation (Google / Microsoft via Cognito Hosted UI + deep link) ──────────
interface OAuthTokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Open the Hosted UI for a federated provider. Cognito redirects back to the
 *  app's deep-link scheme (ENV.OAUTH_REDIRECT) with `?code=` on success. */
export async function startFederatedSignIn(provider: 'Google' | 'Microsoft'): Promise<void> {
  if (!DOMAIN) throw new Error('COGNITO_DOMAIN not configured');
  const verifier = randomBase64Url(32);
  const challenge = pkceChallenge(verifier);
  const state = randomBase64Url(16);
  await AsyncStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  await AsyncStorage.setItem(PKCE_STATE_KEY, state);
  const url =
    `https://${DOMAIN}/oauth2/authorize?` +
    urlEncode({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      scope: 'openid email profile',
      identity_provider: provider,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
  await Linking.openURL(url);
}

/** Exchange the authorization code (from the deep-link callback) for tokens. */
export async function completeFederatedSignIn(code: string, returnedState: string | null): Promise<void> {
  if (!DOMAIN) throw new Error('COGNITO_DOMAIN not configured');
  const verifier = await AsyncStorage.getItem(PKCE_VERIFIER_KEY);
  const storedState = await AsyncStorage.getItem(PKCE_STATE_KEY);
  if (!verifier) throw new Error('PKCE verifier missing — start sign-in again');
  if (returnedState && storedState && returnedState !== storedState) {
    throw new Error('OAuth state mismatch — please retry');
  }
  const res = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: urlEncode({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: OAUTH_REDIRECT,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 120)}`);
  }
  const tokens = (await res.json()) as OAuthTokenResponse;
  if (!tokens.id_token) throw new Error('Token endpoint returned no id_token');
  await storeTokens({
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });
  await AsyncStorage.removeItem(PKCE_VERIFIER_KEY);
  await AsyncStorage.removeItem(PKCE_STATE_KEY);
}

export const isFederationConfigured = Boolean(DOMAIN);
