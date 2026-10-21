# Create Ticket

`POST /api/v1/projects/:id/tickets`

Creates a ticket in a project. Returns the **full** ticket (with sub-tickets + comments).

## Request
- Auth required. Project must not be archived.
- Path: `:id` — project id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | min 2 characters |
| `type` | yes | `task` \| `bug` \| `story` \| `epic` |
| `priority` | yes | `lowest` \| `low` \| `medium` \| `high` \| `critical` |
| `status` | no | defaults to `todo` |
| `description` | no | free text |
| `assigneeId` | no | must be a member of this project |
| `sprintId` | no | must belong to this project |
| `parentKey` | no | existing ticket key in this project (e.g. `PROJ-1`) |

### Type-specific fields (Jira parity)

Send only the fields the `type` owns; anything for a different type is ignored. All optional.

| Field | For type | Notes |
|-------|----------|-------|
| `epicName` | `epic` | short label, ≤ 60 chars |
| `epicColor` | `epic` | one of `slate, blue, teal, green, amber, orange, red, pink, purple, indigo` |
| `storyPoints` | `story` | integer 0–999 |
| `acceptanceCriteria` | `story` | free text, ≤ 5000 chars |
| `stepsToReproduce` | `bug` | free text, ≤ 5000 chars |
| `environment` | `bug` | ≤ 255 chars |

The response always includes all six (`epicName`, `epicColor`, `storyPoints`, `acceptanceCriteria`, `stepsToReproduce`, `environment`) — `null` when unset or not applicable to the type.

## Responses

**201 — created** (full ticket)
```json
{
  "success": true,
  "data": {
    "id": "13",
    "key": "PROJ-13",
    "title": "Fix login redirect loop",
    "description": "Users bounce between /login and /dashboard",
    "type": "bug",
    "status": "todo",
    "priority": "high",
    "epicName": null,
    "epicColor": null,
    "storyPoints": null,
    "acceptanceCriteria": null,
    "stepsToReproduce": "1. Open /login\n2. Sign in\n3. Bounce to /login again",
    "environment": "Chrome 120 · Windows 11",
    "assignee": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
    "reporter": { "id": "c3d4...", "name": "John Smith", "email": "john@acme.com", "role_type": "admin", "role_name": "Admin", "initials": "JS" },
    "parentKey": "PROJ-1",
    "subTicketKeys": [],
    "comments": [],
    "sprintId": "3",
    "projectId": "1",
    "createdAt": "2026-06-02T14:00:00.000Z",
    "updatedAt": "2026-06-02T14:00:00.000Z"
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Title must be at least 2 characters" }
```
Other 400s: `Title is required`, `type must be one of: ...`, `priority must be one of: ...`, `Assignee is not a member of this project`, `Sprint does not belong to this project`, `Parent ticket "PROJ-X" not found in this project`, `Invalid sprintId`, `epicColor must be one of: ...`, `storyPoints must be an integer between 0 and 999`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "Cannot add tickets to an archived project" }
```

**404 — project not found** · **500 — db error** (`Could not create ticket`)
