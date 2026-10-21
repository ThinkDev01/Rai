# My Tickets

`GET /api/v1/me/tickets`

All tickets assigned to the caller in the current org, filtered by what they can see. Owners/admins see org-wide; others see only their accessible projects.

## Request
- Auth required. **Org context required** via the `X-Org-Id` header — 403 otherwise.
- No path/query params.

## Responses

**200 — OK** (array of work items)
```json
{
  "success": true,
  "data": [
    {
      "ticket": {
        "id": "13",
        "key": "PROJ-13",
        "title": "Fix login redirect loop",
        "description": "Users bounce between /login and /dashboard",
        "type": "bug",
        "status": "todo",
        "priority": "high",
        "assignee": null,
        "reporter": null,
        "parentKey": null,
        "subTicketKeys": [],
        "comments": [],
        "sprintId": "3",
        "projectId": "1",
        "createdAt": "2026-06-02T14:00:00.000Z",
        "updatedAt": "2026-06-02T14:00:00.000Z",
        "assigneeName": "Jane Doe",
        "reporterName": "John Smith",
        "isPinned": false
      },
      "project": {
        "id": "1",
        "name": "Platform",
        "key": "PROJ",
        "description": null,
        "archived": false,
        "visibility": "team",
        "ticketCount": 0,
        "memberCount": 0,
        "activeSprintName": null,
        "lastActive": "2026-06-02T14:00:00.000Z"
      },
      "sprint": {
        "id": "3",
        "name": "Sprint 4",
        "status": "active",
        "startDate": "2026-05-26T00:00:00.000Z",
        "endDate": "2026-06-09T00:00:00.000Z"
      }
    }
  ],
  "error": ""
}
```
`data` is `[]` when nothing is assigned. For a ticket with no sprint, `sprintId` is `null` and `sprint` is `{ "id": "", "name": "Backlog", "status": "planned", "startDate": "", "endDate": "" }`. `ticket.isPinned` reflects the **caller's** personal pin (toggle via `PUT`/`DELETE /me/pins/tickets/:id`); My Work floats pinned tickets into a top section.

**401 — auth** (`Authentication required`, `Invalid or expired token`, `Token missing email claim`)

**403 — no org context**
```json
{ "success": false, "data": {}, "error": "No organization selected - switch into an org and retry" }
```

**500 — db error** (`Could not load your tickets`)
