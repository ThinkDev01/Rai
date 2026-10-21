# Submit Feedback

`POST /api/v1/feedback`

Stores one feedback submission (the in-app feedback modal) **and** emails it to
support. Auth only — **no org context required**, so it works from any page. The
caller's current org (if any) is attached automatically for context.

## Request
- Auth required (`Authorization: Bearer <token>`). No `X-Org-Id` needed.
- Rate limit: **5 / hour per IP** (each submit writes a row + sends an email).
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | 1–150 chars |
| `body`  | yes | 5–5000 chars |

## Responses

**201 — submitted**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "Title is required (max 150 characters)" }
```
Other 400: `Please write a bit more (5-5000 characters)`.

**429 — rate limited** · **500 — db error** (`Could not submit feedback`).

> The support email is best-effort: if SES fails, the row is still saved and the
> request still returns 201 (the DB is the source of truth). Destination =
> destination = `SUPPORT_EMAIL` (default `support@rai.novetum.com`).
