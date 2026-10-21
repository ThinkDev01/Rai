# convo-025 — Sprints module (Phase 4)

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session resumed from convo-024 (context was compacted mid-session self-review).
Self-review of remaining files completed — no bugs found — confirmed ready for Phase 4.

Built the Sprints module (Phase 4):
  POST   /api/v1/projects/:id/sprints              — create sprint (admin + PM)
  PATCH  /api/v1/projects/:id/sprints/:sprintId    — update / start / complete sprint (admin + PM)
  DELETE /api/v1/projects/:id/sprints/:sprintId    — delete sprint (admin only)

All routes added to the existing projects router (not a new server.ts mount).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY DECISIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Status transitions enforced in controller:
   - planned → active: getActiveSprint() check first (409 if another already active)
   - active → completed: TRANSACTION via completeSprintWithRollback()
   - Any backward/invalid transition → 400
   - Completed sprints are frozen

2. Complete sprint transaction (completeSprintWithRollback):
   - Sets status='completed', end_date=COALESCE(end_date, NOW())
   - Moves tickets where status != 'done' to backlog (sprint_id = NULL)
   - Tickets with status='done' stay in the completed sprint (appear in archive/reports)
   - Rolls back both if either fails

3. Delete sprint transaction (deleteSprintWithRollback):
   - Only planned sprints can be deleted (active/completed have real history)
   - Moves ALL sprint tickets to backlog first, then deletes the sprint
   - No archived project guard on delete (can clean up planned sprints on archived projects)

4. RBAC split:
   - create / update / start / complete = admin + project_manager
   - delete = admin only

5. toSprintResponse() formatter added to projects.types.ts:
   - Converts SprintRow → SprintResponse (same shape as frontend Sprint type)
   - Default empty tickets array for create/update responses
   - Frontend invalidates project detail query after each mutation to get full data

6. Dynamic SET builder for updateSprint (same pattern as updateProject):
   - Only fields provided in request body are updated
   - goal/notes can be explicitly set to null to clear them

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES CHANGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

backend/modules/projects/projects.types.ts
  - Added CreateSprintBody, UpdateSprintBody interfaces
  - Added toSprintResponse() formatter

backend/modules/projects/projects.model.ts
  - Added: getSprintById, getActiveSprint, createSprint, updateSprint
  - Added: completeSprintWithRollback (transaction)
  - Added: deleteSprintWithRollback (transaction)

backend/modules/projects/projects.controller.ts
  - Added: createSprintHandler, updateSprintHandler, deleteSprintHandler
  - Updated imports to include new model functions + types

backend/modules/projects/projects.routes.ts
  - Added 3 sprint routes under /:id/sprints and /:id/sprints/:sprintId
  - Imported 3 new handler functions

docs/backend-phases.md
  - Phase 4 marked ✓ DONE with full decision log
  - Phase 5 updated to ← NEXT

docs/devguide/05-sprints.md
  - New: full API reference for sprint endpoints

docs/info.md
  - Added 05-sprints.md to folder structure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: Phase 0 ✓, Phase 1 (auth) ✓, Phase 2 (users) ✓, Phase 3 (projects) ✓, Phase 4 (sprints) ✓
Next: Phase 5 — Tickets + Comments
