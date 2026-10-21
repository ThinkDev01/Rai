# Update Ticket

`PATCH /api/v1/projects/:id/tickets/:ticketId`

Partial update of a ticket. Send only the fields you want to change. Returns the **full** ticket. Project must not be archived.

## Request
- Auth required. Project must not be archived.
- Path:
  - `:id` — project id (number)
  - `:ticketId` — ticket id (number)
- Body (JSON) — all optional, but at least one field is required:

| Field | Notes |
|-------|-------|
| `title` | non-empty, min 2 characters |
| `description` | free text, or `null` to clear |
| `type` | `task` \| `bug` \| `story` \| `epic` |
| `priority` | `lowest` \| `low` \| `medium` \| `high` \| `critical` |
| `status` | `todo` \| `in_progress` \| `in_review` \| `done` |
| `assigneeId` | member of this project, or `null` to unassign |
| `sprintId` | sprint in this project, or `null` to clear |
| `parentKey` | existing ticket key in this project, or `null`/`""` to clear |

### Type-specific fields (Jira parity)

Same fields as Create. `null` clears a field; only fields the **effective type** owns are written (effective type = `type` in this request if changing, else the ticket's current type). Changing `type` auto-clears the previous type's fields.

| Field | For type | Notes |
|-------|----------|-------|
| `epicName` | `epic` | ≤ 60 chars, or `null` |
| `epicColor` | `epic` | one of `slate, blue, teal, green, amber, orange, red, pink, purple, indigo` |
| `storyPoints` | `story` | integer 0–999, or `null` |
| `acceptanceCriteria` | `story` | ≤ 5000 chars, or `null` |
| `stepsToReproduce` | `bug` | ≤ 5000 chars, or `null` |
| `environment` | `bug` | ≤ 255 chars, or `null` |

## Responses

**200 — updated** (full ticket — same shape as Get Ticket)
```json
{
  "success": true,
  "data": {
    "id": "12",
    "key": "PROJ-12",
    "title": "Fix login redirect loop",
    "description": "Users bounce between /login and /dashboard",
    "type": "bug",
    "status": "done",
    "priority": "high",
    "epicName": null,
    "epicColor": null,
    "storyPoints": null,
    "acceptanceCriteria": null,
    "stepsToReproduce": "1. Open /login\n2. Sign in",
    "environment": "Chrome 120 · Windows 11",
    "assignee": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
    "reporter": { "id": "c3d4...", "name": "John Smith", "email": "john@acme.com", "role_type": "admin", "role_name": "Admin", "initials": "JS" },
    "parentKey": "PROJ-1",
    "subTicketKeys": [],
    "comments": [],
    "sprintId": "3",
    "projectId": "1",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-02T14:30:00.000Z"
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "No fields to update" }
```
Other 400s: `Invalid id`, `Title cannot be empty`, `Title must be at least 2 characters`, `type must be one of: ...`, `priority must be one of: ...`, `status must be one of: ...`, `Assignee is not a member of this project`, `Invalid sprintId`, `Sprint does not belong to this project`, `Parent ticket "PROJ-X" not found in this project`, `A ticket cannot be its own parent`, `epicColor must be one of: ...`, `storyPoints must be an integer between 0 and 999`, `epicName must be at most 60 characters`, `environment must be at most 255 characters`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "Cannot modify tickets in an archived project" }
```
Also `You do not have access to this project`.

**404 — project not found** (`Project not found`) · **404 — ticket not found** (`Ticket not found`)

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not update ticket" }
```
