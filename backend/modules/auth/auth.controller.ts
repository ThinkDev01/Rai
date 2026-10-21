import type { Response } from 'express';
import logger from '../../config/logger';
import { getAuthService, getManualAuthService } from './auth.factory';
import { getMembership } from './auth.model';
import { AuthError } from './manual-auth.service';
import type { ManualAuthService } from './manual-auth.service';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';

const LOGOUT = '/api/v1/auth/logout';
const SWITCH_ORG = '/api/v1/auth/switch-org';

/**
 * Server-side logout. Revokes all refresh tokens for the user via Cognito
 * GlobalSignOut (aws) or the local refresh_tokens table (manual). Frontend
 * must also clear locally cached tokens.
 */
export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  logger.info({ route: LOGOUT, method: 'POST', userId }, 'Logout - revoking all refresh tokens');

  try {
    await getAuthService().logoutAll(req.user!.externalAuthId);
  } catch (err) {
    logger.error(
      { route: LOGOUT, error: (err as Error).message, userId },
      'GlobalSignOut failed',
    );
    res.status(500).json({ success: false, data: {}, error: 'Logout failed' } satisfies ApiResponse);
    return;
  }

  res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
}

/**
 * Switch the active org for the current user. Updates the Cognito
 * custom:current_org_id attribute (aws) or the users.current_org_id column
 * (manual). Manual mode needs no token refresh — the column is read
 * per-request — so mustRefreshToken is false there.
 */
export async function switchOrg(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { orgId } = req.body as { orgId?: unknown };

  if (!orgId || typeof orgId !== 'string') {
    res.status(400).json({ success: false, data: {}, error: 'orgId is required' } satisfies ApiResponse);
    return;
  }

  const membership = await getMembership(userId, orgId);
  if (!membership) {
    logger.warn({ route: SWITCH_ORG, userId, orgId }, 'switch-org denied - not a member or org cancelled');
    res.status(403).json({ success: false, data: {}, error: 'Not a member of the target organization' } satisfies ApiResponse);
    return;
  }

  try {
    await getAuthService().switchOrg(req.user!.externalAuthId, orgId);
  } catch (err) {
    logger.error(
      { route: SWITCH_ORG, error: (err as Error).message, userId, orgId },
      'AdminUpdateUserAttributes failed',
    );
    res.status(500).json({ success: false, data: {}, error: 'Org switch failed' } satisfies ApiResponse);
    return;
  }

  const isManual = getManualAuthService() !== null;
  logger.info({ route: SWITCH_ORG, userId, orgId, manual: isManual }, 'Org switched - client must refresh tokens');
  res.status(200).json({
    success: true,
    data: { orgId, mustRefreshToken: !isManual },
    error: '',
  } satisfies ApiResponse<{ orgId: string; mustRefreshToken: boolean }>);
}

// ── Manual-auth endpoints (AUTH_PROVIDER=manual) ────────────────────────────
// With Cognito these flows run client-side; the manual provider re-implements
// them server-side. Each handler 400s cleanly when running AWS mode.

type ManualHandler = (manual: ManualAuthService, req: AuthenticatedRequest) => Promise<unknown>;

/** Wraps a manual-service call with provider gate + uniform error mapping. */
function manualHandler(fn: ManualHandler): (req: AuthenticatedRequest, res: Response) => Promise<void> {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const manual = getManualAuthService();
    if (!manual) {
      res.status(400).json({
        success: false,
        data: {},
        error: 'Not available — sign in via the configured auth provider',
      } satisfies ApiResponse);
      return;
    }
    try {
      const result = (await fn(manual, req)) ?? {};
      res.status(200).json({ success: true, data: result as Record<string, unknown>, error: '' } satisfies ApiResponse);
    } catch (err) {
      if (err instanceof AuthError) {
        // `code` is extra to ApiResponse — cast through so clients get the
        // machine-readable auth code (frontend maps it onto Cognito-style
        // exception names its error parsers already understand).
        res.status(err.status).json({
          success: false,
          data: {},
          error: err.message,
          ...(err.code ? { code: err.code } : {}),
        } as ApiResponse & { code?: string });
        return;
      }
      logger.error(
        { route: req.path, error: (err as Error).message, stack: (err as Error).stack, userId: 'anonymous' },
        'Manual auth handler failed',
      );
      res.status(500).json({ success: false, data: {}, error: 'Request failed' } satisfies ApiResponse);
    }
  };
}

/** Pull a required string field from the body, 400ing when missing. */
function bodyString(req: AuthenticatedRequest, key: string): string {
  const value = (req.body as Record<string, unknown>)[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AuthError(400, `${key} is required`);
  }
  return value;
}

export const signup = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  const password = bodyString(req, 'password');
  const rawName = (req.body as Record<string, unknown>)['name'];
  const name = typeof rawName === 'string' ? rawName.trim() : null;
  return manual.signup(email, password, name);
});

export const confirmSignup = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  const code = bodyString(req, 'code');
  await manual.confirmSignup(email, code);
  return null;
});

export const resendSignupCode = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  await manual.resendSignupCode(email);
  return null;
});

export const login = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  const password = bodyString(req, 'password');
  return manual.login(email, password);
});

export const refresh = manualHandler(async (manual, req) => {
  const refreshToken = bodyString(req, 'refreshToken');
  return manual.refresh(refreshToken);
});

export const forgotPassword = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  await manual.forgotPassword(email);
  return null;
});

export const confirmForgotPassword = manualHandler(async (manual, req) => {
  const email = bodyString(req, 'email');
  const code = bodyString(req, 'code');
  const newPassword = bodyString(req, 'newPassword');
  await manual.confirmForgotPassword(email, code, newPassword);
  return null;
});

export const changePassword = manualHandler(async (manual, req) => {
  const userId = req.user!.id;
  const currentPassword = bodyString(req, 'currentPassword');
  const newPassword = bodyString(req, 'newPassword');
  await manual.changeAuthenticatedPassword(userId, currentPassword, newPassword);
  return null;
});