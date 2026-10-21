-- v2 multi-tenant tickets + comments + ticket_status_history
--
-- All three carry v1's final shape (post-migration-011/013/016) with
-- two changes: (a) every row gains `org_id UUID NOT NULL` and (b) all
-- FKs to users are UUID instead of INT (users.id is UUID v7 in v2).
--
-- Ticket types and statuses are locked per v1 — no `subtask` type (use
-- parent_id), no `cancelled` status. Customization deferred to v3+.
--
-- ticket_status_history scope is status-only (v1 parity). Full audit log
-- of every field change (assignee, priority, sprint moves) is a v3
-- product call. Burndown + sprint reports only need status transitions.

CREATE TABLE IF NOT EXISTS tickets (
  id           BIGSERIAL     PRIMARY KEY,
  org_id       UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   BIGINT        NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  sprint_id    BIGINT        REFERENCES sprints(id)                ON DELETE SET NULL,
  parent_id    BIGINT        REFERENCES tickets(id)                ON DELETE SET NULL,
  key          VARCHAR(20)   NOT NULL,
  title        VARCHAR(500)  NOT NULL,
  description  TEXT,
  type         VARCHAR(20)   NOT NULL DEFAULT 'task'
                             CHECK (type IN ('task', 'bug', 'story', 'epic')),
  status       VARCHAR(20)   NOT NULL DEFAULT 'todo'
                             CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  priority     VARCHAR(20)   NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'critical')),
  assignee_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
  reporter_id  UUID          NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tickets_project_key UNIQUE (project_id, key)
);

-- Per Q13: `UNIQUE (project_id, key)` is sufficient — adding org_id is
-- redundant because project_id already encodes the org via FK.
--
-- Hot paths (board view, ticket panel, My Work, search):
--   - by project + sprint (Kanban)
--   - by sprint (sprint report)
--   - by assignee (My Work)
--   - by org (cross-project AI agent endpoints + search)
CREATE INDEX idx_tickets_org_id      ON tickets(org_id);
CREATE INDEX idx_tickets_project_id  ON tickets(project_id);
CREATE INDEX idx_tickets_sprint_id   ON tickets(sprint_id)   WHERE sprint_id   IS NOT NULL;
CREATE INDEX idx_tickets_assignee_id ON tickets(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tickets_parent_id   ON tickets(parent_id)   WHERE parent_id   IS NOT NULL;


CREATE TABLE IF NOT EXISTS comments (
  id          BIGSERIAL     PRIMARY KEY,
  org_id      UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id   BIGINT        NOT NULL REFERENCES tickets(id)       ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES users(id),
  content     TEXT          NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_org_id    ON comments(org_id);
CREATE INDEX idx_comments_ticket_id ON comments(ticket_id);


CREATE TABLE IF NOT EXISTS ticket_status_history (
  id           BIGSERIAL    PRIMARY KEY,
  org_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id    BIGINT       NOT NULL REFERENCES tickets(id)       ON DELETE CASCADE,
  sprint_id    BIGINT       REFERENCES sprints(id)                ON DELETE SET NULL,
  old_status   VARCHAR(20),
  new_status   VARCHAR(20)  NOT NULL,
  changed_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tsh_org_id     ON ticket_status_history(org_id);
CREATE INDEX idx_tsh_ticket_id  ON ticket_status_history(ticket_id);
CREATE INDEX idx_tsh_sprint_id  ON ticket_status_history(sprint_id) WHERE sprint_id IS NOT NULL;
CREATE INDEX idx_tsh_changed_at ON ticket_status_history(changed_at);
