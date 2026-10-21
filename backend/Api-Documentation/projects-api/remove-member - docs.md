# Remove Project Member

`DELETE /api/v1/projects/:id/members/:userId`

Removes a member from a project.

## Request
- Auth required. Role: `owner` | `admin` | `project_manager`.
- Path: `:id` — project id (number); `:userId` — target user id (string)

## Responses

**200 — removed**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — invalid path params**
```json
{ "success": false, "data": {}, "error": "Invalid id" }
```

**404 — not found** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Project not found" }
```
Other 404s: `User is not a member of this project`.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not remove member" }
```
