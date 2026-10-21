# convo-024 — Projects module + backend phases doc

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Built Projects module (Phase 3) — fully complete:
   GET    /api/v1/projects
   POST   /api/v1/projects                       ← TRANSACTION (project + member)
   GET    /api/v1/projects/:id                   ← full nested Project shape
   PATCH  /api/v1/projects/:id
   DELETE /api/v1/projects/:id
   POST   /api/v1/projects/:id/members
   DELETE /api/v1/projects/:id/members/:userId

2. Key decisions made:
   - GET /projects/:id uses 4 separate queries (not one mega JOIN) assembled in JS
     via buildFullProject() — members + sprints + tickets run in parallel (Promise.all)
   - id→key map built once for O(1) parent/subTicket lookups per ticket
   - comments: [] on project endpoint — real comments load via GET /projects/:id/tickets/:key
   - Visibility filtering in SQL (not JS) — admin boolean param short-circuits WHERE clause
   - Dynamic SET builder for PATCH — handles nullable fields correctly (COALESCE can't)
   - Transaction on create: pool.connect() → BEGIN → INSERT project → INSERT member → COMMIT
   - Archived projects return 403 on any further PATCH

3. Created docs/backend-phases.md — reference file covering:
   - Phase 0 (migrations), Phase 1 (auth), Phase 2 (users), Phase 3 (projects): what was built + decisions
   - Phase 4 (sprints), Phase 5 (tickets+comments), Phase 6 (search+my-work): what's coming + key things to handle

4. docs/info.md updated — backend-phases.md and db.md added to folder structure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: Phase 0 migrations ✓, auth ✓, users ✓, projects ✓
Next: Phase 4 — Sprints (POST/PATCH/DELETE /projects/:id/sprints/:sprintId)
      Routes added to the existing projects router (not a new server.ts mount)
