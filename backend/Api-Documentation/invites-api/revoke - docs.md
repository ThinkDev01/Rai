# Revoke Invite

`POST /api/v1/invites/:id/revoke`

Revokes a pending invite. Caller's role is checked against the invite's own org.

## Request
- Auth required. Caller must be `owner`, `admin`, or `project_manager` in the invite's org.
- Path: `:id` — invite id

## Responses

**200 — revoked**
```json
{ "success": true, "data": {}, "error": "" }
```

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Invite not found" }
```

**403 — no permission**
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```

**500 — server error**
```json
{ "success": false, "data": {}, "error": "Could not revoke invite" }
```
