# Burndown Report

`GET /api/v1/projects/:id/reports/burndown`

Daily burndown for one sprint: tickets still not `done` at end-of-day vs. the ideal line.

## Request
- Auth required. Caller must have access to the project.
- Path: `:id` — project id (number)
- Query: `sprintId` — sprint id (number), **required**

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "points": [
      { "date": "2026-05-20", "remaining": 8, "ideal": 8 },
      { "date": "2026-05-21", "remaining": 7, "ideal": 6.4 },
      { "date": "2026-05-22", "remaining": 5, "ideal": 4.8 }
    ],
    "startDate": "2026-05-20",
    "endDate": "2026-05-30",
    "totalTickets": 8
  },
  "error": ""
}
```
Empty sprint (no tickets, or sprint has no start date) returns `points: []` with `totalTickets: 0`.

**400 — invalid ids**
```json
{ "success": false, "data": {}, "error": "Invalid project id or sprintId" }
```

**403 — no access**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not build burndown" }
```
