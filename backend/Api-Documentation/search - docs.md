# Search Tickets

`GET /api/v1/search`

Org-scoped, visibility-aware ticket search by title or key (case-insensitive). Key matches rank first, then most-recently-updated. Capped at 20 results.

## Request
- Auth required. Org-scoped — needs the `X-Org-Id` header.
- Query:
  - `q` — search term (required, min 2 characters). Owners/admins search every non-archived project in the org; others search public projects plus their own.

## Responses

**200 — array of matches** (max 20)
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
      "assignee": {
        "id": "a1b2...",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "role_type": "user",
        "role_name": "Member",
        "initials": "JD"
      },
      "projectId": "7",
      "projectName": "Rai Web",
      "projectKey": "PROJ"
    }
  ],
  "error": ""
}
```
`assignee` is `null` when the ticket is unassigned.

**400 — query too short** (fewer than 2 characters)
```json
{ "success": false, "data": [], "error": "Query must be at least 2 characters" }
```

**401 — no or invalid token**
```json
{ "success": false, "data": {}, "error": "Authentication required" }
```

**403 — no active org context**
```json
{ "success": false, "data": {}, "error": "No organization selected - switch into an org and retry" }
```

**500 — db error**
```json
{ "success": false, "data": [], "error": "Search failed" }
```
