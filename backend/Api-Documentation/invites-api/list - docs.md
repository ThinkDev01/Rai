# List Pending Invites

`GET /api/v1/orgs/:id/invites`

Lists the org's pending (not used, not revoked, not expired) invites, newest first. Powers the Team page "Pending invites" list.

## Request
- Auth required. Caller must be `owner`, `admin`, or `project_manager` in the org.
- Path: `:id` — org id

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "invites": [
      {
        "id": "018f...",
        "invited_email": "newhire@acme.com",
        "role": "user",
        "invited_by_name": "Jane Doe",
        "invited_by_email": "jane@acme.com",
        "expires_at": "2026-06-09T14:00:00.000Z",
        "created_at": "2026-06-02T14:00:00.000Z"
      }
    ]
  },
  "error": ""
}
```
`invites` is `[]` when there are none. `invited_by_name` may be `null`.

**403 — no permission**
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```

**500 — server error**
```json
{ "success": false, "data": {}, "error": "Could not load pending invites" }
```
