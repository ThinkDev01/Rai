# Delete Ticket

`DELETE /api/v1/projects/:id/tickets/:ticketId`

Deletes a ticket. Comments and status history are cascade-cleaned. Returns empty data.

## Request
- Auth required.
- Path:
  - `:id` — project id (number)
  - `:ticketId` — ticket id (number)

## Responses

**200 — deleted**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — bad input**
```json
{ "success": false, "data": {}, "error": "Invalid id" }
```

**403 — no access to this project**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```

**404 — project not found** (`Project not found`) · **404 — ticket not found** (`Ticket not found`)

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not delete ticket" }
```
