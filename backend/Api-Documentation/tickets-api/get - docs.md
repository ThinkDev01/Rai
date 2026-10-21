# Get Ticket

`GET /api/v1/projects/:id/tickets/:key`

Returns one ticket by its human key. This is the **full** shape — includes sub-ticket keys and comments.

## Request
- Auth required.
- Path:
  - `:id` — project id (number)
  - `:key` — ticket key (e.g. `PROJ-12`)

## Responses

**200 — full ticket**
```json
{
  "success": true,
  "data": {
    "id": "12",
    "key": "PROJ-12",
    "title": "Fix login redirect loop",
    "description": "Users bounce between /login and /dashboard",
    "type": "bug",
    "status": "in_progress",
    "priority": "high",
    "epicName": null,
    "epicColor": null,
    "storyPoints": null,
    "acceptanceCriteria": null,
    "stepsToReproduce": "1. Open /login\n2. Sign in\n3. Bounce back",
    "environment": "Chrome 120 · Windows 11",
    "assignee": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
    "reporter": { "id": "c3d4...", "name": "John Smith", "email": "john@acme.com", "role_type": "admin", "role_name": "Admin", "initials": "JS" },
    "parentKey": "PROJ-1",
    "subTicketKeys": ["PROJ-15", "PROJ-16"],
    "comments": [
      {
        "id": "7",
        "content": "Reproduced on staging.",
        "author": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
        "parentCommentId": null,
        "createdAt": "2026-06-02T09:30:00.000Z"
      }
    ],
    "sprintId": "3",
    "projectId": "1",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-02T09:30:00.000Z"
  },
  "error": ""
}
```

**400 — bad input**
```json
{ "success": false, "data": {}, "error": "Invalid project id or ticket key" }
```

**403 — no access to this project**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**404 — ticket not found** (message includes the key)
```json
{ "success": false, "data": {}, "error": "Ticket PROJ-12 not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load ticket" }
```
