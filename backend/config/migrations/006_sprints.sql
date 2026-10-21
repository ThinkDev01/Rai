-- v2 multi-tenant sprints
--
-- Status enum carries v1's final shape (planned/active/completed) per
-- docs/v2-decisions.md Q13 + v1's migration 012. No 'archived' status —
-- archive belongs to projects, not sprints. No 'cancelled' — terminal state
-- intentionally collapsed into 'completed' for v2 per locked scope.
--
-- One-active-sprint-per-project is a real invariant: the controller already
-- 409s when starting a sprint while another is active, but a partial
-- UNIQUE index on (project_id) WHERE status='active' makes the DB the
-- last line of defense against races (RF-14: belt-and-suspenders).
--
-- org_id is denormalized from projects.org_id (cheap; saves a JOIN on
-- every reports/burndown query). FK on project_id ensures consistency —
-- we never insert sprints whose org_id disagrees with the parent project
-- (controllers always derive sprint.org_id from req.context.org_id, which
-- is the same source the project lookup validated).

CREATE TABLE IF NOT EXISTS sprints (
  id          BIGSERIAL     PRIMARY KEY,
  org_id      UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  BIGINT        NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  name        VARCHAR(255)  NOT NULL,
  goal        TEXT,
  notes       TEXT,
  status      VARCHAR(20)   NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned', 'active', 'completed')),
  start_date  DATE,
  end_date    DATE,
  created_by  UUID          NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sprints_org_id     ON sprints(org_id);
CREATE INDEX idx_sprints_project_id ON sprints(project_id);

-- One active sprint per project (rbac.md sprint lifecycle invariant).
-- Partial unique index is the standard Postgres pattern for conditional
-- uniqueness — see v1's migration 003_user_orgs.sql `one_owner_per_org`.
CREATE UNIQUE INDEX one_active_sprint_per_project
  ON sprints(project_id)
  WHERE status = 'active';
