# List Tickets

`GET /api/v1/projects/:id/tickets`

Returns all tickets in a project (board / backlog view). Optional filters narrow the list. This is the lighter list shape — no comments or sub-tickets (use **Get Ticket** for those).

## Request
- Auth required.
- Path: `:id` — project id (number)
- Query (all optional):
  - `status` — `todo` | `in_progress` | `in_review` | `done`
  - `type` — `task` | `bug` | `story` | `epic`
  - `priority` — `lowest` | `low` | `medium` | `high` | `critical`
  - `assigneeId` — user id

## Responses

**200 — array of tickets**
```json
{
  "success": true,
  "data": [
    {
      "id": "12",
      "key": "PROJ-12",
      "title": "Fix login redirect loop",
      "type": "bug",
      "status": "in_progress",
      "priority": "high",
      "assigneeId": "a1b2...",
      "assignee": "Jane Doe",
      "reporterId": "c3d4...",
      "reporter": "John Smith",
      "sprintId": "3",
      "sprintName": "Sprint 2",
      "createdAt": "2026-06-01T10:00:00.000Z",
      "updatedAt": "2026-06-02T09:30:00.000Z"
    }
  ],
  "error": ""
}
```

**400 — bad input** (invalid project id, or a filter value outside the allowed set)
```json
{ "success": false, "data": {}, "error": "status must be one of: todo, in_progress, in_review, done" }
```

**403 — no access to this project**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load tickets" }
```
