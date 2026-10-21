# Rai v2 — Tables Index

A quick **map of every database table** — what it holds, in one line, grouped by area. An index, not the full schema.

**Canonical detail** (columns, constraints, migrations-in-order, schema rules) lives in **`../backend/guide - db.md`** — change column-level facts there, keep this as the scannable overview.

- Multi-tenant: every tenant-scoped table carries `org_id` and cascades from `organizations`.
- IDs: `users` / `organizations` / `invites` / `subscriptions` / `plans` / `feedback` / `otp_challenges` = **UUID**; `projects` / `sprints` / `tickets` / `comments` / `notifications` / `device_tokens` = **BIGSERIAL**.

---

## Identity & tenancy

| Table | One-liner | Migration |
|---|---|---|
| `users` | Everyone who can log in (Cognito-backed; no password column). | 001 |
| `organizations` | The tenant — one row per org. Holds `subscription_status` (read-only gate) + soft-delete (`deleted_at`). | 002, 012 |
| `user_orgs` | Membership — which user is in which org + their role (owner/admin/PM/user). | 003 |
| `invites` | Pending org invites. Token-based, 7-day, single-use. | 004 |

## Work (the product core)

| Table | One-liner | Migration |
|---|---|---|
| `projects` | Work containers, org-scoped (visibility, archive, avatar). | 005, 008, 016 |
| `project_members` | Which user belongs to which project. | 005 |
| `sprints` | Time-boxed iterations (planned/active/completed). | 006, 008 |
| `tickets` | Work items (task/bug/story/epic) + type-specific fields. | 007, 013 |
| `comments` | Ticket comments, single-level threads. | 007, 010, 011 |
| `ticket_status_history` | Status-change log — powers burndown/reports. | 007 |

## Engagement & security

| Table | One-liner | Migration |
|---|---|---|
| `notifications` | Per-user in-app feed (bell/inbox). | 014 |
| `notification_preferences` | Per-user/type/channel email opt-out. | 014 |
| `user_pins` | My Work quick-access pins (project **or** ticket). | 015 |
| `otp_challenges` | Email-OTP gate for sensitive actions (delete-org, transfer, delete-project, cancel-subscription). | 017 |
| `device_tokens` | Mobile push (FCM) device registry. | 018 |

## Billing

| Table | One-liner | Migration |
|---|---|---|
| `plans` | Billing catalog — the single "Standard" plan. **Price lives here** (`price_per_seat_inr`, whole ₹). | 019, 022 |
| `subscriptions` | One live row per org — trial/period dates, auto-renew, peak seats (MQB), provider ids. | 019 |

## Feedback & internal

| Table | One-liner | Migration |
|---|---|---|
| `feedback` | In-app feedback submissions (stored + emailed to support). | 020 |
| `schema_migrations` | Internal — which migration files ran. Don't touch. | — |

---

## Common "where is…?"

- **Subscription price** → `plans.price_per_seat_inr` (whole ₹; + match the Razorpay dashboard Plan for recurring). See `guide-billing.md`.
- **Read-only gate** → `organizations.subscription_status` (`trial`/`active`/`suspended`/`cancelled`).
- **Who's in an org** → `user_orgs`.
- **A ticket's history** → `ticket_status_history`.
- **Full columns / constraints / migration order** → `../backend/guide - db.md`.
