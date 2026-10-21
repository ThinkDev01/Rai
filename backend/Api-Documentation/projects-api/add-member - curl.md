# Add Project Member — curl

```bash
curl -X POST "{{base_url}}/api/v1/projects/1/members" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "<org-member-user-id>" }'
```
