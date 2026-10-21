# Mark Notification Read

`POST /api/v1/notifications/:id/read`

Marks a single notification (owned by the current user) as read. Idempotent — already-read or unknown ids return `changed: false`.

## Request
- Auth required.
- Path param: `id` — the notification id (positive integer).

## Responses

**200 — OK**
```json
{ "success": true, "data": { "changed": true }, "error": "" }
```
`changed` is `false` if the notification was already read or not found for this user.

**400 — invalid id**
```json
{ "success": false, "data": {}, "error": "Invalid notification id" }
```

**401 — auth** · **500 — db error** (`Could not update notification`)
