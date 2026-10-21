# List Org Members

`GET /api/v1/orgs/:id/members`

Lists every member of the org. Any member can view. Ordered owner → admin → project_manager → user, then by join date.

## Request
- Auth required. Caller must be a member of the org.
- Path: `:id` — org id

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "user_id": "c3d4...",
        "email": "owner@acme.com",
        "name": "John Smith",
        "role": "owner",
        "role_label": "Founder",
        "joined_at": "2026-05-01T10:00:00.000Z"
      }
    ]
  },
  "error": ""
}
```
`name` and `role_label` may be `null`.

**403 — not a member**
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```

**500 — server/db error** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Could not load members" }
```
Other 500s: `Could not verify org membership`.
