-- v2 org invites — Q6 (single token, two paths) + RF-12 (supersede + revoke).
-- Token-based, 7-day TTL, single-use. Lifecycle: pending → (used | revoked | expired).
--
-- Validity gate (used in WHERE clauses on accept + supersede + list):
--   used_at      IS NULL
--   AND revoked_at IS NULL
--   AND expires_at > NOW()
--
-- Newer invite to the same (org_id, invited_email) supersedes the older — handled
-- in app code inside the same transaction as INSERT. Partial unique index enforces
-- the at-most-one-live-invite-per-(org,email) invariant at the DB level.

CREATE TABLE IF NOT EXISTS invites (
  id              UUID         PRIMARY KEY,
  token           VARCHAR(64)  NOT NULL,
  org_id          UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            VARCHAR(20)  NOT NULL
                               CHECK (role IN ('admin', 'project_manager', 'user')),
  invited_email   VARCHAR(255) NOT NULL,
  invited_by      UUID         NOT NULL REFERENCES users(id)         ON DELETE RESTRICT,
  expires_at      TIMESTAMPTZ  NOT NULL,
  used_at         TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_invites_token UNIQUE (token)
);

-- Token lookup on accept — covered by uq_invites_token already.

-- Fast lookup for "pending invites for this org" (Team page) and for the
-- supersede transaction on invite-create.
CREATE INDEX idx_invites_org_email_live
  ON invites (org_id, invited_email)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- At-most-one-live-invite-per-(org,email) invariant. Belt-and-suspenders with
-- the app-level supersede transaction — if a race slips through, DB rejects.
CREATE UNIQUE INDEX uq_invites_one_live_per_org_email
  ON invites (org_id, invited_email)
  WHERE used_at IS NULL AND revoked_at IS NULL;
