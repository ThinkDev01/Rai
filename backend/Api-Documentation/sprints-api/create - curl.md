# Create Sprint — curl

```bash
curl -X POST "{{base_url}}/api/v1/projects/1/sprints" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint 12",
    "startDate": "2026-06-02",
    "endDate": "2026-06-16",
    "goal": "Ship the billing rework",
    "notes": "Watch out for the migration step"
  }'
```

Minimal (only required field):
```bash
curl -X POST "{{base_url}}/api/v1/projects/1/sprints" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Sprint 12" }'
```
