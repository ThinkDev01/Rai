# Logout

`POST /api/v1/auth/logout`

Server-side logout. Revokes all of the user's refresh tokens via Cognito GlobalSignOut. The frontend must also clear its locally cached tokens.

## Request
- Auth required.
- No path params, query params, or body.

## Responses

**200 — logged out**
```json
{ "success": true, "data": {}, "error": "" }
```

**500 — Cognito GlobalSignOut failed**
```json
{ "success": false, "data": {}, "error": "Logout failed" }
```
