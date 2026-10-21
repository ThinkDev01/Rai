# Get Attachment URL — curl

```bash
curl "{{base_url}}/api/v1/attachments/{{attachment_id}}/url" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Call right before opening the preview / Download on a persisted attachment to get URLs that can't have expired — the ones in the read payload die after 15 minutes. Replace the `{{attachment_id}}` with the `id` from the ticket/comment `Attachment` payload. Confirmed rows only; `pending` rows return 404.
