# Get Notification Preferences

`GET /api/v1/notifications/preferences`

The current user's per-type **email** toggle state for the Settings → Notifications page. In-app delivery is always on (the inbox) and is not listed here. Types flagged `alwaysEmail` are locked on.

## Request
- Auth required. No params.

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "items": [
      { "type": "ticket_assigned",    "label": "Assigned to a ticket",       "category": "Tickets",    "alwaysEmail": false, "emailEnabled": true },
      { "type": "ticket_comment_new", "label": "New comment on your ticket",  "category": "Tickets",    "alwaysEmail": false, "emailEnabled": false },
      { "type": "ticket_comment_mention", "label": "Mentioned in a comment",  "category": "Tickets",    "alwaysEmail": false, "emailEnabled": true },
      { "type": "invite_accepted",    "label": "Your invite was accepted",    "category": "Membership", "alwaysEmail": false, "emailEnabled": true }
    ]
  },
  "error": ""
}
```
- `emailEnabled` reflects the user's opt-out (default `true`).
- `alwaysEmail: true` types are system-critical — `emailEnabled` is always `true` and cannot be turned off.
- Group rows by `category` in the UI.

**401 — auth** · **500 — db error** (`Could not load preferences`)
