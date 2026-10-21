# Create Org

`POST /api/v1/orgs`

Creates a new organization with the caller as owner. Also best-effort sets it as the caller's current org in Cognito (`mustRefreshToken` flags that the client should refresh its token).

## Request
- Auth required.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | trimmed, 2-100 characters |
| `slug` | yes | 2-50 lowercase letters/numbers/hyphens, must start with a letter |

## Responses

**201 — created**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "018f...",
      "name": "Acme Inc",
      "slug": "acme",
      "subscription_status": "trial",
      "discoverable": true,
      "created_by": "c3d4...",
      "created_at": "2026-06-02T14:00:00.000Z",
      "updated_at": "2026-06-02T14:00:00.000Z"
    },
    "mustRefreshToken": true
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Org name is required" }
```
Other 400s: `Org name must be 2-100 characters`, `Org identifier must be 2-50 lowercase letters, numbers, or hyphens, starting with a letter`.

**409 — slug taken**
```json
{ "success": false, "data": {}, "error": "Org identifier is already taken" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not create organization" }
```
