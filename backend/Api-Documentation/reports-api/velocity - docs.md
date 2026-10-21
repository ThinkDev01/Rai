# Velocity Report

`GET /api/v1/projects/:id/reports/velocity`

Committed vs. completed ticket counts per sprint, oldest sprint first.

## Request
- Auth required. Caller must have access to the project.
- Path: `:id` — project id (number)
- No query params.

## Responses

**200 — OK** (array, ordered by sprint creation)
```json
{
  "success": true,
  "data": [
    { "sprintId": 1, "sprintName": "Sprint 1", "committed": 10, "completed": 9, "status": "completed" },
    { "sprintId": 2, "sprintName": "Sprint 2", "committed": 12, "completed": 8, "status": "completed" },
    { "sprintId": 3, "sprintName": "Sprint 3", "committed": 8,  "completed": 3, "status": "active" }
  ],
  "error": ""
}
```
`committed` = total tickets in the sprint; `completed` = those with `status: "done"`. Empty array when the project has no sprints.

**400 — invalid id**
```json
{ "success": false, "data": {}, "error": "Invalid project id" }
```

**403 — no access**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not build velocity" }
```
