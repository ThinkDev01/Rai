# Export Org Data — curl

JSON:
```bash
curl "{{base_url}}/api/v1/orgs/018f-org-id/export?format=json" \
  -H "Authorization: Bearer {{token}}" \
  -OJ
```

Excel (.xlsx):
```bash
curl "{{base_url}}/api/v1/orgs/018f-org-id/export?format=xlsx" \
  -H "Authorization: Bearer {{token}}" \
  -OJ
```

`-OJ` makes curl save the file using the server-provided filename (from `Content-Disposition`).
