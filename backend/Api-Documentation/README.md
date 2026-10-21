# Rai API Documentation

Plain, copy-paste API reference for the v2 backend. Read [`_setup.md`](./_setup.md) first (the `{{base_url}}` / `{{token}}` convention).

**Layout:** each endpoint = two files — `<name> - docs.md` (what it does + every response) and `<name> - curl.md` (copy-paste request). Multi-endpoint features get their own `*-api/` folder; true singletons (health, users, search) sit loose at the top level.

All routes are under `/api/v1` except health. Base URL in examples: `http://localhost:4000`. The `v1-archive/` backend module is **not** documented (legacy).

## Inventory — 69 endpoints, all documented ✅

| Feature | Endpoints | Location |
|---------|-----------|----------|
| Health | 1 · health check | `health - *` (loose) |
| Users | 1 · a user's tickets | `users - *` (loose) |
| Search | 1 · org-wide search | `search - *` (loose) |
| OTP | 1 · request action code | `otp-api/` |
| Push | 2 · register-device, unregister-device | `devices-api/` |
| Attachments | 1 · get-attachment-url (refresh presigned GET) | `attachments-api/` |
| Billing | 6 · summary, invoices, subscribe, confirm, cancel (OTP-gated), webhook (public+signed) | `billing-api/` |
| Feedback | 1 · submit feedback (auth only, no org) | `feedback-api/` |
| Auth | 2 · logout, switch-org | `auth-api/` |
| Me | 3 · get-me, update-me, my-tickets | `me-api/` |
| Pins | 4 · pin/unpin project, pin/unpin ticket | `me-api/` (`pin-*`) |
| Sprints | 3 · create, update, delete | `sprints-api/` |
| Reports | 3 · burndown, sprint-report, velocity | `reports-api/` |
| Invites | 5 · preview, accept, revoke, create, list | `invites-api/` |
| Notifications | 7 · list, unread-count, mark-read, mark-unread, mark-all-read, get-preferences, update-preferences | `notifications-api/` |
| Projects | 7 · list, get, create, update, delete, add-member, remove-member | `projects-api/` |
| Tickets | 8 · list, get, create, update, delete, add-comment, edit-comment, delete-comment | `tickets-api/` |
| Orgs | 12 · discover-by-domain, deleted, create, update, list-members, update-member-role, remove-member, transfer-ownership, leave, restore, export, delete | `orgs-api/` |

## Notes
- **Nesting:** sprints / tickets / reports live under a project path (`/api/v1/projects/:id/...`) but are documented as their own features — the full path is in each file's header.
- **Public routes:** only `GET /api/health` and `GET /api/v1/invites/preview/:token` need no token; their curl files say so.
- **Org context** comes from the **`X-Org-Id: <org id>`** header on org-scoped routes, re-validated against your membership on every call. (`orgs/*` and `invites/*` take the org from the URL path instead; health / auth / `/me` / `notifications/*` need no org — the notification feed is one cross-org inbox per user.)
- **Sensitive-action OTP:** delete-org, transfer-ownership, delete-project, and cancel-subscription are gated by an email code. The client first calls `POST /api/v1/otp/request` (action + targetId), then passes the emailed 6-digit code as `otpCode` (or `code` for billing cancel) in the action's body. See `otp-api/`.
- **Billing read-only:** when an org's subscription is read-only (`suspended`/`cancelled`), write routes return `403` with `error: "SUBSCRIPTION_EXPIRED"`; reads still work. Billing routes themselves stay usable so the org can pay/reactivate. See `billing-api/` and `Guide/guide-billing.md`.
- Every response body uses the `{ success, data, error }` envelope.
