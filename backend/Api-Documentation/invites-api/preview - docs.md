# Preview Invite

`GET /api/v1/invites/preview/:token`

Public, no auth. Returns the public-safe invite details (org name, role, invited email, lifecycle state) for the "Join \<org\>?" confirm card before the user signs in.

## Request
- Public — no token required.
- Path: `:token` — the invite token from the accept link

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "org_name": "Acme Corp",
    "role": "user",
    "invited_email": "newhire@acme.com",
    "state": "pending",
    "expires_at": "2026-06-09T14:00:00.000Z"
  },
  "error": ""
}
```
`state` is one of `pending` \| `used` \| `revoked` \| `expired`.

**400 — token missing**
```json
{ "success": false, "data": {}, "error": "Token is required" }
```

**404 — not found** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Invite link is invalid" }
```
Other 404: `Organization no longer exists`.
