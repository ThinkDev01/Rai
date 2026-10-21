# Update Me

`PATCH /api/v1/me`

Updates the caller's profile. Today: display name only. Returns the updated user.

## Request
- Auth required. No org context required.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | trimmed; 2–20 characters |

## Responses

**200 — updated**
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
    }
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Name is required" }
```
`Name is required` when `name` is missing or not a string. `Name must be 2-20 characters` when the trimmed length is out of bounds.

**401 — auth** (`Authentication required`, `Invalid or expired token`, `Token missing email claim`)

**500 — db error** (`Could not update profile`); also `Auth sync failed` / `Auth link failed` from the auth chain.
