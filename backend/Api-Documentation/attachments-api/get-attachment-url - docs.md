# Get Attachment URL (refresh)

`GET /api/v1/attachments/:id/url`

Regenerates a **fresh presigned GET URL** (+ a separate download URL served with `Content-Disposition: attachment`) for one **confirmed** attachment. The URLs baked into read payloads (ticket detail, comments) are only valid for the presign TTL — 15 minutes by default — so a page left open longer than that hits an expired link (S3 returns an XML "request has expired" error on preview/download). This endpoint lets the client re-mint both URLs right before the user opens the preview or hits Download, so no URL ever sits more than a moment past expiry.

Confirmed rows only: a `pending` (never-confirmed) attachment returns `404` here — the cleanup job owns those.

## Request
- Auth required + `X-Org-Id` header (org context, re-validated against membership).
- No body. `:id` is the attachment UUID (the `id` from the `Attachment` payload).

## Responses

**200 — fresh URLs**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.ap-south-2.amazonaws.com/.../attachments/...?X-Amz-...",
    "downloadUrl": "https://s3.ap-south-2.amazonaws.com/.../attachments/...?X-Amz-..."
  },
  "error": ""
}
```
`url` = preview link. `downloadUrl` = same object served with `Content-Disposition: attachment` (the Download button uses it).

**404 — not found / pending**
```json
{ "success": false, "data": {}, "error": "Attachment not found" }
```

**500 — storage not configured**
```json
{ "success": false, "data": {}, "error": "Storage is not configured" }
```

## Notes
- Fresh URL TTL is the same as any presign (15 min default, `S3_PRESIGN_EXPIRES` overrides) — refresh again on the next open.
- The frontend calls this automatically on every preview-open (`PersistedAttachmentList`) and falls back to the payload's URL if the refresh fails.
