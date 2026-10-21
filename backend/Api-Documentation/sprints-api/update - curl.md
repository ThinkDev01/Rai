# Update Sprint — curl

Edit fields:
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/sprints/7" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint 12 - billing",
    "goal": "Ship the billing rework",
    "endDate": "2026-06-20"
  }'
```

Start the sprint (planned → active):
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/sprints/7" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active" }'
```

Complete the sprint (active → completed):
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/sprints/7" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "status": "completed" }'
```

Archive a completed sprint:
```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/sprints/7" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "archived": true }'
```
