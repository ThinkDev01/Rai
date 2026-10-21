# Create Org — curl

```bash
curl -X POST "{{base_url}}/api/v1/orgs" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Inc",
    "slug": "acme"
  }'
```
