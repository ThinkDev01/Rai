# Pin / Unpin Ticket — curl

Pin a ticket (top 3 per org — use the numeric ticket id, not the key):
```bash
curl -X PUT "{{base_url}}/api/v1/me/pins/tickets/13" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Unpin it:
```bash
curl -X DELETE "{{base_url}}/api/v1/me/pins/tickets/13" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Read the `ticket.isPinned` flag back from My Work:
```bash
curl "{{base_url}}/api/v1/me/tickets" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```
