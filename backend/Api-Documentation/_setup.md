# API Documentation — Setup

How to read and use these files.

## The values you set

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{{base_url}}` | API host + port | `http://localhost:4000` |
| `{{token}}` | Cognito token (ID/access token of the logged-in user) | `<token>` |
| `{{org_id}}` | Active org id — sent as the `X-Org-Id` header on org-scoped routes | `<org_id>` |

Every `* - curl.md` file uses these placeholders and nothing else machine-specific. Set them once, paste, run. (`{{org_id}}` only appears on org-scoped routes — see Conventions below.)

## In Postman
1. Create an Environment (e.g. **Rai local**).
2. Add three variables: `base_url`, `token`, and `org_id`.
3. Import a curl snippet: **Import → Raw text →** paste the curl block → **Send**.
4. Postman fills `{{base_url}}`, `{{token}}`, and `{{org_id}}` from the active environment.

## In a terminal
```bash
export BASE_URL=http://localhost:4000
export TOKEN=<token>        # paste a real Cognito token
export ORG_ID=<org_id>      # the org you're acting in (org-scoped routes)
```
Then in the curl, swap `{{base_url}}` → `$BASE_URL`, `{{token}}` → `$TOKEN`, and `{{org_id}}` → `$ORG_ID`.

## Where the token comes from
v2 auth is **AWS Cognito**. Log in through the frontend, then copy the access token (browser devtools → Application/Storage, or the Network tab on a `/me` call). Paste it as `token`.

## Conventions used everywhere
- **Response envelope** — every response is `{ "success": bool, "data": ..., "error": "" }`.
- **Org context** — org-scoped routes need an **`X-Org-Id: {{org_id}}`** header naming the org you're acting in; it's re-validated against your membership on every call. Routes like health, auth, and `/me` (profile) need no org; `orgs/*` and `invites/*` take the org from the URL path instead.
- **Auth header** — protected routes need `Authorization: Bearer {{token}}`. Files note when a route is public.

## HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Not authenticated (missing/invalid token) |
| 403 | Authenticated but not allowed (role / access / archived) |
| 404 | Resource not found |
| 409 | Conflict (e.g. slug taken, sprint already active) |
| 410 | Gone (invite used / revoked / expired) |
| 429 | Rate limit exceeded |
| 500 | Server error |
| 502 | Upstream failure (e.g. SES email send) |

## Rate limiting
1500 requests per 15 minutes per IP (~100/min). Over the limit returns **429**:
```json
{ "success": false, "data": {}, "error": "Too many requests - please try again in 15 minutes" }
```
