# List Deleted Orgs (recycle bin)

`GET /api/v1/orgs/deleted`

The caller's **recently deleted** orgs — soft-deleted, owned by the caller, and still inside the 30-day recovery window. Powers the "Recently deleted" restore list on the create-org / welcome screen. Only the **owner** of a deleted org sees it here; other former members just see it disappear.

Static path — registered before the `/:id` routes.

## Request
- Auth required.
- No path params, no body.

## Responses

**200 — list** (`restore_until` = `deleted_at` + 30 days, for the "X days left" countdown; empty array is the normal case)

The `subscription_status` / `trial_ends_at` / `current_period_end` fields are a **billing snapshot** — billing keeps running while an org is soft-deleted (v2 doesn't pause it), so the UI can show how much trial/subscription time is left before the owner restores. All three are `null` for an org with no live subscription row.
```json
{
  "success": true,
  "data": {
    "orgs": [
      {
        "id": "018f-org-id",
        "name": "Acme Corp",
        "slug": "acme",
        "deleted_at": "2026-06-08T12:00:00.000Z",
        "restore_until": "2026-07-08T12:00:00.000Z",
        "subscription_status": "trialing",
        "trial_ends_at": "2026-07-01T12:00:00.000Z",
        "current_period_end": null
      }
    ]
  },
  "error": ""
}
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not load deleted organizations" }
```
