import type { Response, NextFunction } from 'express';
import logger from '../config/logger';
import type { AuthenticatedRequest, ApiResponse, RequestContext } from '../types/common.types';

/** HTTP methods that mutate state — the ones gated under read-only. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Org gate states that put the org into read-only (per v2-decisions Q11). */
const READ_ONLY_STATUSES = new Set(['suspended', 'cancelled']);

/**
 * Attach `req.context` from the validated `req.user` org fields. MUST chain
 * after `authMiddleware`. 403s when no org is selected / membership was revoked.
 * Does NOT enforce the subscription write-gate — that's `requireOrgContext`.
 *
 * Use this DIRECTLY only on routes that must work under read-only (billing:
 * subscribe / confirm / cancel / reactivate). Everything else uses
 * `requireOrgContext`, which is this plus the gate.
 */
export function attachOrgContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    logger.error({ route: req.path, method: req.method }, 'attachOrgContext invoked without req.user');
    res.status(500).json({ success: false, data: {}, error: 'Auth chain misconfigured' } satisfies ApiResponse);
    return;
  }

  if (!user.currentOrgId || !user.currentOrgRole || !user.currentOrgSubscriptionStatus) {
    logger.warn(
      { route: req.path, method: req.method, userId: user.id },
      'No org context - request rejected',
    );
    res.status(403).json({
      success: false,
      data: {},
      error: 'No organization selected - switch into an org and retry',
    } satisfies ApiResponse);
    return;
  }

  const context: RequestContext = {
    org_id: user.currentOrgId,
    role: user.currentOrgRole,
    subscription_status: user.currentOrgSubscriptionStatus,
  };
  req.context = context;
  next();
}

/**
 * Tenant-scoping middleware + read-only write-gate. MUST chain after
 * `authMiddleware`. Mounted on every tenant-scoped route EXCEPT billing.
 *
 * - Attaches `req.context` (via attachOrgContext).
 * - Then, when the org's subscription is read-only (`suspended`/`cancelled`)
 *   AND the request is a write (POST/PUT/PATCH/DELETE), returns
 *   `403 SUBSCRIPTION_EXPIRED`. Reads always pass through (indefinite read-only,
 *   v2-decisions Q11 / RF-10). This is the single central gate — no per-route
 *   subscription checks scattered across controllers.
 *
 * Per docs/standards.md companion rule, the URL slug is decorative and NEVER
 * trusted as org_id — every tenant model sources org_id from `req.context`.
 */
export function requireOrgContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  attachOrgContext(req, res, () => {
    const ctx = req.context!;
    if (WRITE_METHODS.has(req.method) && READ_ONLY_STATUSES.has(ctx.subscription_status)) {
      logger.warn(
        { route: req.path, method: req.method, userId: req.user?.id, orgId: ctx.org_id, status: ctx.subscription_status },
        'Write blocked - subscription read-only',
      );
      res.status(403).json({
        success: false,
        data: {},
        // Machine-readable code the frontend interceptor keys off (RF-10).
        error: 'SUBSCRIPTION_EXPIRED',
      } satisfies ApiResponse);
      return;
    }
    next();
  });
}
