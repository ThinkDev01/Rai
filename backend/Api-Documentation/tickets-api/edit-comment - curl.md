# Edit Comment — curl

```bash
curl -X PATCH "{{base_url}}/api/v1/projects/1/tickets/12/comments/8" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Reproduced on staging — also on prod." }'
```

Author-only: a non-author token returns `403 Only the comment author can edit this comment`.
