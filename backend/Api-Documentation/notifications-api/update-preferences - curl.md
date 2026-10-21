# Update Notification Preference — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/notifications/preferences" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "type": "ticket_comment_new", "channel": "email", "enabled": false }'
```
