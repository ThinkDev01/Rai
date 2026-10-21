# Search Tickets — curl

```bash
curl "{{base_url}}/api/v1/search?q=login" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

`q` must be at least 2 characters. Org context comes from the `X-Org-Id` header.
