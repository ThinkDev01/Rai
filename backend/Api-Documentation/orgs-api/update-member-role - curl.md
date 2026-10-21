# Update Member Role — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/orgs/018f-org-id/members/a1b2-user-id" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "role_type": "admin",
    "role_name": "Lead"
  }'
```

Rename label only:
```bash
curl -X PATCH "{{base_url}}/api/v1/orgs/018f-org-id/members/a1b2-user-id" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "role_name": "Lead" }'
```
