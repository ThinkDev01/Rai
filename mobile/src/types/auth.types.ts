// Ported from web Rai-Frontend/types/auth.types.ts

export type OrgRole = 'owner' | 'admin' | 'project_manager' | 'user';
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  currentOrgId: string | null;
}

export interface Membership {
  org_id: string;
  org_name: string;
  org_slug: string;
  subscription_status: SubscriptionStatus;
  discoverable: boolean;
  role: OrgRole;
  role_label: string | null;
}

export interface MeResponseData {
  user: AuthUser;
  memberships: Membership[];
}

/** Wire shape from GET /orgs/:id/members (adapted to Member by useTeam). */
export interface OrgMemberWire {
  user_id: string;
  name: string;
  email: string;
  role: OrgRole;
  role_label: string | null;
  joined_at: string | null;
}
