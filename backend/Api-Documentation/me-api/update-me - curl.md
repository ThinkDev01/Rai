# Update Me — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/me" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Jane Doe" }'
```
