# Update Org

`PATCH /api/v1/orgs/:id`

Updates org settings. Supports `name` (owner + admin) and `discoverable` (owner only). At least one field required. Slug is locked in v2.

## Request
- Auth required.
- Path: `:id` — org id
- Body (JSON), at least one of:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | no | string, trimmed 2-100 characters; owner + admin only |
| `discoverable` | no | boolean; owner only |

## Responses

**200 — updated**
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "018f...",
      "name": "Acme Inc",
      "slug": "acme",
      "subscription_status": "active",
      "discoverable": false,
      "created_by": "c3d4...",
      "created_at": "2026-06-02T14:00:00.000Z",
      "updated_at": "2026-06-02T15:30:00.000Z"
    }
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "No editable fields provided" }
```
Other 400s: `Org name must be a string`, `Org name must be 2-100 characters`, `discoverable must be a boolean`.

**403 — no permission** (one of these messages)
```json
{ "success": false, "data": {}, "error": "You do not have permission to edit this organization" }
```
Other 403s: `Only owners and admins can rename the organization`, `Only the owner can change discoverability`.

**404 — not found**
```json
{ "success": false, "data": {}, "error": "Organization not found" }
```

**500 — server/db error** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Could not update organization" }
```
Other 500s: `Could not verify permission`, `Could not update discoverability`, `No updates applied`.
