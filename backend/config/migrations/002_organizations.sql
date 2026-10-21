-- v2 organizations (the tenant boundary)
-- subscription_status drives middleware gating (suspended/cancelled = read-only).
-- Full subscriptions table with periods/trial dates comes in Phase 4.

CREATE TABLE IF NOT EXISTS organizations (
  id                  UUID          PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,
  slug                VARCHAR(50)   NOT NULL,
  subscription_status VARCHAR(20)   NOT NULL DEFAULT 'trial'
                                    CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  created_by          UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_organizations_slug UNIQUE (slug)
);
