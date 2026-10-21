import type { OrgRole } from '../../types/common.types';

/** Roles that can be assigned at invite time - owner is never invitable (transferred only). */
export type InvitableRole = Exclude<OrgRole, 'owner'>;

export interface InviteRow {
  id:            string;
  token:         string;
  org_id:        string;
  role:          InvitableRole;
  invited_email: string;
  invited_by:    string;
  expires_at:    Date;
  used_at:       Date | null;
  revoked_at:    Date | null;
  created_at:    Date;
}

/** Hydrated row for the Team page "Pending invites" list. */
export interface PendingInviteRow {
  id:               string;
  invited_email:    string;
  role:             InvitableRole;
  invited_by_name:  string | null;
  invited_by_email: string;
  expires_at:       Date;
  created_at:       Date;
}

export interface CreateInvitePayload {
  email: string;
  role:  InvitableRole;
}

export interface CreateInviteResponse {
  invite: {
    id:            string;
    invited_email: string;
    role:          InvitableRole;
    expires_at:    Date;
  };
}

export interface AcceptInviteResponse {
  org: {
    id:   string;
    name: string;
    slug: string;
  };
  /** True if caller's current_org_id was set to this org (so frontend refreshes the token). */
  mustRefreshToken: boolean;
}

/** Pre-accept preview - public (no auth). Powers the "Join <org>?" confirm card. */
export interface PreviewInviteResponse {
  org_name:      string;
  role:          InvitableRole;
  invited_email: string;
  state:         'pending' | 'expired' | 'used' | 'revoked';
  expires_at:    Date;
}
