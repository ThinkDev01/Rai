# Update Project

`PATCH /api/v1/projects/:id`

Partial update of a project. Returns the **full** project shape (same as Get Project). While a project is archived, the only allowed change is unarchiving (`archived: false`); every other field is frozen.

## Request
- Auth required. Role: `owner` | `admin` | `project_manager`.
- Path: `:id` — project id (number)
- Body (JSON) — all fields optional, send at least one:

| Field | Notes |
|-------|-------|
| `name` | non-empty string |
| `description` | string or `null` (empty string becomes `null`) |
| `visibility` | `public` \| `private` |
| `archived` | boolean |
| `avatarType` | `initials` \| `icon`. Send with `avatarValue` as a pair. `initials` clears the icon; `icon` **requires** `avatarValue`. |
| `avatarValue` | preset icon id (lowercase `a-z 0-9 -`, ≤50 chars) when `avatarType` is `icon`; `null` otherwise. The id→icon map lives on the frontend (`lib/projectAvatar`). |

## Responses

**200 — updated** (full project — see Get Project for the shape)
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "Rai Platform (renamed)",
    "key": "RAI",
    "description": "Core product work",
    "archived": false,
    "visibility": "private",
    "avatarType": "icon",
    "avatarValue": "rocket",
    "members": [],
    "sprints": [],
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

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Invalid project id" }
```
Other 400s: `name must be a non-empty string`, `visibility must be "public" or "private"`, `archived must be a boolean`, `avatarType must be "initials" or "icon"`, `avatarValue must be a lowercase icon id (a-z, 0-9, -)`, `avatarValue is required when avatarType is "icon"`, `No fields to update`.

**403 — archived**
```json
{ "success": false, "data": {}, "error": "Project is archived - unarchive it first to edit other fields" }
```

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not update project" }
```
