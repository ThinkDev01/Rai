# Add Project Member

`POST /api/v1/projects/:id/members`

Adds an existing org member to a project. Returns the **full** project shape (same as Get Project) with the new member included.

## Request
- Auth required. Role: `owner` | `admin` | `project_manager`. Project must not be archived.
- Path: `:id` — project id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `userId` | yes | string; must be a member of this org |

## Responses

**200 — added** (full project — see Get Project for the shape)
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
      { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" }
    ],
    "sprints": [],
    "backlog": [],
    "ticketCount": 42,
    "memberCount": 9,
    "activeSprintName": "Sprint 7",
    "lastActive": "2026-06-02T14:00:00.000Z",
    "createdAt": "2026-01-10T09:00:00.000Z",
    "updatedAt": "2026-06-02T14:00:00.000Z"
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Invalid project id" }
```
Other 400s: `userId is required`.

**403 — archived**
```json
{ "success": false, "data": {}, "error": "Cannot add members to an archived project" }
```

**404 — not found** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Project not found" }
```
Other 404s: `User is not a member of this organization`.

**409 — already a member**
```json
{ "success": false, "data": {}, "error": "User is already a member of this project" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not add member" }
```
