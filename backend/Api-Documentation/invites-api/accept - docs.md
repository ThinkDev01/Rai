# Accept Invite

`POST /api/v1/invites/accept`

Accepts an invite for the logged-in user. The invite's email must match the caller's email. On success the new org is set as current in Cognito.

## Request
- Auth required. Caller's email must match the invite's `invited_email`.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `token` | yes | the invite token from the accept link |

## Responses

**200 — accepted**
```json
{
  "success": true,
  "data": {
    "org": { "id": "1", "name": "Acme Corp", "slug": "acme" },
    "mustRefreshToken": true
  },
  "error": ""
}
```
`mustRefreshToken` is `true` when the org was set as current in Cognito (frontend should refresh the token). It is `false` if that best-effort step failed, or if the org row vanished after commit (in which case `org` is `{ "id": "<orgId>", "name": "", "slug": "" }`).

**400 — missing token**
```json
{ "success": false, "data": {}, "error": "Invite token is required" }
```

**404 — invalid link**
```json
{ "success": false, "data": {}, "error": "Invite link is invalid" }
```

**403 — wrong account**
```json
{ "success": false, "data": {}, "error": "This invite was sent to newhire@acme.com. Sign in with that email to accept." }
```

**410 — invite no longer usable** (one of these messages)
```json
{ "success": false, "data": {}, "error": "This invite has already been used" }
```
Other 410: `This invite has been revoked - ask for a new one`, `This invite has expired - ask for a new one`.

**500 — server error**
```json
{ "success": false, "data": {}, "error": "Could not accept invite" }
```
