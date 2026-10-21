# Unread Count

`GET /api/v1/notifications/unread-count`

Lightweight count of the current user's unread notifications — used for the bell badge poll. User-scoped; no `X-Org-Id` needed.

## Request
- Auth required. No params.

## Responses

**200 — OK**
```json
{ "success": true, "data": { "count": 4 }, "error": "" }
```

**401 — auth**
```json
{ "success": false, "data": {}, "error": "Authentication required" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load unread count" }
```
