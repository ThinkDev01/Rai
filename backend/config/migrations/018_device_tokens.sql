-- v2 — Mobile push device registry (FCM).
-- One row per (user, device-token). The mobile app registers its FCM token on
-- login / token-refresh; the push channel reads these rows to fan a notification
-- out to all of a user's devices. The token is the natural unique key — the same
-- device re-registering simply refreshes last_seen_at (see push.model.upsertToken).
-- Tokens are pruned automatically when FCM reports them dead (uninstall / expiry).

CREATE TABLE IF NOT EXISTS device_tokens (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The FCM registration token issued to the app instance. Unique so a token can
  -- only ever belong to one user — if it re-registers under a new user (shared
  -- device, re-login), the upsert moves it (ON CONFLICT (token)).
  token       TEXT         NOT NULL,
  -- 'ios' | 'android' | 'web'. Free-text (not an enum) so a new platform never
  -- needs a migration; validated in the controller.
  platform    VARCHAR(16)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Bumped on every re-register so we can later prune devices that have gone
  -- silent for months without waiting for FCM to report them dead.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_token UNIQUE (token)
);

-- Fan-out lookup: every push send does "all tokens for this user".
CREATE INDEX IF NOT EXISTS idx_device_tokens_user
  ON device_tokens (user_id);
