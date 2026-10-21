# Delete Project

`DELETE /api/v1/projects/:id`

Permanently deletes a project and cascades to all its children (sprints, tickets, comments, memberships). **OTP-gated** — the caller first requests a code via [`POST /api/v1/otp/request`](../otp-api/request%20-%20docs.md) (`action: "delete_project"`, `targetId: <project id>`), then passes it as `otpCode`.

## Request
- Auth required. Role: `owner` | `admin` only.
- Path: `:id` — project id (number)
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `otpCode` | yes | 6-digit code from `POST /api/v1/otp/request` (action `delete_project`, target = this project id) |

## Responses

**200 — deleted**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — invalid id or missing code** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Invalid project id" }
```
Other 400s: `A 6-digit verification code is required`.

**401 — OTP rejected** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Incorrect verification code" }
```
Other 401s: `Your verification code has expired — request a new one`, `Too many incorrect attempts — request a new code`, `No active code — request a verification code first`.

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Project not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not delete project" }
```
