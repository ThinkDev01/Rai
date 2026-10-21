# Health Check

`GET /api/health`

Checks the API and database are up. No auth required.

## Request
- No auth, no params.

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": { "status": "ok", "db": "connected", "timestamp": "2026-06-02T14:00:00.000Z" },
  "error": ""
}
```
`db` is `"disconnected"` if the DB ping fails but the server still answers.

**500 — server/DB error**
```json
{ "success": false, "data": {}, "error": "Internal server error" }
```
