-- v2 multi-tenant users
-- id = our internal UUID v7 (app-generated via uuidv7 package). PK never changes.
-- external_auth_id = current auth provider's user id (Cognito `sub` today).
-- Decoupling rationale: docs/v2-decisions.md RF-16. If we ever swap auth provider,
-- only external_auth_id values change; all FKs in the app stay stable.

CREATE TABLE IF NOT EXISTS users (
  id                UUID          PRIMARY KEY,
  external_auth_id  VARCHAR(255)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  name              VARCHAR(100),
  email_verified    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_external_auth_id UNIQUE (external_auth_id),
  CONSTRAINT uq_users_email            UNIQUE (email)
);
