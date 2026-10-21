# List Notifications

`GET /api/v1/notifications`

The current user's notification feed (the bell/inbox), newest first. **User-scoped, not org-scoped** — one cross-org feed; no `X-Org-Id` header needed. Each row carries its org slug so the client can build the deep-link.

## Request
- Auth required.
- Query params (optional):
  - `limit` — page size, 1–50 (default 20).
  - `before` — return rows with `id <` this value (keyset pagination; pass the previous page's `nextBefore`).

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 412,
        "type": "ticket_assigned",
        "title": "Jane Doe assigned you Fix login redirect",
        "link": "/projects/3/tickets/87",
        "read_at": null,
        "created_at": "2026-06-08T10:12:00.000Z",
        "org_id": "8f2a...",
        "org_slug": "acme",
        "org_name": "Acme Corp"
      }
    ],
    "unreadCount": 4,
    "nextBefore": 401
  },
  "error": ""
}
```
- `link` is relative to the org — build the full path as `/orgs/{org_slug}{link}`. May be `null` (non-navigable notice).
- `read_at` is `null` until read.
- `nextBefore` is the `id` to pass as `before` for the next page, or `null` when there are no more rows.

**401 — auth**
```json
{ "success": false, "data": {}, "error": "Authentication required" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load notifications" }
```
