# My Tickets — curl

```bash
curl "{{base_url}}/api/v1/me/tickets" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Org context comes from the `X-Org-Id` header.
