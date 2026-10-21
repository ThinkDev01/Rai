# Export Org Data

`GET /api/v1/orgs/:id/export?format=json|xlsx`

Owner/admin-only full export of an organization — **Members, Projects, Sprints, Tickets, Comments**. Streams a file download (`Content-Disposition: attachment`). Includes member emails + every ticket and comment, so it's gated to the org-management tier.

## Request
- Auth required. Caller must be the org **owner or admin**.
- Path: `:id` — org id
- Query: `format` — `json` (default) or `xlsx`
- No body.

## Response

**200** — a file download:
- `format=json` → `application/json`, filename `rai-export-<slug>-<YYYY-MM-DD>.json`. Body shape:
  ```json
  {
    "exportedAt": "2026-06-08T13:00:00.000Z",
    "org":      { "id": "...", "name": "Acme Corp", "slug": "acme", "subscription_status": "trial", "created_at": "..." },
    "members":  [ { "user_id": "...", "name": "Jane", "email": "jane@acme.com", "role": "owner", "role_label": null, "joined_at": "..." } ],
    "projects": [ { "id": 1, "key": "PROJ", "name": "...", "description": "...", "visibility": "private", "archived": false, "created_at": "..." } ],
    "sprints":  [ { "id": 3, "project_id": 1, "project_key": "PROJ", "name": "Sprint 1", "status": "active", "start_date": "...", "end_date": "...", "goal": "...", "created_at": "..." } ],
    "tickets":  [ { "id": 12, "key": "PROJ-12", "project_key": "PROJ", "sprint_id": 3, "parent_key": null, "title": "...", "type": "story", "status": "todo", "priority": "high", "story_points": 5, "epic_name": null, "epic_color": null, "acceptance_criteria": "...", "steps_to_reproduce": null, "environment": null, "assignee_email": "jane@acme.com", "reporter_email": "john@acme.com", "description": "...", "created_at": "...", "updated_at": "..." } ],
    "comments": [ { "id": 1, "ticket_id": 12, "ticket_key": "PROJ-12", "author_email": "jane@acme.com", "content": "...", "parent_comment_id": null, "created_at": "...", "edited_at": null } ]
  }
  ```
- `format=xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, filename `rai-export-<slug>-<YYYY-MM-DD>.xlsx`. One worksheet per entity (Members / Projects / Sprints / Tickets / Comments) with a bold header row.

**403 — not owner/admin**
```json
{ "success": false, "data": {}, "error": "Only owners and admins can export organization data" }
```

**404 — org not found** (`Organization not found`) · **500 — error** (`Could not export organization data`)

## Notes
- Export-only in v2. Data **import** is parked (v3, see `Guide/upgrades.md` § Org-level data import).
- Excel generated with `exceljs`.
