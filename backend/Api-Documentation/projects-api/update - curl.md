# Update Project — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rai Platform (renamed)",
    "description": "Core product work",
    "visibility": "private"
  }'
```

Set a preset icon avatar (send the pair):
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "avatarType": "icon", "avatarValue": "rocket" }'
```

Reset to the default key-letter avatar:
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "avatarType": "initials" }'
```

Unarchive (only allowed change while archived):
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "archived": false }'
```
