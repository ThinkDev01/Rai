import type { Request } from 'express';

export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data: T;
  error: string;
}

/** Safely extract a route param as string (Express 5 returns string | string[]) */
export function param(req: Request, name: string): string {
  const v = req.params[name];
  return typeof v === 'string' ? v : '';
}

/** Safely extract a query param as string */
export function query(req: Request, name: string): string {
  const v = req.query[name];
  return typeof v === 'string' ? v : '';
}

/** Org-level role tiers from docs/rbac.md §Roles. */
export type OrgRole = 'owner' | 'admin' | 'project_manager' | 'user';

/** Org subscription state, mirrors `organizations.subscription_status`. */
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

/**
 * Authenticated user attached to req by authMiddleware after Cognito JWT verify
 * and lazy-sync against the local users table. Shape per docs/standards.md §8.
 */
export interface AuthUser {
  /** Our internal UUID v7 (the FK target for org/project/ticket tables). */
  id: string;
  /** Cognito sub today; the provider's user id under any future swap. */
  externalAuthId: string;
  email: string;
  emailVerified: boolean;
  /** Display name. May be null for federated users whose IdP didn't expose one. */
  name: string | null;
  /** UUID of the user's currently selected org, validated against user_orgs membership + subscription status. Null when none selected or membership revoked. */
  currentOrgId: string | null;
  /** Caller's role in `currentOrgId`. Null when currentOrgId is null. */
  currentOrgRole: OrgRole | null;
  /** Subscription state of `currentOrgId`. Null when currentOrgId is null. */
  currentOrgSubscriptionStatus: SubscriptionStatus | null;
}

/**
 * Tenant-scoped request context. Populated by `requireOrgContext` middleware,
 * which 403s when `req.user.currentOrgId` is null. Once attached, controllers
 * and models MUST source org_id from here - never from URL params or the
 * slug - per docs/v2-decisions.md Q2 companion rule.
 */
export interface RequestContext {
  org_id: string;
  role: OrgRole;
  subscription_status: SubscriptionStatus;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  context?: RequestContext;
}
