# Delete Project — curl

```bash
curl -X DELETE "{{base_url}}/api/v1/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "otpCode": "123456" }'
```
