# Add Comment — curl

```bash
curl -X POST "{{base_url}}/api/v1/projects/1/tickets/12/comments" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Reproduced on staging." }'
```

As a reply to a root comment:
```bash
curl -X POST "{{base_url}}/api/v1/projects/1/tickets/12/comments" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Same here.", "parentCommentId": "7" }'
```
