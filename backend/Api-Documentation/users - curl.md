# Get User Tickets — curl

```bash
curl {{base_url}}/api/v1/users/USER_ID/tickets \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Swap `USER_ID` for the target user's id. Org context comes from the `X-Org-Id` header.
