# Unregister Device — curl

```bash
curl -X DELETE "{{base_url}}/api/v1/devices" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "token": "{{fcm_device_token}}" }'
```

Call on logout / when the user turns push off.
