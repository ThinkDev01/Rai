-- v2 manual-auth provider (AUTH_PROVIDER=manual).
-- 1. users.current_org_id — the "default org" that Cognito used to carry in the
--    custom:current_org_id claim. Stored locally so the JWT doesn't need it;
--    authMiddleware reads it as the fallback when the X-Org-Id header is absent
--    (identical semantics to the old claim: validated against membership on
--    every request, so a stale value is harmless).
-- 2. refresh_tokens — server-side session store for manual-auth refresh tokens.
--    Only the SHA-256 hash is persisted (never the token itself). Logout +
--    password change revoke rows here, which is what makes them invalid.
-- 3. auth_codes — pre-auth verification codes (email-verify on signup,
--    password-reset). Same shape as otp_challenges but for users who may not be
--    able to sign in yet. Plaintext never stored — only the hash.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID         PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64)  NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth_codes (
  id          UUID         PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(50)  NOT NULL,
  code_hash   VARCHAR(64)  NOT NULL,
  attempts    INTEGER      NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ  NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_user_action ON auth_codes(user_id, action);