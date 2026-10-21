import type { Response, NextFunction } from 'express';
import logger from '../config/logger';
import type { AuthenticatedRequest, ApiResponse, OrgRole } from '../types/common.types';

/**
 * Role-gate factory. MUST chain after `authMiddleware` AND `requireOrgContext`.
 *
 * Usage:
 *   router.post('/', authMiddleware, requireOrgContext, requireOrgRole('owner', 'admin'), createProject);
 *
 * Reads from `req.context.role` (already validated against the DB by
 * requireOrgContext). Returns 403 with the standard shape on mismatch.
 *
 * Per v2-decisions Q5: org roles are `owner > admin > project_manager > user`.
 * This middleware does not implement inheritance - list every role you accept.
 */
export function requireOrgRole(...roles: OrgRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const ctx = req.context;
    if (!ctx) {
      logger.error(
        { route: req.path, method: req.method, userId: req.user?.id },
        'requireOrgRole invoked without req.context - chain requireOrgContext first',
      );
      res.status(500).json({ success: false, data: {}, error: 'Auth chain misconfigured' } satisfies ApiResponse);
      return;
    }

    if (!roles.includes(ctx.role)) {
      logger.warn(
        {
          route: req.path,
          method: req.method,
          userId: req.user?.id,
          orgId: ctx.org_id,
          actualRole: ctx.role,
          requiredRoles: roles,
        },
        'Role gate denied',
      );
      res.status(403).json({
        success: false,
        data: {},
        error: 'You do not have permission to perform this action',
      } satisfies ApiResponse);
      return;
    }

    next();
  };
}
