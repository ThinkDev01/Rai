export interface OrgRow {
  id:                  string;
  name:                string;
  slug:                string;
  subscription_status: 'trial' | 'active' | 'suspended' | 'cancelled';
  discoverable:        boolean;
  created_by:          string;
  created_at:          Date;
  updated_at:          Date;
}

export interface CreateOrgPayload {
  name: string;
  slug: string;
}

export interface CreateOrgResponse {
  org:              OrgRow;
  mustRefreshToken: boolean;
}

export interface UpdateOrgPayload {
  name?:         string;
  discoverable?: boolean;
}

export interface UpdateOrgResponse {
  org: OrgRow;
}

/**
 * A soft-deleted org in the owner's recovery window. Returned by
 * GET /api/v1/orgs/deleted to render the "Recently deleted" restore list.
 * `restore_until` = deleted_at + ORG_RESTORE_WINDOW_DAYS (the purge deadline).
 */
export interface DeletedOrgRow {
  id:            string;
  name:          string;
  slug:          string;
  deleted_at:    Date;
  restore_until: Date;
  // Subscription snapshot (the org's billing keeps ticking while soft-deleted —
  // v2 doesn't pause it), so the owner can see how long is left before deciding
  // to restore. Nullable: an org created before billing may have no live row.
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | null;
  trial_ends_at:       Date | null;
  current_period_end:  Date | null;
}

/** Hydrated member row for the Team page. */
export interface OrgMemberRow {
  user_id:    string;
  email:      string;
  name:       string | null;
  role:       'owner' | 'admin' | 'project_manager' | 'user';
  role_label: string | null;
  joined_at:  Date;
}
