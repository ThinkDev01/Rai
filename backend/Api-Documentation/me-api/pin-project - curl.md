# Pin / Unpin Project — curl

Pin a project (top 3 per org):
```bash
curl -X PUT "{{base_url}}/api/v1/me/pins/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Unpin it:
```bash
curl -X DELETE "{{base_url}}/api/v1/me/pins/projects/1" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```

Read the `isPinned` flag back from the projects list:
```bash
curl "{{base_url}}/api/v1/projects" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"
```
