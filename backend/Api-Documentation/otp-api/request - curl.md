# Request Action OTP — curl

```bash
curl -X POST "{{base_url}}/api/v1/otp/request" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "action": "delete_org", "targetId": "018f-org-id" }'
```

The 6-digit code is emailed to your own address. Pass it back as `otpCode` on the matching action endpoint (e.g. `DELETE /api/v1/orgs/:id`).
