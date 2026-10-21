# Unregister Device (push)

`DELETE /api/v1/devices`

Removes a device token so the user stops receiving push on that device. The app calls this on **logout** (or when the user disables push in settings). Only the caller's own token is removed.

Not strictly required for uninstalls — the backend prunes tokens that FCM reports as dead on the next send — but calling it on an explicit logout is the clean path.

## Request
- Auth required (`authMiddleware` only). No `X-Org-Id` header.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `token` | yes | the FCM registration token to remove |

## Responses

**200 — done** (`removed` is `false` if the token wasn't registered to this user)
```json
{ "success": true, "data": { "removed": true }, "error": "" }
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "A device token is required" }
```

**500 — DB error**
```json
{ "success": false, "data": {}, "error": "Could not unregister device" }
```
