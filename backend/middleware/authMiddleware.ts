import type { Response, NextFunction } from 'express';
import logger from '../config/logger';
import pool from '../config/db';
import { getAuthService } from '../modules/auth/auth.factory';
import {
  findUserByExternalAuthId,
  findUserByEmail,
  insertUser,
  getMembership,
} from '../modules/auth/auth.model';
import type { AuthenticatedRequest, AuthUser, ApiResponse, OrgRole, SubscriptionStatus } from '../types/common.types';

/**
 * Verify the Cognito ID token, lazy-sync the local users row on first authenticated request,
 * and attach a normalized AuthUser to req.user.
 *
 * Federated-account-linking: if the JWT's sub is unknown but the email matches an existing
 * verified user, link the federated identity in Cognito and reuse the existing users row.
 * Subsequent logins return the destination user's sub.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, data: {}, error: 'Authentication required' } satisfies ApiResponse);
    return;
  }

  const authService = getAuthService();

  let claims;
  try {
    claims = await authService.verifyAccessToken(token);
  } catch (err) {
    logger.warn(
      { route: req.path, method: req.method, userId: 'anonymous', error: (err as Error).message },
      'Auth failed - invalid or expired token',
    );
    res.status(401).json({ success: false, data: {}, error: 'Invalid or expired token' } satisfies ApiResponse);
    return;
  }

  if (!claims.email) {
    logger.warn({ route: req.path, method: req.method, userId: 'anonymous' }, 'Auth failed - token missing email claim');
    res.status(401).json({ success: false, data: {}, error: 'Token missing email claim' } satisfies ApiResponse);
    return;
  }

  // Wrap the entire DB-touching path so a transient pg error returns 500 with
  // a clear message instead of bubbling up as an unhandled rejection.
  let userRow;
  try {
    userRow = await findUserByExternalAuthId(claims.externalAuthId);

    // Email-verification is monotonic - once true, stays true. If the JWT now
    // reports verified (e.g. user just confirmed their email, or this is a
    // federated sign-in normalized to verified) but the DB still has false,
    // upgrade the row. Never downgrade.
    if (userRow && !userRow.email_verified && claims.emailVerified) {
      await pool.query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [userRow.id]);
      userRow.email_verified = true;
      logger.info(
        { route: req.path, userId: userRow.id },
        'Upgraded users.email_verified to true (JWT now reports verified)',
      );
    }

    // Name backfill - if the DB row has no name yet but the JWT carries one
    // (just-signed-up native user OR federated user with mapped name claim),
    // populate the row from the JWT. Never overwrites a name the user already
    // set via Settings (PATCH /me) - only fills NULL.
    if (userRow && !userRow.name && claims.name) {
      await pool.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [claims.name, userRow.id]);
      userRow.name = claims.name;
      logger.info(
        { route: req.path, userId: userRow.id, source: 'jwt' },
        'Backfilled users.name from JWT claim',
      );
    }

    if (!userRow) {
      const federated = claims.identities.find(
        (i) => i.providerName === 'Google' || i.providerName === 'Microsoft',
      );

      if (federated && claims.emailVerified) {
        const existing = await findUserByEmail(claims.email);
        if (existing && existing.email_verified) {
          try {
            await authService.linkProvider(
              existing.external_auth_id,
              federated.providerName as 'Google' | 'Microsoft',
              federated.userId,
            );
            logger.info(
              { route: req.path, method: req.method, userId: existing.id, provider: federated.providerName },
              'Linked federated identity to existing user',
            );
            userRow = existing;
          } catch (err) {
            logger.error(
              { route: req.path, error: (err as Error).message, userId: 'anonymous' },
              'Federated link failed',
            );
            res.status(500).json({ success: false, data: {}, error: 'Auth link failed' } satisfies ApiResponse);
            return;
          }
        }
      }

      if (!userRow) {
        userRow = await insertUser(claims.externalAuthId, claims.email, claims.emailVerified, claims.name);
        logger.info(
          { route: req.path, method: req.method, userId: userRow.id, hasName: Boolean(claims.name) },
          'Lazy-synced new user row',
        );
      }
    }
  } catch (err) {
    logger.error(
      { route: req.path, method: req.method, userId: 'anonymous', error: (err as Error).message, stack: (err as Error).stack },
      'Lazy-sync DB error',
    );
    res.status(500).json({ success: false, data: {}, error: 'Auth sync failed' } satisfies ApiResponse);
    return;
  }

  // Resolve current org context. Priority:
  //   1. X-Org-Id header (URL-driven, per-tab) - frontend sets this from the
  //      /orgs/[slug]/... URL slug. Authoritative for the per-request context.
  //   2. users.current_org_id column (manual auth) - the local equivalent of
  //      Cognito's custom:current_org_id claim, read fresh from the DB.
  //   3. JWT current_org_id claim (aws) - falls back when the header is absent
  //      (auth flows, welcome page, invite accept, etc.). Reflects Cognito's
  //      `custom:current_org_id` attribute, now "default org on next fresh
  //      login" only.
  //
  // Whatever org we pick is re-validated against actual membership +
  // subscription status. Never trust the header, DB column or JWT on their own
  // - middleware re-checks DB on every request, so mid-session role changes or
  // removals take effect on the next call (per contract #Q1).
  const headerOrgId = (req.header('x-org-id') ?? '').trim() || null;
  const requestedOrgId = headerOrgId ?? userRow.current_org_id ?? claims.currentOrgId;

  // Diagnostic - fires on every request so we can verify the X-Org-Id header
  // is reaching the backend. If `headerOrgId` is null but the frontend should
  // be sending it (request is from /orgs/<slug>/...), CORS is stripping the
  // header or the frontend interceptor isn't running.
  logger.info(
    {
      route: req.path,
      method: req.method,
      userId: userRow.id,
      headerOrgId,
      dbOrgId: userRow.current_org_id,
      claimOrgId: claims.currentOrgId,
      resolvedFrom: headerOrgId ? 'X-Org-Id header' : (userRow.current_org_id ? 'users.current_org_id' : (claims.currentOrgId ? 'JWT claim' : 'none')),
    },
    'org context resolution',
  );

  let validatedOrgId: string | null = null;
  let currentOrgRole: OrgRole | null = null;
  let currentOrgSubscriptionStatus: SubscriptionStatus | null = null;
  if (requestedOrgId) {
    try {
      const membership = await getMembership(userRow.id, requestedOrgId);
      if (membership) {
        validatedOrgId = requestedOrgId;
        currentOrgRole = membership.role;
        currentOrgSubscriptionStatus = membership.subscription_status;
      } else {
        logger.warn(
          { route: req.path, userId: userRow.id, requestedOrgId, source: headerOrgId ? 'X-Org-Id header' : 'JWT claim' },
          'Org context rejected - caller is not a member or org cancelled',
        );
      }
    } catch (err) {
      // Treat membership-check failure as "no current org" - non-fatal, request continues.
      logger.warn(
        { route: req.path, userId: userRow.id, error: (err as Error).message },
        'Membership check failed - proceeding without currentOrgId',
      );
    }
  }

  const user: AuthUser = {
    id: userRow.id,
    externalAuthId: userRow.external_auth_id,
    email: userRow.email,
    emailVerified: userRow.email_verified,
    name: userRow.name,
    currentOrgId: validatedOrgId,
    currentOrgRole,
    currentOrgSubscriptionStatus,
  };

  req.user = user;
  next();
}
