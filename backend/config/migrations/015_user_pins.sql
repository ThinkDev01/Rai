-- v2 — Personal pins (My Work quick-access).
-- One table holds a user's pinned projects AND pinned tickets:
--   * Exactly one of (project_id, ticket_id) is set per row — enforced by the
--     CHECK below. A single polymorphic table keeps the API + indexes small
--     while real FK cascade still cleans dead pins (no orphan rows ever count
--     toward the per-user limit).
--   * Per-user, per-org. Cascades from users / organizations / projects /
--     tickets, so deleting any of them auto-removes the pin.
-- "Top 3 per type" is enforced in the service layer (PIN_LIMIT) — a partial
-- unique index can guarantee one-pin-per-target but not a row count.

CREATE TABLE IF NOT EXISTS user_pins (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Exactly one target. Nullable FKs + a CHECK give us a polymorphic pin with
  -- full referential integrity on both sides.
  project_id  BIGINT      REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id   BIGINT      REFERENCES tickets(id)  ON DELETE CASCADE,
  pinned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_pins_one_target CHECK (num_nonnulls(project_id, ticket_id) = 1)
);

-- One pin per (user, org, project) and per (user, org, ticket). Partial so the
-- NULL side of each row is ignored. These double as the lookup index for the
-- isPinned EXISTS subqueries on the projects list + My Work queries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pins_project
  ON user_pins (user_id, org_id, project_id) WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pins_ticket
  ON user_pins (user_id, org_id, ticket_id)  WHERE ticket_id IS NOT NULL;
