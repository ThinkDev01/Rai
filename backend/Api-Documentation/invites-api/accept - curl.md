# Accept Invite — curl

```bash
curl -X POST "{{base_url}}/api/v1/invites/accept" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<invite-token-from-the-link>"
  }'
```
