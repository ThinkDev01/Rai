# Convo 013 — Product Discussion: Sprint Goals, Dev/Test Handoff, User History

**Date:** 2026-04-11  
**Type:** Discussion / Planning

---

## Topics discussed

### Sidebar sprint items doing nothing
- Board is sprint-specific; Backlog, Archive, Reports, Overview are all project-wide
- Sprint list in sidebar is static/non-clickable — feels odd
- Agreed: make sprint items clickable → Sprint page (goal + notes + progress)
- **Deferred** — sidebar refinement comes after sprint goal/notes + My Work are built

### Sprint goal / notes
- Each sprint needs a Goal field (what are we achieving?) and Notes (decisions, blockers, context)
- Active sprint: editable. Completed sprint: read-only historical record
- This is Rai's "all in one" advantage over Jira + Confluence
- **To implement now**

### Dev → Test handoff
- User's old org: reassigned ticket to tester → lost dev history (bad pattern)
- Options discussed:
  - **Extra status columns**: Add `In Testing` + `Ready for Prod` between In Review and Done (simplest)
  - **Sub-tasks**: DEV sub-task + QA sub-task under same parent (most structured)
  - **Separate QA ticket type**: linked to parent dev ticket (overhead, rarely worth it)
- Recommendation: extra columns + sub-tasks (already exist)
- **Deferred** — discuss further after sprint goal/My Work are built

### User ticket history ("My Work")
- Jira requires JQL (`assignee = currentUser()`) — no dedicated page, loses history on reassignment
- Rai should have a "My Work" page showing:
  - All tickets currently assigned to user (across all projects)
  - All tickets ever assigned to user (even after reassignment)
  - Filter by project, sprint, status
- **To implement now**

## Implementation order agreed
1. Sprint goal/notes → Sprint page accessible from Overview + Backlog
2. My Work page → top-level, linked from global sidebar
3. Then: discuss sidebar sprint refinement + dev/test handoff
