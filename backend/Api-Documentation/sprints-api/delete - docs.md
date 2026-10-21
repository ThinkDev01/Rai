# Delete Sprint

`DELETE /api/v1/projects/:id/sprints/:sprintId`

Deletes a sprint. Only `planned` sprints can be deleted.

## Request
- Auth required. Org role must be `owner`, `admin`, or `project_manager` (PMs must be a member of the project or the project must be public).
- Path: `:id` — project id (number); `:sprintId` — sprint id (number)
- No body.

## Responses

**200 — deleted**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "Only planned sprints can be deleted" }
```
Other 400: `Invalid id`.

**403 — no access**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Sprint not found" }
```
Other 404: `Project not found`.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not delete sprint" }
```
