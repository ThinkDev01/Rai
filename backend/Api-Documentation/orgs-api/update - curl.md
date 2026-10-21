# Update Org — curl

Rename (owner + admin):
```bash
curl -X PATCH "{{base_url}}/api/v1/orgs/018f-org-id" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Inc" }'
```

Toggle discoverability (owner only):
```bash
curl -X PATCH "{{base_url}}/api/v1/orgs/018f-org-id" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "discoverable": false }'
```
