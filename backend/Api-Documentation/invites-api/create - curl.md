# Create Invite — curl

```bash
curl -X POST "{{base_url}}/api/v1/orgs/1/invites" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newhire@acme.com",
    "role": "user"
  }'
```
