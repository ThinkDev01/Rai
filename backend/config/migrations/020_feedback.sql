-- v2 — User feedback. One row per submission from the in-app feedback modal.
-- Stored in our DB AND emailed to support (feedback.controller). org_id is
-- nullable + ON DELETE SET NULL so a submission survives the org being deleted.

CREATE TABLE IF NOT EXISTS feedback (
  id         UUID         PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  org_id     UUID                  REFERENCES organizations(id) ON DELETE SET NULL,
  title      VARCHAR(150) NOT NULL,
  body       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
