# Mark All Read

`POST /api/v1/notifications/read-all`

Marks every unread notification for the current user as read. Returns how many rows were updated.

## Request
- Auth required. No body.

## Responses

**200 — OK**
```json
{ "success": true, "data": { "updated": 4 }, "error": "" }
```

**401 — auth** · **500 — db error** (`Could not update notifications`)
