# Update Notification Preference

`PATCH /api/v1/notifications/preferences`

Turns the **email** channel on/off for one notification type for the current user. In-app delivery is not configurable in v2.

## Request
- Auth required.
- Body:
```json
{ "type": "ticket_comment_new", "channel": "email", "enabled": false }
```
- `type` — a known notification type (see Get Preferences).
- `channel` — must be `"email"` (only configurable channel in v2).
- `enabled` — boolean.

## Responses

**200 — OK**
```json
{ "success": true, "data": { "type": "ticket_comment_new", "channel": "email", "enabled": false }, "error": "" }
```

**400 — validation** (one of)
```json
{ "success": false, "data": {}, "error": "Unknown notification type" }
```
Others: `Only the email channel is configurable`, `enabled must be a boolean`, `This notification is required and cannot be turned off` (attempting to disable an `alwaysEmail` type).

**401 — auth** · **500 — db error** (`Could not save preference`)
