# List Projects

`GET /api/v1/projects`

Lists projects in the caller's current org as lightweight summaries. Visibility rules apply (private projects only show to members).

## Request
- Auth required. Any org member.
- No path params, no query params, no body.

## Responses

**200 — OK** (array of project summaries)
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "Rai Platform",
      "key": "RAI",
      "description": "Core product work",
      "archived": false,
      "visibility": "public",
      "ticketCount": 42,
      "memberCount": 8,
      "activeSprintName": "Sprint 7",
      "lastActive": "2026-06-02T14:00:00.000Z",
      "createdAt": "2026-01-10T09:00:00.000Z",
      "isPinned": false
    }
  ],
  "error": ""
}
```
`activeSprintName` is `null` when no sprint is active. `isPinned` reflects the **caller's** personal pin (toggle via `PUT`/`DELETE /me/pins/projects/:id`, max 3 per org); the projects page floats pinned projects to the top.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load projects" }
```
