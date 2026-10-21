# Update Sprint

`PATCH /api/v1/projects/:id/sprints/:sprintId`

Updates sprint fields or transitions its status (start / complete). Returns the updated sprint.

## Request
- Auth required. Org role must be `owner`, `admin`, or `project_manager` (PMs must be a member of the project or the project must be public). Project must not be archived.
- Path: `:id` — project id (number); `:sprintId` — sprint id (number)
- Body (JSON) — send only the fields you want to change:

| Field | Notes |
|-------|-------|
| `name` | non-empty string; trimmed |
| `goal` | free text or `null` |
| `notes` | free text or `null` |
| `startDate` | ISO date string or `null` |
| `endDate` | ISO date string or `null` |
| `status` | `active` (start) or `completed` (finish). Cannot revert to `planned`. |
| `archived` | boolean. Active sprints can't be archived — complete first. |

When `status` is present it takes the status-transition path (the other fields are ignored). `active` requires no other sprint is currently active in the project; completing moves incomplete tickets to the backlog.

## Responses

**200 — updated**
```json
{
  "success": true,
  "data": {
    "id": "7",
    "name": "Sprint 12",
    "status": "active",
    "startDate": "2026-06-02T00:00:00.000Z",
    "endDate": "2026-06-16T00:00:00.000Z",
    "goal": "Ship the billing rework",
    "notes": null,
    "projectId": "1",
    "archivedAt": null,
    "createdAt": "2026-06-02T14:00:00.000Z",
    "updatedAt": "2026-06-02T15:30:00.000Z"
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "No fields to update" }
```
Other 400s: `Invalid id`, `Sprint name cannot be empty`, `archived must be a boolean`, `Cannot revert a sprint to planned`, `Cannot change the status of a completed sprint`, `Sprint is already active` (or `Sprint is already completed`), `Only an active sprint can be completed`, `Complete the sprint first - active sprints cannot be archived in-place`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "Cannot modify sprints on an archived project" }
```
Other 403: `You do not have access to this project`.

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Sprint not found" }
```
Other 404: `Project not found`.

**409 — conflict**
```json
{ "success": false, "data": {}, "error": "Another sprint is already active: \"Sprint 11\"" }
```
Other 409: `A sprint named "Sprint 12" already exists in this project` (on rename).

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not update sprint" }
```
Also `Could not complete sprint` if the completion write fails.
