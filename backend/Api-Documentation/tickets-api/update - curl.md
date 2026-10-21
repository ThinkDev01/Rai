# Update Ticket — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/tickets/12" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "done",
    "priority": "high",
    "assigneeId": "<project-member-user-id>",
    "sprintId": "3",
    "parentKey": "PROJ-1"
  }'
```

Move to backlog (clear sprint) and unassign:
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/tickets/12" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "sprintId": null, "assigneeId": null }'
```
