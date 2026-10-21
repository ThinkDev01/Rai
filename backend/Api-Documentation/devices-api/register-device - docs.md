# Register Device (push)

`POST /api/v1/devices`

Registers (or refreshes) a mobile **FCM device token** so the user receives push notifications on that device. The mobile app calls this on login and whenever Firebase issues/rotates its token.

The token is globally unique: re-registering an existing token simply moves it to the current user and refreshes its `last_seen_at` (handles a shared device / re-login cleanly). Dead tokens are pruned automatically by the backend when FCM reports them on a later send — the app does not need to clean up after an uninstall.

Push mirrors the in-app feed: every notification that writes a bell row also fans out to the user's registered devices. It is a no-op (silently skipped) until the backend has `FIREBASE_SERVICE_ACCOUNT` configured.

## Request
- Auth required (`authMiddleware` only). The device belongs to the **user**, not an org — no `X-Org-Id` header.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `token` | yes | the FCM registration token from the app (1–4096 chars) |
| `platform` | yes | one of `ios`, `android`, `web` |

## Responses

**200 — registered**
```json
{ "success": true, "data": { "registered": true }, "error": "" }
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "A valid device token is required" }
```
Other 400: `platform must be one of: ios, android, web`.

**500 — DB error**
```json
{ "success": false, "data": {}, "error": "Could not register device" }
```
