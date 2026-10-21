# Update Member Role

`PATCH /api/v1/orgs/:id/members/:userId`

Changes a member's role type and/or display label. Owner/admin only for other members; the owner seat can't be assigned here (use transfer-ownership). You may rename your own label but not change your own role type.

## Request
- Auth required.
- Path: `:id` — org id · `:userId` — target member user id
- Body (JSON), at least one of:

| Field | Required | Notes |
|-------|----------|-------|
| `role_type` | no | one of `admin` \| `project_manager` \| `user` |
| `role_name` | no | non-empty display label, max 20 chars; `null` clears it |

## Responses

**200 — updated**
```json
{
  "success": true,
  "data": {
    "member": {
      "user_id": "a1b2...",
      "email": "jane@acme.com",
      "name": "Jane Doe",
      "role": "admin",
      "role_label": "Lead",
      "joined_at": "2026-05-10T09:00:00.000Z"
    }
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "role_type must be one of: admin, project_manager, user" }
```
Other 400s: `role_name must be a non-empty string when provided`, `role_name must be at most 20 characters`, `role_type or role_name is required`.

**403 — forbidden** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Forbidden" }
```
Other 403s: `You can rename your own display label, but cannot change your own role type`, `Only owners and admins can change member roles`, `Owner row cannot be edited - transfer ownership to take that seat`.

**404 — member not found**
```json
{ "success": false, "data": {}, "error": "Member not found in this org" }
```

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not update role" }
```
