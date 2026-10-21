-- v2 — Add archived_at TIMESTAMPTZ to projects + sprints.
--
-- Stores WHEN a project/sprint was archived. Displaying the date is deferred
-- to v3 (per the v1-fixes batch session) — column ships now so the data is
-- captured from day one. The existing `archived` boolean on projects stays
-- as the simple is-archived flag; archived_at is the audit timestamp.
--
-- Sprints get archived_at as a separate column instead of extending the
-- status enum. This preserves the lifecycle status (planned/active/completed)
-- independently of archive state — a completed sprint can be archived without
-- losing the "completed" status (the historical record). Matches the v1
-- feedback item 17 lock ("either extend status enum OR add archived_at flag
-- separate from status — final shape locked at schema design phase").

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
ALTER TABLE sprints  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Backfill any projects already in archived state — use updated_at as a
-- reasonable proxy for the original archive moment (closest signal we have
-- since archived state was a boolean before this migration).
UPDATE projects
SET archived_at = updated_at
WHERE archived = TRUE
  AND archived_at IS NULL;

-- Hot path: archive page filters `archived_at IS NOT NULL`. Partial index
-- keeps the lookup cheap as the table grows (RF-14 standards.md §2 pattern).
CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sprints_archived_at  ON sprints(archived_at)  WHERE archived_at IS NOT NULL;
