/** Org-level role tiers from docs/rbac.md §Roles. */
export type OrgRole = 'owner' | 'admin' | 'project_manager' | 'user';

export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  /** Display name. May be null for federated users whose IdP didn't expose one. */
  name: string | null;
  currentOrgId: string | null;
}

export interface Membership {
  org_id: string;
  org_name: string;
  org_slug: string;
  subscription_status: SubscriptionStatus;
  /** Per the domain-peer discovery feature: when false, the org is hidden
   *  from other domain users' peer lists. Owner-only toggle in Settings. */
  discoverable: boolean;
  role: OrgRole;
  role_label: string | null;
}

export interface MeResponseData {
  user: AuthUser;
  memberships: Membership[];
}
