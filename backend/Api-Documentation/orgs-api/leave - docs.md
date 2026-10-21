# Leave Org

`POST /api/v1/orgs/:id/leave`

Removes the caller from the org. Owners cannot leave directly — they must transfer ownership first.

## Request
- Auth required. Caller must be a non-owner member.
- Path: `:id` — org id
- No body.

## Responses

**200 — left**
```json
{ "success": true, "data": {}, "error": "" }
```

**403 — owner**
```json
{ "success": false, "data": {}, "error": "Owners cannot leave - transfer ownership to another member first" }
```

**404 — not a member** (one of these messages)
```json
{ "success": false, "data": {}, "error": "You are not a member of this organization" }
```
Other 404s: `Membership not found`.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not leave organization" }
```
