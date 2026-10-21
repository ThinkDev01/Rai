# Pin / Unpin Project

`PUT /api/v1/me/pins/projects/:id` · `DELETE /api/v1/me/pins/projects/:id`

Toggle the caller's **personal** pin on a project. Pins are per-user, per-org quick-access (the projects page floats pinned projects to the top). A user may pin **up to 3 projects per org**. The pin flag is read back as `isPinned` on each row of `GET /api/v1/projects`.

## Request
- Auth required. **Org context required** via the `X-Org-Id` header — 403 otherwise.
- `:id` = project id (integer). Body: none.

## Responses

**200 — pinned** (`PUT`)
```json
{ "success": true, "data": { "pinned": true }, "error": "" }
```
Idempotent: pinning an already-pinned project returns 200 without consuming a slot.

**200 — unpinned** (`DELETE`)
```json
{ "success": true, "data": { "pinned": false }, "error": "" }
```
Idempotent: unpinning a project that wasn't pinned still returns 200.

**400 — bad id** (`Invalid project id`)

**404 — not found** (`PUT` only — project doesn't exist in this org)
```json
{ "success": false, "data": {}, "error": "project not found" }
```

**422 — pin limit reached** (`PUT` only)
```json
{ "success": false, "data": {}, "error": "You can pin up to 3 projects. Unpin one first." }
```

**401 — auth** · **403 — no org context** · **500 — db error** (`Could not pin project` / `Could not unpin project`)
