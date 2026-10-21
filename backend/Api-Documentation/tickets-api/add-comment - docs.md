# Add Comment

`POST /api/v1/projects/:id/tickets/:ticketId/comments`

Adds a comment to a ticket. Optionally a reply to a root comment (single-level threading only). Project must not be archived.

## Request
- Auth required. Project must not be archived.
- Path:
  - `:id` — project id (number)
  - `:ticketId` — ticket id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `content` | yes | non-empty text |
| `parentCommentId` | no | numeric string of a **root** comment on this ticket; makes this a reply. Empty / null / omitted = root comment |

## Responses

**201 — created** (comment)
```json
{
  "success": true,
  "data": {
    "id": "8",
    "content": "Reproduced on staging.",
    "author": { "id": "a1b2...", "name": "Jane Doe", "email": "jane@acme.com", "role_type": "user", "role_name": "Member", "initials": "JD" },
    "parentCommentId": null,
    "createdAt": "2026-06-02T14:00:00.000Z",
    "editedAt": null
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Comment content is required" }
```
Other 400s: `Invalid id`, `parentCommentId must be a string when provided`, `parentCommentId must be a numeric string`, `Reply target comment not found on this ticket`, `Cannot reply to a reply — pick the original comment in the thread`.

**403 — no access / archived**
```json
{ "success": false, "data": {}, "error": "Cannot comment on tickets in an archived project" }
```
Also `You do not have access to this project`.

**404 — project not found** (`Project not found`) · **404 — ticket not found** (`Ticket not found`)

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not add comment" }
```
