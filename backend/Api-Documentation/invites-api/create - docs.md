# Create Invite

`POST /api/v1/orgs/:id/invites`

Invites an email to the org with a role. Inserts the invite (superseding any prior live invite for the same email) and sends the invite email.

## Request
- Auth required. Caller must be `owner`, `admin`, or `project_manager` in the org.
- Path: `:id` — org id
- Body (JSON):

| Field | Required | Notes |
|-------|----------|-------|
| `email` | yes | valid email; trimmed + lowercased |
| `role` | yes | `admin` \| `project_manager` \| `user` (never `owner`) |

## Responses

**201 — created**
```json
{
  "success": true,
  "data": {
    "invite": {
      "id": "018f...",
      "invited_email": "newhire@acme.com",
      "role": "user",
      "expires_at": "2026-06-09T14:00:00.000Z"
    }
  },
  "error": ""
}
```

**400 — validation** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Valid email is required" }
```
Other 400: `Role must be admin, project_manager, or user`.

**403 — no permission**
```json
{ "success": false, "data": {}, "error": "You do not have permission to invite members" }
```

**409 — already a member**
```json
{ "success": false, "data": {}, "error": "newhire@acme.com is already a member of this org" }
```

**500 — server error** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Could not verify org membership" }
```
Other 500: `Could not verify invitee status`, `Could not create invite`.

**502 — email delivery failed** (one of these messages)
```json
{ "success": false, "data": {}, "error": "Invite created but email delivery failed - please try again" }
```
If the address is unverified in the SES sandbox: `Couldn't send email to <email> - recipient not verified in SES sandbox. Verify the address in AWS Console first.` (the invite row is rolled back in both cases).
