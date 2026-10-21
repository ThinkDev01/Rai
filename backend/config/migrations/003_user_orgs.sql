-- v2 user ↔ org membership with org-level role
-- role enum follows docs/rbac.md §Roles (4-tier: owner > admin > project_manager > user).
-- role_label = per-org display string; orgs can rename their tiers
--   (e.g. "Engineering Lead" instead of "project_manager"). Defaults to role.
-- Partial UNIQUE enforces exactly-one-owner-per-org from rbac.md §Invariants.

CREATE TABLE IF NOT EXISTS user_orgs (
  user_id     UUID         NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        VARCHAR(20)  NOT NULL
                           CHECK (role IN ('owner', 'admin', 'project_manager', 'user')),
  role_label  VARCHAR(50),
  joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX idx_user_orgs_org_id ON user_orgs(org_id);

CREATE UNIQUE INDEX one_owner_per_org
  ON user_orgs (org_id)
  WHERE role = 'owner';
