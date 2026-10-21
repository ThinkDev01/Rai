# convo-022 — Auth review + Phase 0 corrective migrations

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Resumed from previous sessions. Frontend was fully complete. Backend only had auth done.

2. Reviewed auth module in full:
   - auth.routes, auth.controller, auth.model, auth.types — all correct
   - authMiddleware — correct
   - errorHandler, rateLimiter — correct
   - Found one bug: createUser INSERT did not set role_name, so new users got role_name=''
   - Fix: added role_name='User' to the INSERT in auth.model.ts (all new users start as 'user' role)

3. Phase 0 — corrective migrations to align DB schema with frontend types
   - All mismatches found by cross-referencing existing migrations with frontend/types/api.types.ts
   - 6 new migrations written (010–015)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATIONS WRITTEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

010_fix_projects.sql
  - RENAME COLUMN prefix → key
  - ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false

011_fix_tickets.sql
  - RENAME COLUMN ticket_number → key
  - ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'task'
    CHECK (type IN ('task', 'bug', 'story', 'epic'))
  - DROP + re-add status CHECK: added 'in_review'
    CHECK (status IN ('todo', 'in_progress', 'in_review', 'done'))
  - DROP + re-add priority CHECK: added 'lowest'
    CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'critical'))
  - ADD COLUMN description TEXT
  - Migrates existing descriptions from ticket_details into tickets.description
  - ADD COLUMN parent_id INT REFERENCES tickets(id) ON DELETE SET NULL

012_fix_sprints.sql
  - ADD COLUMN notes TEXT
  - DROP + re-add status CHECK: removed 'archived'
    CHECK (status IN ('planned', 'active', 'completed'))

013_drop_ticket_details.sql
  - DROP TABLE ticket_details (description now lives on tickets)

014_drop_backlog_table.sql
  - DROP TABLE backlog (backlog = tickets WHERE sprint_id IS NULL)

015_create_project_members.sql
  - CREATE TABLE project_members (project_id, user_id, joined_at)
  - UNIQUE(project_id, user_id)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- docs/db.md created — simple table-by-table reference
- docs/info.md updated — migrations list + development phases

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Auth: complete and verified ✓
- Phase 0 migrations: complete ✓ (will run on next server start)
- Backend modules still to build: users, projects, sprints, tickets, comments, search, my-work
- Next: Phase 2 — Users module (GET /users, PATCH /users/:id/role, DELETE /users/:id)
