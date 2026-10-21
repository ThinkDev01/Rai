# List Notifications — curl

```bash
curl "{{base_url}}/api/v1/notifications?limit=20" \
  -H "Authorization: Bearer {{token}}"
```

Next page (keyset):
```bash
curl "{{base_url}}/api/v1/notifications?limit=20&before=401" \
  -H "Authorization: Bearer {{token}}"
```
