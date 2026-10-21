# Remove Member

`DELETE /api/v1/orgs/:id/members/:userId`

Removes another member from the org. Owner/admin only. The owner can't be removed (transfer ownership first); use the leave flow to remove yourself.

## Request
- Auth required.
- Path: `:id` — org id · `:userId` — target member user id

## Responses

**200 — removed**
```json
{ "success": true, "data": {}, "error": "" }
```

**403 — forbidden** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```
Other 403s: `Only owners and admins can remove members`, `Use the Leave Organization flow to remove yourself`, `Owner cannot be removed - transfer ownership first`.

**404 — member not found**
```json
{ "success": false, "data": {}, "error": "Member not found in this org" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not remove member" }
```
