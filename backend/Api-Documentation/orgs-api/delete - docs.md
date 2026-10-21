# Delete Org

`DELETE /api/v1/orgs/:id`

Owner-only **soft delete** (recycle bin). Stamps `deleted_at` instead of wiping the row, so the org and all its data vanish from the app immediately but stay recoverable for **30 days** via [`POST /api/v1/orgs/:id/restore`](./restore%20-%20docs.md). A purge job hard-deletes (CASCADE) orgs past the window. Idempotent — deleting an already-deleted org returns 404. **OTP-gated** — the caller first requests a code via [`POST /api/v1/otp/request`](../otp-api/request%20-%20docs.md) (`action: "delete_org"`, `targetId: <org id>`), then passes it as `otpCode`.

## Request
- Auth required. Caller must be the org owner.
- Path: `:id` — org id
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `otpCode` | yes | 6-digit code from `POST /api/v1/otp/request` (action `delete_org`, target = this org id) |

## Responses

**200 — soft-deleted** (`restoreWindowDays` tells the client how long it stays recoverable)
```json
{ "success": true, "data": { "restoreWindowDays": 30 }, "error": "" }
```

**400 — missing/invalid code**
```json
{ "success": false, "data": {}, "error": "A 6-digit verification code is required" }
```

**401 — OTP rejected** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Incorrect verification code" }
```
Other 401s: `Your verification code has expired — request a new one`, `Too many incorrect attempts — request a new code`, `No active code — request a verification code first`.

**403 — not owner** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```
Other 403s: `Only the owner can delete this organization`.

**404 — not found or already deleted**
```json
{ "success": false, "data": {}, "error": "Organization not found" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not delete organization" }
```
