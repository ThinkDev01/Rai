# Request Action OTP

`POST /api/v1/otp/request`

Mints a single-use, 6-digit verification code for a **sensitive action** and emails it to the caller's own verified address. The code is required to execute the action on its own endpoint (delete org / transfer ownership / delete project), which re-verifies it.

The code is bound to the `(caller, action, targetId)` triple — a code minted for one org/project can't authorize another, and a code for `delete_org` can't be replayed on `transfer_ownership`. Requesting a new code for the same triple silently retires the previous one. Codes expire after **10 minutes** and are burned after **3 wrong attempts**.

This endpoint does **not** check whether the caller is allowed to perform the action — that gate lives on the execution endpoint (role + code). Worst case, a user mints a code for something they can't do; it's useless without passing the action endpoint's own authorization.

## Request
- Auth required. The code always goes to `req.user.email` (no recipient field).
- No org header needed (`authMiddleware` only).
- Rate limit: **5 requests / 10 min per IP** (each send is a real email).
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `action` | yes | one of `delete_org`, `transfer_ownership`, `delete_project` |
| `targetId` | yes | the entity the action targets — org id or project id (string) |

## Responses

**200 — code emailed**
```json
{ "success": true, "data": {}, "error": "" }
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Unknown action" }
```
Other 400s: `targetId is required`.

**429 — rate limited**
```json
{ "success": false, "data": {}, "error": "Too many code requests — please wait a few minutes" }
```

**500 — email send failed**
```json
{ "success": false, "data": {}, "error": "Could not send the verification code — please try again" }
```
