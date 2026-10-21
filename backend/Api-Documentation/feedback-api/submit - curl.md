# Submit Feedback — curl

```bash
curl -X POST "{{base_url}}/api/v1/feedback" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Love the board view", "body": "Could we get swimlanes by assignee?" }'
```

No `X-Org-Id` needed. Stores the row + emails support.
