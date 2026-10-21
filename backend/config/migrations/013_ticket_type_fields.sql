-- v2 type-specific ticket fields (Jira parity). Each ticket type carries the
-- info that matters for its intent; all columns nullable so existing tickets +
-- plain tasks are unaffected.
--
--   Epic  → epic_name, epic_color        (label + tint used in board/epic views)
--   Story → story_points, acceptance_criteria
--   Bug   → steps_to_reproduce, environment
--   Task  → (none - stays plain)
--
-- v2 uses a hard-coded type→fields mapping (no admin "screen config" UI - that's
-- a v3 product call, see upgrades.md § Type-specific ticket fields). The
-- frontend shows/sends only the fields relevant to a ticket's type; the backend
-- validates format and persists what it's given.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS epic_name           VARCHAR(60),
  ADD COLUMN IF NOT EXISTS epic_color          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS story_points        SMALLINT CHECK (story_points IS NULL OR story_points >= 0),
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT,
  ADD COLUMN IF NOT EXISTS steps_to_reproduce  TEXT,
  ADD COLUMN IF NOT EXISTS environment         VARCHAR(255);
