# Create Ticket — curl

```bash
curl -X POST "{{base_url}}/api/v1/projects/1/tickets" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login redirect loop",
    "type": "bug",
    "priority": "high",
    "description": "Users bounce between /login and /dashboard",
    "assigneeId": "<project-member-user-id>",
    "sprintId": "3",
    "parentKey": "PROJ-1"
  }'
```

Minimal (only required fields):
```bash
curl -X POST "{{base_url}}/api/v1/projects/1/tickets" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "title": "New task", "type": "task", "priority": "medium" }'
```
