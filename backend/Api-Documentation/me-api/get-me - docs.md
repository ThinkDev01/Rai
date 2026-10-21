# Get Me

`GET /api/v1/me`

Current user profile plus all org memberships. No org context required.

## Request
- Auth required. No path/query params.

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "c3d4e5f6-...",
      "email": "jane@acme.com",
      "emailVerified": true,
      "name": "Jane Doe",
      "currentOrgId": "8f2a..."
    },
    "memberships": [
      {
        "org_id": "8f2a...",
        "org_name": "Acme Corp",
        "org_slug": "acme",
        "subscription_status": "active",
        "discoverable": true,
        "role": "admin",
        "role_label": "Admin"
      }
    ]
  },
  "error": ""
}
```
`name` and `currentOrgId` may be `null`. `memberships` is `[]` when the user belongs to no org. `subscription_status` is `trial` \| `active` \| `suspended` \| `cancelled`; `role` is `owner` \| `admin` \| `project_manager` \| `user`; `role_label` may be `null`.

**401 — auth** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Authentication required" }
```
Other 401s: `Invalid or expired token`, `Token missing email claim`.

**500 — auth sync / db error** (`Auth sync failed`, `Auth link failed`)
