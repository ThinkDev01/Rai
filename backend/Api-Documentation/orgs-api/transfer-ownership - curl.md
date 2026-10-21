# Transfer Ownership — curl

```bash
curl -X POST "{{base_url}}/api/v1/orgs/018f-org-id/transfer-ownership" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "recipientId": "a1b2-user-id", "otpCode": "123456" }'
```
