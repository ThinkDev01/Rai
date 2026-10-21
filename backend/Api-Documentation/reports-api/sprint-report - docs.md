# Sprint Report

`GET /api/v1/projects/:id/reports/sprint-report`

End-of-sprint summary: tickets grouped into completed, incomplete, and removed-from-sprint.

## Request
- Auth required. Caller must have access to the project.
- Path: `:id` — project id (number)
- Query: `sprintId` — sprint id (number), **required**

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "sprintName": "Sprint 4",
    "sprintStatus": "completed",
    "startDate": "2026-05-20",
    "endDate": "2026-05-30",
    "completed": [
      { "id": 12, "key": "PROJ-12", "title": "Login redirect fix", "type": "bug", "status": "done", "priority": "high", "assignee_name": "Jane Doe" }
    ],
    "incomplete": [
      { "id": 15, "key": "PROJ-15", "title": "Audit log table", "type": "task", "status": "in_progress", "priority": "medium", "assignee_name": null }
    ],
    "removed": [
      { "id": 9, "key": "PROJ-9", "title": "Spike: caching", "type": "story", "status": "todo", "priority": "low", "assignee_name": "John Smith" }
    ]
  },
  "error": ""
}
```
`completed` = tickets with `status: "done"`; `incomplete` = everything else still in the sprint; `removed` = tickets that were in this sprint per history but have since left it. `assignee_name` is `null` when unassigned.

**400 — invalid ids**
```json
{ "success": false, "data": {}, "error": "Invalid project id or sprintId" }
```

**403 — no access**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project or sprint not found** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Project not found" }
```
```json
{ "success": false, "data": {}, "error": "Sprint not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not build sprint report" }
```
