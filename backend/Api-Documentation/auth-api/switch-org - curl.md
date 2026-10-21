# Switch Org — curl

```bash
curl -X POST "{{base_url}}/api/v1/auth/switch-org" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "orgId": "<target-org-id>" }'
```
