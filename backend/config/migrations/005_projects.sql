-- v2 multi-tenant projects + project_members
--
-- All tenant-scoped tables follow Q13: BIGSERIAL id, org_id UUID NOT NULL,
-- FK chain rooted at organizations with ON DELETE CASCADE so an org
-- hard-delete (Q14 self-serve or v3 retention purge) cleans up everything
-- in one statement.
--
-- Membership model is intentionally minimal — (project_id, user_id) only.
-- All project-level permissions are derived from org role + membership
-- per docs/rbac.md (Linear/Slack/v1 pattern; Jira/GitHub-style per-project
-- roles deferred indefinitely — adding the column later is a one-line
-- ALTER if product needs it).
--
-- Default visibility is `private` per the v1-feedback batch in v2-plans.md
-- Phase 2 scope. v1 defaulted to `public`; v2 reverses that because the
-- multi-tenant context makes "anyone in the org sees by default" too loud.

CREATE TABLE IF NOT EXISTS projects (
  id           BIGSERIAL     PRIMARY KEY,
  org_id       UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         VARCHAR(255)  NOT NULL,
  key          VARCHAR(10)   NOT NULL,
  description  TEXT,
  visibility   VARCHAR(10)   NOT NULL DEFAULT 'private'
                             CHECK (visibility IN ('public', 'private')),
  archived     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_by   UUID          NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_projects_org_key UNIQUE (org_id, key)
);

-- Every tenant-scoped table indexes org_id (RF-14 / standards.md §2).
-- `(org_id, key)` UNIQUE already covers org_id-prefixed lookups, but a
-- dedicated index on org_id alone lets list queries (`SELECT ... WHERE
-- org_id = $1`) skip the key sort overhead.
CREATE INDEX idx_projects_org_id     ON projects(org_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);


CREATE TABLE IF NOT EXISTS project_members (
  project_id  BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- Composite PK already covers `WHERE project_id = $1 AND user_id = $2`
-- and `WHERE project_id = $1` (project membership list). Reverse-order
-- lookup `WHERE user_id = $1` (the "what projects am I in?" query that
-- powers Dashboard) needs its own index — PK doesn't help with the
-- second column alone.
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
