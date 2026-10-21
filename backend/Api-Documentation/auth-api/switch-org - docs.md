# Switch Org

`POST /api/v1/auth/switch-org`

Switches the user's **default** org by updating the Cognito `custom:current_org_id` attribute. That claim is the *fallback* org context — per-request context is normally set by the **`X-Org-Id`** header (the frontend derives it from the URL slug, so two tabs can sit in different orgs). Refresh the session after switching so the new claim is picked up where the header is absent (auth flows, welcome, invite accept).

## Request
- Auth required.
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `orgId` | yes | string; user must be a member of this org |

## Responses

**200 — switched** (`mustRefreshToken` tells the client to refresh tokens)
```json
{
  "success": true,
  "data": { "orgId": "org-123", "mustRefreshToken": true },
  "error": ""
}
```

**400 — validation**
```json
{ "success": false, "data": {}, "error": "orgId is required" }
```

**403 — not a member of the target org** (or the org was cancelled)
```json
{ "success": false, "data": {}, "error": "Not a member of the target organization" }
```

**500 — Cognito AdminUpdateUserAttributes failed**
```json
{ "success": false, "data": {}, "error": "Org switch failed" }
```
