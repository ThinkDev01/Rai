# Delete Comment

`DELETE /api/v1/projects/:id/tickets/:ticketId/comments/:commentId`

Deletes a comment. Allowed for the comment author, the ticket reporter, the ticket assignee, or an org owner/admin. Returns empty data.

## Request
- Auth required.
- Path:
  - `:id` — project id (number)
  - `:ticketId` — ticket id (number)
  - `:commentId` — comment id (number)

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

**403 — not allowed to delete**
```json
{ "success": false, "data": {}, "error": "Only the comment author, ticket reporter, ticket assignee, or an org admin can delete this comment" }
```

**404 — project not found** (`Project not found`) · **404 — comment not found** (`Comment not found`) · **404 — ticket not found** (`Ticket not found`)

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not delete comment" }
```
