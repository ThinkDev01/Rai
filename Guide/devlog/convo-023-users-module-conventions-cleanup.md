# convo-023 — Users module + conventions cleanup

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Confirmed Phase 0 migrations ran cleanly (user started server).
   No backend code referenced old column names or dropped tables — clean run.

2. Built Users module (Phase 2):
   - GET /api/v1/users        — all authenticated users
   - PATCH /api/v1/users/:id/role  — admin only; updates role_type + role_name
   - DELETE /api/v1/users/:id      — admin only; cannot delete self
   - middleware/requireRole.ts — reusable role guard factory for all future modules
   - toMember() helper — computes initials, casts id to string to match frontend Member type
   - docs/devguide/03-users.md created

3. Conventions update:
   - "save the convo" rule clarified in CONVENTIONS.md:
     means save THIS current session, not a new/future log

4. Cleanup:
   - Removed commented backlog route from server.ts (table dropped, concept is now a query)
   - Removed backlog module reference from info.md folder structure
   - Added 03-users.md to info.md devguide section

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT DB STATE (after migrations 010–015)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tables: users, projects, project_members, sprints, tickets, comments, schema_migrations
Dropped: backlog, ticket_details

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: auth ✓, Phase 0 migrations ✓, users module ✓
Next: Projects module (GET /projects, POST /projects, GET /projects/:id, PATCH, DELETE, members)
