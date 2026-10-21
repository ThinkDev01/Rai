# List Tickets — curl

```bash
# All tickets in a project
curl "{{base_url}}/api/v1/projects/1/tickets" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

```bash
# Filtered (combine any of: status, type, priority, assigneeId)
curl "{{base_url}}/api/v1/projects/1/tickets?status=in_progress&priority=high" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```
