# Create Project — curl

```bash
curl -X POST "{{base_url}}/api/v1/projects" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rai Platform",
    "key": "RAI",
    "visibility": "public",
    "description": "Core product work",
    "avatarType": "icon",
    "avatarValue": "rocket"
  }'
```

Minimal (only required fields):
```bash
curl -X POST "{{base_url}}/api/v1/projects" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Rai Platform", "key": "RAI", "visibility": "private" }'
```
