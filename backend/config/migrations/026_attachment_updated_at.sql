-- Add per-attachment edit/update timestamp (surfaces as `updatedAt`).
-- Mirrors comments.edited_at: the last time the file's linkage or metadata
-- was touched. Backfilled to the attach time for existing rows, then defaults
-- to NOW() so every new row carries it from birth.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE attachments SET updated_at = COALESCE(confirmed_at, created_at) WHERE updated_at IS NULL;
ALTER TABLE attachments ALTER COLUMN updated_at SET DEFAULT NOW();
