# Create Sprint

`POST /api/v1/projects/:id/sprints`

Creates a planned sprint in a project. Returns the new sprint.

## Request
- Auth required. Org role must be `owner`, `admin`, or `project_manager` (PMs must be a member of the project or the project must be public). Project must not be archived.
- Path: `:id` — project id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | non-empty string; trimmed |
| `startDate` | no | ISO date string |
| `endDate` | no | ISO date string |
| `goal` | no | free text; trimmed |
| `notes` | no | free text; trimmed |

## Responses

**201 — created**
```json
{
  "success": true,
  "data": {
    "id": "7",
    "name": "Sprint 12",
    "status": "planned",
    "startDate": "2026-06-02T00:00:00.000Z",
    "endDate": "2026-06-16T00:00:00.000Z",
    "goal": "Ship the billing rework",
    "notes": null,
    "projectId": "1",
    "archivedAt": null,
    "createdAt": "2026-06-02T14:00:00.000Z",
    "updatedAt": "2026-06-02T14:00:00.000Z"
  },
  "error": ""
}
```
`startDate` / `endDate` are `""` when not set.

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Sprint name is required" }
```
Other 400s: `Invalid project id`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "Cannot create sprints on an archived project" }
```
Other 403: `You do not have access to this project`.

**404 — project not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**409 — name conflict**
```json
{ "success": false, "data": {}, "error": "A sprint named \"Sprint 12\" already exists in this project" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not create sprint" }
```
