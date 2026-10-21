# Create Project

`POST /api/v1/projects`

Creates a project in the caller's current org. Returns the **full** project shape (same as Get Project).

## Request
- Auth required. Role: `owner` | `admin` | `project_manager`.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | non-empty string |
| `key` | yes | 2–10 uppercase letters/numbers, `^[A-Z0-9]{2,10}$` (e.g. `RAI`); must be unique in the org |
| `visibility` | yes | `public` \| `private` |
| `description` | no | free text |
| `avatarType` | no | `initials` (default) \| `icon`. `icon` requires `avatarValue` |
| `avatarValue` | no | preset icon id, lowercase slug `^[a-z0-9-]{1,50}$` (e.g. `rocket`); required when `avatarType` is `icon`, ignored otherwise |

## Responses

**201 — created** (full project — see Get Project for the shape)
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
    "avatarType": "icon",
    "avatarValue": "rocket",
    "members": [],
    "sprints": [],
    "backlog": [],
    "ticketCount": 0,
    "memberCount": 1,
    "activeSprintName": null,
    "lastActive": "2026-06-02T14:00:00.000Z",
    "createdAt": "2026-06-02T14:00:00.000Z",
    "updatedAt": "2026-06-02T14:00:00.000Z"
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Project name is required" }
```
Other 400s: `Key must be 2–10 uppercase letters/numbers (e.g. RAI)`, `visibility must be "public" or "private"`, `avatarType must be "initials" or "icon"`, `avatarValue must be a lowercase icon id (a-z, 0-9, -)`, `avatarValue is required when avatarType is "icon"`.

**409 — key conflict**
```json
{ "success": false, "data": {}, "error": "Project key \"RAI\" is already in use in this org" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not create project" }
```
