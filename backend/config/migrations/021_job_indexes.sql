-- v2 — Partial indexes for the scheduled-jobs sweeps (node-cron runner).
--
-- Both jobs scan a domain table on every tick looking for a small set of "due"
-- rows. Partial indexes keep those scans touching only candidate rows as the
-- tables grow (dev-standards.md §3: "partial index on the due predicate").

-- Sprint auto-start: WHERE status = 'planned' AND start_date <= today.
-- Indexes only planned sprints (the rest never auto-start), ordered by start_date.
CREATE INDEX IF NOT EXISTS idx_sprints_planned_start
  ON sprints (start_date)
  WHERE status = 'planned';

-- Invite cleanup: WHERE used_at IS NULL AND expires_at < NOW().
-- Indexes only unaccepted invites, ordered by expiry.
CREATE INDEX IF NOT EXISTS idx_invites_unaccepted_expiry
  ON invites (expires_at)
  WHERE used_at IS NULL;
