# Get Project

`GET /api/v1/projects/:id`

Returns the **full** project: members, sprints (with their tickets nested), backlog, and activity rollup. Tickets come back with `comments: []` (loaded on demand elsewhere).

## Request
- Auth required. Any org member, subject to visibility (private projects 404 to non-members).
- Path: `:id` — project id (number)

## Responses

**200 — OK** (full project)
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "Rai Platform",
    "key": "RAI",
    "description": "Core product work",
    "archived": false,
    "visibility": "public",
    "members": [
      { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "admin", "role_name": "Admin", "initials": "JD" }
    ],
    "sprints": [
      {
        "id": "3",
        "name": "Sprint 7",
        "status": "active",
        "startDate": "2026-05-20",
        "endDate": "2026-06-03",
        "goal": "Ship auth",
        "notes": null,
        "projectId": "1",
        "archivedAt": null,
        "tickets": [],
        "createdAt": "2026-05-20T09:00:00.000Z",
        "updatedAt": "2026-05-20T09:00:00.000Z"
      }
    ],
    "backlog": [],
    "ticketCount": 42,
    "memberCount": 8,
    "activeSprintName": "Sprint 7",
    "lastActive": "2026-06-02T14:00:00.000Z",
    "createdAt": "2026-01-10T09:00:00.000Z",
    "updatedAt": "2026-06-02T14:00:00.000Z"
  },
  "error": ""
}
```
Each ticket in `sprints[].tickets` and `backlog` is the full ticket shape (assignee, reporter, parentKey, subTicketKeys, `comments: []`).

**400 — invalid id**
```json
{ "success": false, "data": {}, "error": "Invalid project id" }
```

**404 — not found / not visible**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load project" }
```
