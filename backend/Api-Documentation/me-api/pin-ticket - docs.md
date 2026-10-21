# Pin / Unpin Ticket

`PUT /api/v1/me/pins/tickets/:id` · `DELETE /api/v1/me/pins/tickets/:id`

Toggle the caller's **personal** pin on a ticket. Pins are per-user, per-org quick-access — the My Work page surfaces pinned tickets in a dedicated **Pinned** section at the top. A user may pin **up to 3 tickets per org**. The pin flag is read back as `ticket.isPinned` on each item of `GET /api/v1/me/tickets`.

## Request
- Auth required. **Org context required** via the `X-Org-Id` header — 403 otherwise.
- `:id` = ticket id (integer, the numeric `ticket.id` — not the `PROJ-12` key). Body: none.

## Responses

**200 — pinned** (`PUT`)
```json
{ "success": true, "data": { "pinned": true }, "error": "" }
```
Idempotent: pinning an already-pinned ticket returns 200 without consuming a slot.

**200 — unpinned** (`DELETE`)
```json
{ "success": true, "data": { "pinned": false }, "error": "" }
```
Idempotent: unpinning a ticket that wasn't pinned still returns 200.

**400 — bad id** (`Invalid ticket id`)

**404 — not found** (`PUT` only — ticket doesn't exist in this org)
```json
{ "success": false, "data": {}, "error": "ticket not found" }
```

**422 — pin limit reached** (`PUT` only)
```json
{ "success": false, "data": {}, "error": "You can pin up to 3 tickets. Unpin one first." }
```

**401 — auth** · **403 — no org context** · **500 — db error** (`Could not pin ticket` / `Could not unpin ticket`)
