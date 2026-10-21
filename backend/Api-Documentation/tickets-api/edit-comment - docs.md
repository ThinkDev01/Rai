# Edit Comment

`PATCH /api/v1/projects/:id/tickets/:ticketId/comments/:commentId`

Edits a comment's body. **Author-only** — only the user who wrote the comment may edit it (org admins moderate by deleting, not rewriting). Content-only: threading (`parentCommentId`) and authorship are immutable. Project must not be archived. Sets `editedAt`, which the UI renders as an "edited &lt;time&gt;" label.

## Request
- Auth required. Project must not be archived.
- Path:
  - `:id` — project id (number)
  - `:ticketId` — ticket id (number)
  - `:commentId` — comment id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `content` | yes | non-empty text — the new body |

## Responses

**200 — updated** (the full comment, same shape as add-comment, now with `editedAt` set)
```json
{
  "success": true,
  "data": {
    "id": "8",
    "content": "Reproduced on staging — also on prod.",
    "author": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
    "parentCommentId": null,
    "createdAt": "2026-06-02T14:00:00.000Z",
    "editedAt": "2026-06-08T09:30:00.000Z"
  },
  "error": ""
}
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "Comment content is required" }
```
Also `Invalid id`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "You do not have access to this project" }
```
Also `Cannot edit comments in an archived project`.

**403 — not the author**
```json
{ "success": false, "data": {}, "error": "Only the comment author can edit this comment" }
```

**404 — project not found** (`Project not found`) · **404 — comment not found** (`Comment not found`)

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not update comment" }
```
