-- v2 — Email-OTP gate for sensitive actions.
-- A short-lived, single-use email verification code that must be supplied to
-- execute high-impact, irreversible actions (delete org / transfer ownership /
-- delete project). The plaintext code only ever lives in the email — the table
-- stores a SHA-256 hash. One active challenge per (user, action, target):
-- minting a new code consumes any prior unconsumed one for that triple, so a
-- "resend" silently retires the old code (see otp.model.createChallenge).

CREATE TABLE IF NOT EXISTS otp_challenges (
  id          UUID         PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Action key from the backend allowlist (e.g. 'delete_org'). Binds the code
  -- to one action, so a code minted for a delete can't be replayed on a transfer.
  action      VARCHAR(40)  NOT NULL,
  -- The entity the action targets (org id / project id), stored as text so both
  -- UUID and BIGSERIAL ids fit. Binds the code to one target (can't delete org B
  -- with a code minted for org A). NULL for any future non-target-scoped action.
  target_id   VARCHAR(64),
  -- SHA-256 hex of the 6-digit code (64 chars). Never the plaintext.
  code_hash   CHAR(64)     NOT NULL,
  -- Wrong-guess counter; the challenge auto-consumes once it crosses the cap
  -- (OTP_MAX_ATTEMPTS in otp.model) to stop brute-forcing a live code.
  attempts    SMALLINT     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ  NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Verify-path lookup: newest still-active challenge for a (user, action, target).
-- Partial index keeps it cheap — consumed rows (the vast majority over time) are
-- excluded.
CREATE INDEX IF NOT EXISTS idx_otp_active_lookup
  ON otp_challenges (user_id, action, target_id, id DESC)
  WHERE consumed_at IS NULL;
