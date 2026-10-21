-- v2 org soft-delete (recycle bin). Org delete is now reversible for a 30-day
-- window instead of an immediate hard CASCADE wipe, so an accidental delete by
-- a (paying) owner is recoverable.
--
--   deleted_at NULL      → active org (the normal state).
--   deleted_at <timestamp> → soft-deleted; hidden everywhere in the app, but
--                            its rows (projects/sprints/tickets/members/...)
--                            are untouched so a restore brings it all back.
--
-- The slug stays reserved while soft-deleted: uq_organizations_slug spans every
-- row (incl. soft-deleted ones), so nobody can grab the name during the window
-- and a restore never collides. The purge job (scripts/purge-orgs.ts) hard-
-- deletes rows past the window, which frees the slug via the existing CASCADE.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Partial index for the hot path: every membership resolution joins
-- organizations and filters `deleted_at IS NULL`. Keeps active-org lookups off
-- a full scan once soft-deleted rows accumulate.
CREATE INDEX IF NOT EXISTS idx_organizations_active
  ON organizations (id) WHERE deleted_at IS NULL;
