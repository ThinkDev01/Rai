# convo-026 — Sprint bugs, error messages, notes deferral

Date: 2026-04-13

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HAPPENED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Post-build testing of Phase 4 sprints revealed several issues. All fixed.
Phase 4 confirmed working end-to-end. Ready for Phase 5.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUGS FIXED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Sprint creation failing for all users (admin included)
   Root cause: createSprint INSERT was missing `created_by` — NOT NULL column in DB.
   Fix: added createdBy param to createSprint() model function, passed req.user!.id from controller.

2. Generic error toasts on sprint/ticket failures
   Root cause: all onError handlers in useSprints.ts and useTickets.ts were hardcoded strings.
   Fix: both hooks now read err.response?.data?.error (same pattern as useCreateProject).

3. Duplicate sprint names allowed
   Fix: sprintNameExists() check (LOWER comparison) before INSERT. Returns 409 with specific message.
   Note: checks across ALL sprint statuses — including completed. Reusing a completed sprint's name
   is intentionally blocked to avoid confusion in archive/reports.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN DECISIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Notes field deferred:
  - Current `notes TEXT` column stays in DB and backend accepts it via UpdateSprintBody.
  - Frontend Notes card removed from sprint page entirely.
  - Future plan: per-user "quote-style" notes (sprint_notes table: sprint_id, user_id, content,
    created_at), displayed as "content — author name". Will be built as its own feature.

Goal editing rules:
  - canEdit changed from `isActive && canManage` → `!isCompleted && canManage`
  - Admin/PM can edit goal on planned OR active sprints. Locked once sprint is completed.

Dates are reference only:
  - start_date/end_date are metadata. No auto-start or auto-complete logic.
  - Sprint status is always changed manually by admin/PM.

"Route not found" on ticket creation:
  - Expected — Phase 5 not built yet. Endpoint doesn't exist. Error message is now accurate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES CHANGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

backend/modules/projects/projects.model.ts
  - createSprint: added createdBy param, included in INSERT
  - sprintNameExists: new function (LOWER name check per project)

backend/modules/projects/projects.controller.ts
  - createSprintHandler: passes userId as createdBy, added sprintNameExists check before INSERT
  - Imported sprintNameExists

frontend/hooks/useSprints.ts
  - All onError handlers now read actual backend error via axios.isAxiosError
  - Added sprintError() helper to avoid repetition

frontend/hooks/useTickets.ts
  - All onError handlers now read actual backend error via axios.isAxiosError
  - Added ticketError() helper

frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx
  - Removed Notes card entirely (UI hidden, backend field preserved)
  - Removed notes/draftNotes state variables
  - canEdit: isActive && canManage → !isCompleted && canManage
  - saveEdit: no longer sends notes field
  - Removed FileText import

docs/backend-phases.md
  - Phase 4 decisions updated: notes deferral, name uniqueness, bug fixes, canEdit fix

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: Phase 0 ✓, Phase 1 (auth) ✓, Phase 2 (users) ✓, Phase 3 (projects) ✓, Phase 4 (sprints) ✓
Next: Phase 5 — Tickets + Comments
