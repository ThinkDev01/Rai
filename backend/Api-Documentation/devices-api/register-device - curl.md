# Register Device — curl

```bash
curl -X POST "{{base_url}}/api/v1/devices" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "token": "{{fcm_device_token}}", "platform": "android" }'
```

Call on login and on every FCM token refresh. Registering the same token again is safe — it just refreshes the record.
