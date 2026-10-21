# Restore Org

`POST /api/v1/orgs/:id/restore`

Owner-only. Restores a soft-deleted org while it's still inside the 30-day recovery window (clears `deleted_at`, the org reappears everywhere). Counterpart to [`DELETE /api/v1/orgs/:id`](./delete%20-%20docs.md). List restorable orgs with [`GET /api/v1/orgs/deleted`](./deleted%20-%20docs.md).

## Request
- Auth required. Caller must be the org owner. (Ownership is read from the surviving membership rows, so this works even though the org is hidden everywhere else.)
- Path: `:id` — org id
- No body.

## Responses

**200 — restored** (returns the live org row)
```json
{
  "success": true,
  "data": {
    "org": {
      "id": "018f-org-id",
      "name": "Acme Corp",
      "slug": "acme",
      "subscription_status": "trial",
      "discoverable": true,
      "created_by": "018f-user-id",
      "created_at": "2026-05-01T10:00:00.000Z",
      "updated_at": "2026-06-08T12:00:00.000Z"
    }
  },
  "error": ""
}
```

**403 — not owner**
```json
{ "success": false, "data": {}, "error": "Only the owner can restore this organization" }
```

**404 — not in the recycle bin** (never deleted, or already restored)
```json
{ "success": false, "data": {}, "error": "Organization is not in the recycle bin" }
```

**410 — recovery window expired** (deleted >30 days ago, awaiting purge)
```json
{ "success": false, "data": {}, "error": "This organization is past its 30-day recovery window and can no longer be restored" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not restore organization" }
```
