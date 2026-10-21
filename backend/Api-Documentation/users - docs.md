# Get User Tickets

`GET /api/v1/users/:id/tickets`

Returns every ticket assigned to one user in the current org, filtered by what the caller can see. Owners/admins see org-wide; everyone else only sees public projects plus projects they belong to.

## Request
- Auth required. Org-scoped — needs the `X-Org-Id` header.
- Path: `:id` — target user id (the assignee whose tickets you want)
- No query params.

## Responses

**200 — array of work items** (each item is `{ ticket, project, sprint }`)
```json
{
  "success": true,
  "data": [
    {
      "ticket": {
        "id": "12",
        "key": "PROJ-12",
        "title": "Fix login redirect loop",
        "description": "Users bounce between /login and /home",
        "type": "bug",
        "status": "in_progress",
        "priority": "high",
        "assignee": null,
        "reporter": null,
        "parentKey": null,
        "subTicketKeys": [],
        "comments": [],
        "sprintId": "3",
        "projectId": "7",
        "createdAt": "2026-06-01T10:00:00.000Z",
        "updatedAt": "2026-06-02T09:30:00.000Z",
        "assigneeName": "Jane Doe",
        "reporterName": "John Smith"
      },
      "project": {
        "id": "7",
        "name": "Rai Web",
        "key": "PROJ",
        "description": null,
        "archived": false,
        "visibility": "public",
        "ticketCount": 0,
        "memberCount": 0,
        "activeSprintName": null,
        "lastActive": "2026-06-02T09:30:00.000Z"
      },
      "sprint": {
        "id": "3",
        "name": "Sprint 2",
        "status": "active",
        "startDate": "2026-05-26T00:00:00.000Z",
        "endDate": "2026-06-09T00:00:00.000Z"
      }
    }
  ],
  "error": ""
}
```
When a ticket is in the backlog (no sprint), `ticket.sprintId` is `null` and `sprint` is `{ "id": "", "name": "Backlog", "status": "planned", "startDate": "", "endDate": "" }`.

**400 — missing/invalid user id**
```json
{ "success": false, "data": {}, "error": "Invalid user id" }
```

**401 — no or invalid token**
```json
{ "success": false, "data": {}, "error": "Authentication required" }
```

**403 — no active org context**
```json
{ "success": false, "data": {}, "error": "No organization selected - switch into an org and retry" }
```

**404 — target user not a member of this org**
```json
{ "success": false, "data": {}, "error": "User not found in this organization" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load user tickets" }
```
