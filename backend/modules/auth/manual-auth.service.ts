// ManualAuthService - DB-backed auth provider, activated by AUTH_PROVIDER=manual.
//
// Replicates the AuthService contract that CognitoAuthService fulfils for AWS,
// plus the signup/signin/refresh endpoints Cognito handled client-side. Same
// lazy-sync + org-resolution flow on the middleware side, so swapping providers
// only changes WHERE tokens come from, never the request handling.
//
// Design (mirrors what Cognito provides):
//   - HS256 JWT access tokens (1h) signed with JWT_SECRET. `sub` = the user's
//     external_auth_id (== users.id for manual users). Carries email, name,
//     email_verified as claims; current_org_id is read fresh from the users
//     row (never embedded), so org switches need no token refresh.
//   - Opaque refresh tokens (30d), stored SHA-256-hashed in refresh_tokens.
//     Refresh rotates the token; logout + password change revoke all rows.
//   - Email verification (signup) + password reset via 6-digit codes, stored
//     hashed in auth_codes and delivered by the Email service (Resend).
//   - No federation (Google/Microsoft) - password signin only.

import { createHash, randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { uuidv7 } from 'uuidv7';
import logger from '../../config/logger';
import { isDev } from '../../config/env';
import { sendEmail } from '../email/email.service';
import type { AuthService, NormalizedAuthContext } from './auth.service';
import {
  createAuthCode,
  deleteRefreshTokenByHash,
  findRefreshTokenByHash,
  findUserById,
  findUserByExternalAuthId,
  findUserByEmail,
  findUserCredentialsByEmail,
  insertManualUser,
  insertRefreshToken,
  revokeAllRefreshTokens,
  setUserCurrentOrgId,
  setUserEmailVerified,
  updateUserPassword,
  verifyAuthCode,
} from './auth.model';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;        // 1h — same ballpark as Cognito
export const REFRESH_TOKEN_TTL_DAYS    = 30;           // Cognito defaults to 30
const CODE_TTL_MINUTES  = 10;
const CODE_MAX_ATTEMPTS = 3;
const PASSWORD_MIN_LENGTH = 8;

type CodeAction = 'signup_verify' | 'reset_password';

const ROUTE = 'manual-auth.service';
/** Uses a unique-ish prefix so a wrong app/JWT_SECRET can't be mistaken for a valid token. */
const ISS = 'rai-manual-auth';
const AUD = 'rai-app';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable code echoed to the client; frontend maps it onto the
     *  Cognito-style exception names its error parsers already understand. */
    public readonly code?: string,
  ) {
    super(message);
  }
}

export interface IssuedTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** ms epoch when the access token expires — mirrors CognitoTokens frontend shape. */
  expiresAt: number;
}

function getSecret(): string {
  const secret = process.env['JWT_SECRET'] ?? '';
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET not configured (min 32 chars) — required when AUTH_PROVIDER=manual');
  }
  return secret;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const head = (user ?? '').slice(0, 2);
  return `${head}${'*'.repeat(Math.max((user?.length ?? 2) - 2, 1))}@${domain}`;
}

/** Lowercase + trim, since emails are stored case-insensitively. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 'InvalidPasswordException');
  }
}

export class ManualAuthService implements AuthService {
  // ── AuthService contract (used by authMiddleware + existing auth routes) ──
  async verifyAccessToken(token: string): Promise<NormalizedAuthContext> {
    const secret = getSecret();
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, secret, { issuer: ISS, audience: AUD }) as jwt.JwtPayload;
    } catch {
      throw new AuthError(401, 'Invalid or expired token', 'NotAuthorizedException');
    }

    const externalAuthId = String(payload.sub ?? '');
    const user = await findUserByExternalAuthId(externalAuthId);
    if (!user) {
      // Token is valid but the user row is gone — treat as unauthenticated.
      throw new AuthError(401, 'Invalid or expired token', 'NotAuthorizedException');
    }

    return {
      externalAuthId,
      email: user.email,
      emailVerified: user.email_verified,
      name: user.name,
      currentOrgId: user.current_org_id,
      identities: [], // manual auth has no federated identities
    };
  }

  async switchOrg(externalAuthId: string, newOrgId: string): Promise<void> {
    await setUserCurrentOrgId(externalAuthId, newOrgId);
  }

  async logoutAll(externalAuthId: string): Promise<void> {
    const user = await findUserByExternalAuthId(externalAuthId);
    if (!user) return;
    await revokeAllRefreshTokens(user.id);
  }

  linkProvider(): Promise<void> {
    // No federation in manual mode — nothing to link.
    return Promise.resolve();
  }

  // ── Manual-only flows (called by auth.controller) ────────────────────────
  async signup(
    email: string,
    password: string,
    name: string | null,
  ): Promise<{ userId: string; deliveryConfirmation: string; destination: string }> {
    const normalized = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new AuthError(400, 'A valid email address is required', 'InvalidParameterException');
    }
    // Same name reflection in the lazy-sync: JWT backfill uses the token claim.
    const cleanName = typeof name === 'string' ? name.trim() : '';
    assertPassword(password);

    const existing = await findUserByEmail(normalized);
    if (existing) {
      throw new AuthError(409, 'An account with this email already exists', 'UsernameExistsException');
    }

    const id = uuidv7();
    const hash = await bcrypt.hash(password, 10);
    await insertManualUser(id, normalized, cleanName || null, hash);
    logger.info({ userId: id, email: normalized, route: ROUTE }, 'Manual signup - user created, sending verification code');

    await this.requestCode(id, normalized, 'signup_verify');

    return {
      userId: id,
      deliveryConfirmation: 'EMAIL',
      destination: maskEmail(normalized),
    };
  }

  async confirmSignup(email: string, code: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const user = await findUserByEmail(normalized);
    if (!user) throw new AuthError(400, 'No account found for this email', 'UserNotFoundException');
    if (user.email_verified) return; // idempotent — already verified

    await this.consumeCode(user.id, 'signup_verify', code);
    await setUserEmailVerified(user.id);
    logger.info({ userId: user.id, route: ROUTE }, 'Manual signup - email verified');
  }

  async resendSignupCode(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const user = await findUserByEmail(normalized);
    if (!user) throw new AuthError(400, 'No account found for this email', 'UserNotFoundException');
    await this.requestCode(user.id, user.email, 'signup_verify');
  }

  async login(email: string, password: string): Promise<IssuedTokens> {
    const normalized = normalizeEmail(email);
    const creds = await findUserCredentialsByEmail(normalized);
    // Same message whether the account is missing or the password is wrong —
    // no user enumeration.
    if (!creds || !creds.password) {
      throw new AuthError(401, 'Invalid email or password', 'NotAuthorizedException');
    }
    const matches = await bcrypt.compare(password, creds.password);
    if (!matches) {
      throw new AuthError(401, 'Invalid email or password', 'NotAuthorizedException');
    }
    if (!creds.email_verified) {
      // Distinct status so the frontend routes to the verify page + resend.
      throw new AuthError(403, 'Please verify your email before signing in', 'UserNotConfirmedException');
    }

    const user = await findUserById(creds.id);
    if (!user) throw new AuthError(401, 'Invalid email or password', 'NotAuthorizedException');

    logger.info({ userId: user.id, route: ROUTE }, 'Manual login - success');
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new AuthError(401, 'Invalid or expired refresh token', 'NotAuthorizedException');
    }
    const row = await findRefreshTokenByHash(sha256Hex(refreshToken));
    if (!row) throw new AuthError(401, 'Invalid or expired refresh token', 'NotAuthorizedException');
    if (row.expires_at.getTime() < Date.now()) {
      await deleteRefreshTokenByHash(sha256Hex(refreshToken));
      throw new AuthError(401, 'Invalid or expired refresh token', 'NotAuthorizedException');
    }

    const user = await findUserById(row.user_id);
    if (!user) {
      await deleteRefreshTokenByHash(sha256Hex(refreshToken));
      throw new AuthError(401, 'Invalid or expired refresh token', 'NotAuthorizedException');
    }

    // Rotate: the presented refresh token is single-use; a fresh one is issued.
    await deleteRefreshTokenByHash(sha256Hex(refreshToken));
    logger.info({ userId: user.id, route: ROUTE }, 'Manual auth - refresh token rotated');
    return this.issueTokens(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const user = await findUserByEmail(normalized);
    // Always behave the same whether or not the account exists (no
    // enumeration) — but only send when there IS an account.
    if (user) {
      await this.requestCode(user.id, user.email, 'reset_password');
    }
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    const normalized = normalizeEmail(email);
    assertPassword(newPassword);
    const user = await findUserByEmail(normalized);
    if (!user) throw new AuthError(400, 'No account found for this email', 'UserNotFoundException');

    await this.consumeCode(user.id, 'reset_password', code);
    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hash);
    await revokeAllRefreshTokens(user.id);
    logger.info({ userId: user.id, route: ROUTE }, 'Manual auth - password reset completed');
  }

  async changeAuthenticatedPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    assertPassword(newPassword);
    const user = await findUserById(userId);
    if (!user) throw new AuthError(401, 'Invalid or expired token', 'NotAuthorizedException');

    const creds = await findUserCredentialsByEmail(user.email);
    if (!creds?.password) throw new AuthError(400, 'No password set on this account', 'NotAuthorizedException');
    const matches = await bcrypt.compare(currentPassword, creds.password);
    if (!matches) throw new AuthError(400, 'Current password is incorrect', 'NotAuthorizedException');
    if (currentPassword === newPassword) {
      throw new AuthError(400, 'New password must be different from the current password', 'InvalidParameterException');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(userId, hash);
    await revokeAllRefreshTokens(userId);
    logger.info({ userId, route: ROUTE }, 'Manual auth - password changed, sessions revoked');
  }

  async issueTokens(user: { id: string; external_auth_id: string; email: string; email_verified: boolean; name: string | null }): Promise<IssuedTokens> {
    const secret = getSecret();
    const now = Date.now();
    const token = jwt.sign(
      {
        sub: user.external_auth_id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
      },
      secret,
      { issuer: ISS, audience: AUD, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshToken = generateRefreshToken();
    await insertRefreshToken(
      user.id,
      sha256Hex(refreshToken),
      new Date(now + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    );

    return {
      idToken: token,
      accessToken: token,
      refreshToken,
      expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
    };
  }

  /** Mint a code + email it. Prior unconsumed codes for (user, action) are retired. */
  private async requestCode(userId: string, email: string, action: CodeAction): Promise<void> {
    const code = generateCode();
    await createAuthCode(userId, action, sha256Hex(code), CODE_TTL_MINUTES);

    const label = action === 'signup_verify' ? 'verify your email address' : 'reset your password';
    const isReset = action === 'reset_password';
    try {
      await sendEmail({
        to: email,
        subject: isReset ? 'Reset your password' : 'Verify your email',
        textBody:
          `Your Rai verification code is ${code}.\n\n` +
          `This code expires in ${CODE_TTL_MINUTES} minutes. ` +
          `If you didn't request it, you can safely ignore this email.`,
        htmlBody:
          `<p>Your Rai verification code is <strong>${code}</strong>.</p>` +
          `<p>This code expires in ${CODE_TTL_MINUTES} minutes. ` +
          `If you didn't request this ${label}, you can safely ignore this email.</p>`,
      });
    } catch (err) {
      // Dev-only fallback: Resend testing mode only delivers to the account
      // owner's email until a domain is verified. Log the code so local
      // signup/reset still works without email. NEVER in prod — a failed send
      // there is a real failure the user must see.
      if (isDev) {
        logger.warn(
          { userId, action, route: ROUTE, error: (err as Error).message },
          'Verification email failed - dev fallback: code visible in this log line',
        );
        logger.info({ userId, action, code, route: ROUTE }, 'DEV ONLY - verification code (email failed)');
        return;
      }
      throw err;
    }
    logger.info({ userId, action, route: ROUTE }, 'Manual auth - verification code emailed');
  }

  /** Verify a code, throwing mapped AuthErrors, and consume it on success/failure. */
  private async consumeCode(userId: string, action: CodeAction, code: string): Promise<void> {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new AuthError(400, 'A 6-digit verification code is required', 'CodeMismatchException');
    }
    const result = await verifyAuthCode(userId, action, sha256Hex(code), CODE_MAX_ATTEMPTS);
    switch (result) {
      case 'ok':
        return;
      case 'expired':
        throw new AuthError(400, 'This code has expired — request a new one', 'ExpiredCodeException');
      case 'too_many_attempts':
        throw new AuthError(400, 'Too many incorrect attempts — request a new code', 'LimitExceededException');
      case 'mismatch':
        throw new AuthError(400, 'Incorrect verification code', 'CodeMismatchException');
      case 'no_code':
      default:
        throw new AuthError(400, 'No active code — request a new one', 'ExpiredCodeException');
    }
  }
}