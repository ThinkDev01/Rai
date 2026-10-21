# Transfer Ownership

`POST /api/v1/orgs/:id/transfer-ownership`

Atomically transfers ownership: the current owner is demoted to admin and the recipient is promoted to owner. Only the current owner can call. **OTP-gated** — the caller first requests a code via [`POST /api/v1/otp/request`](../otp-api/request%20-%20docs.md) (`action: "transfer_ownership"`, `targetId: <org id>`), then passes it as `otpCode`.

## Request
- Auth required. Caller must be the current owner.
- Path: `:id` — org id
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `recipientId` | yes | user id of an existing member; cannot be the caller |
| `otpCode` | yes | 6-digit code from `POST /api/v1/otp/request` (action `transfer_ownership`, target = this org id) |

## Responses

**200 — transferred**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "recipientId is required" }
```
Other 400s: `You are already the owner`, `A 6-digit verification code is required`.

**401 — OTP rejected** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Incorrect verification code" }
```
Other 401s: `Your verification code has expired — request a new one`, `Too many incorrect attempts — request a new code`, `No active code — request a verification code first`.

**403 — not owner**
```json
{ "success": false, "data": {}, "error": "Only the current owner can transfer ownership" }
```

**404 — recipient not a member**
```json
{ "success": false, "data": {}, "error": "Recipient is not a member of this organization" }
```

**409 — conflict** (one of these messages — raced state)
```json
{ "success": false, "data": {}, "error": "caller is no longer owner" }
```
Other 409s: `recipient is not a member of this org`, `recipient is already the owner`.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not transfer ownership" }
```
