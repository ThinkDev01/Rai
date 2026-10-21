# Delete Org — curl

```bash
curl -X DELETE "{{base_url}}/api/v1/orgs/018f-org-id" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "otpCode": "123456" }'
```
