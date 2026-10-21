# Guide — Database (v2)

Quick reference for the Rai v2 Postgres schema. Multi-tenant: every tenant table carries `org_id`, and everything cascades from `organizations`.

## Connecting (local dev)
- Host `localhost`, port `5432`. Database / user / password come from `backend/.env`.
- Use any Postgres client (DbVisualizer, TablePlus, psql). Tables live under schema `public`.

## How migrations work
- SQL files live in `backend/config/migrations/`, numbered `001`–`010`.
- They run **in order, automatically on server boot** (also via `npm run migrate`).
- A `schema_migrations` table records which files already ran — each runs once, so restarting is safe.
- **Multi-instance safe:** the runner takes a Postgres **advisory lock** (`pg_advisory_lock`, id `727101`) for the whole run. When several prod instances boot at once, the first applies migrations while the rest wait, then find everything already applied and no-op. Single-instance (local/staging) acquires it instantly — no behavioral change. Released in `finally`, and auto-released by Postgres if the process dies.

## Auth model (important)
- **No password column.** Auth is AWS Cognito.
- `users.external_auth_id` = Cognito `sub`. `users.id` = our own UUIDv7 — stays stable even if we ever swap auth provider (only `external_auth_id` would change).

## Tables

| Table | What it's for | Notable columns |
|---|---|---|
| `users` | Everyone who can log in (across all orgs). | `id` UUID, `external_auth_id`, `email`, `name`, `email_verified` |
| `organizations` | The tenant. One row per org. | `id` UUID, `name`, `slug` (unique), `subscription_status`, `discoverable`, `deleted_at`/`deleted_by` (soft-delete recycle bin) |
| `user_orgs` | Membership — which user is in which org + their role. | `user_id`, `org_id`, `role` (owner/admin/project_manager/user), `role_label` |
| `invites` | Pending org invites. Token-based, 7-day, single-use. | `token`, `org_id`, `role`, `invited_email`, `expires_at`, `used_at`, `revoked_at` |
| `projects` | Work containers, org-scoped. | `id` BIGSERIAL, `org_id`, `key`, `visibility` (default `private`), `archived`, `avatar_type` (`initials`/`icon`, default `initials`) + `avatar_value` (preset icon id) |
| `project_members` | Which user belongs to which project. | `project_id`, `user_id` |
| `sprints` | Time-boxed iterations. | `id`, `org_id`, `project_id`, `status` (planned/active/completed), `start_date`, `end_date` |
| `tickets` | Work items (task/bug/story/epic). | `id`, `org_id`, `project_id`, `sprint_id`, `parent_id`, `key`, `status`, `priority`, `assignee_id`, `reporter_id`; type-specific: `epic_name`/`epic_color`, `story_points`, `acceptance_criteria`, `steps_to_reproduce`, `environment` |
| `comments` | Ticket comments (single-level threads). | `id`, `org_id`, `ticket_id`, `user_id`, `content`, `parent_comment_id` |
| `ticket_status_history` | Status-change log — powers burndown / reports. | `ticket_id`, `old_status`, `new_status`, `changed_by`, `changed_at` |
| `notifications` | Per-user in-app feed (the bell/inbox). One row per dispatched notification. | `id` BIGSERIAL, `user_id`, `org_id` (nullable), `type`, `title` (rendered summary), `link` (relative deep-link), `read_at` |
| `notification_preferences` | Per-user, per-type, per-channel opt-out. Default enabled; v2 UI toggles email only. | PK (`user_id`, `notification_type`, `channel`), `enabled` |
| `user_pins` | Per-user "quick-access" pins (My Work). Polymorphic: each row pins one project **or** one ticket. Top 3 per type (app-enforced). | `user_id`, `org_id`, `project_id` / `ticket_id` (exactly one set), `pinned_at` |
| `otp_challenges` | Email-OTP gate for sensitive actions (delete org / transfer ownership / delete project). Single-use, hashed, target-bound. | `id` UUID, `user_id`, `action`, `target_id` (org/project id, text), `code_hash` (SHA-256), `attempts`, `expires_at`, `consumed_at` |
| `device_tokens` | Mobile push (FCM) registry. One row per (user, device-token); fans a notification out to all of a user's devices. Self-heals — dead tokens pruned on send. | `id` BIGSERIAL, `user_id`, `token` (unique), `platform` (`ios`/`android`/`web`), `last_seen_at` |
| `plans` | Billing catalog — the single "Standard" plan in v2. Price in whole **rupees**. | `id` UUID, `name`, `price_per_seat_inr` (₹, currently 129), `currency` (`INR`), `billing_interval` (`monthly`), `razorpay_plan_id` (nullable; the recurring Plan from the Razorpay dashboard), `is_active` |
| `subscriptions` | One **live** row per org (trialing/active/past_due) + historical canceled rows. Holds trial/period dates, auto-renew choice, peak seats (MQB), and nullable provider ids. The **read-only gate** itself stays on `organizations.subscription_status`. Trial dates derive from the org's `created_at` (so pre-billing orgs get a correct window). | `id` UUID, `org_id`, `plan_id`, `status` (`trialing`/`active`/`past_due`/`canceled`), `billing_mode` (`recurring`/`one_time`), `auto_renew`, `seats`/`peak_seats`, `trial_started_at`/`trial_ends_at`, `current_period_start`/`current_period_end`, `canceled_at`, `billing_email`, `razorpay_customer_id`/`razorpay_subscription_id`/`razorpay_order_id` |
| `feedback` | In-app feedback submissions (the feedback modal). Stored here AND emailed to support. | `id` UUID, `user_id`, `org_id` (nullable, `ON DELETE SET NULL`), `title`, `body`, `created_at` |
| `schema_migrations` | Internal — which migrations ran. Don't touch. | |

## Migrations in order

| # | File | What it does |
|---|---|---|
| 001 | `users` | Users — UUID id + Cognito `external_auth_id`, unique email. |
| 002 | `organizations` | Orgs (the tenant). Unique slug, `subscription_status`. |
| 003 | `user_orgs` | Membership + org role. Partial unique index = **exactly one owner per org**. |
| 004 | `invites` | Org invites. Token, 7-day TTL, **one live invite per (org, email)**. |
| 005 | `projects` | `projects` + `project_members`. Default visibility `private`; `org_id` indexed. |
| 006 | `sprints` | Sprints. Partial unique index = **one active sprint per project**. |
| 007 | `tickets_comments_history` | `tickets` + `comments` + `ticket_status_history`, all org-scoped. |
| 008 | `archived_at` | Adds `archived_at` to projects + sprints (backfills existing archived rows). |
| 009 | `orgs_discoverable` | Adds `discoverable` flag to organizations (domain-peer discovery). |
| 010 | `comment_threads` | Adds `parent_comment_id` to comments — single-level replies. |
| 011 | `comment_edited_at` | Adds `edited_at` to comments (shows "edited" on edited comments). |
| 012 | `org_soft_delete` | Adds `deleted_at` + `deleted_by` to organizations + partial index `idx_organizations_active`. Org delete is now a 30-day recycle bin. |
| 013 | `ticket_type_fields` | Adds type-specific nullable columns to tickets — Epic (`epic_name`, `epic_color`), Story (`story_points`, `acceptance_criteria`), Bug (`steps_to_reproduce`, `environment`). |
| 014 | `notifications` | Phase 3 notifications: `notifications` (in-app feed, indexed by user + partial unread index) + `notification_preferences` (per-user/type/channel opt-out). |
| 015 | `user_pins` | Per-user "quick-access" pins (My Work). Polymorphic (project **or** ticket), partial unique indexes per target. |
| 016 | `project_avatar` | Adds `avatar_type` (`initials`/`icon`, default `initials`) + `avatar_value` (preset icon id) to projects — Jira-style preset icon gallery. No upload (v3); the id→icon map lives on the frontend. |
| 017 | `otp` | `otp_challenges` — email-OTP gate for sensitive actions. SHA-256 code hash, bound to `(user, action, target)`, partial index on active (unconsumed) rows. Code is single-use, 10-min TTL, 3-attempt cap (enforced in `otp.model`). |
| 018 | `device_tokens` | Mobile push (FCM) registry — one row per (user, device-token). Token is the unique key (re-register moves it + bumps `last_seen_at`); `user_id` indexed for fan-out. Dead tokens pruned by the push channel on send. |
| 019 | `subscriptions` | Phase 4 billing: `plans` (single Standard plan seeded if empty) + `subscriptions` (one live row per org, partial unique on `org_id WHERE status IN (trialing,active,past_due)`). Provider columns nullable + staged (Razorpay now, Stripe later). The read-only gate stays on `organizations.subscription_status`; billing.service keeps the two in sync. |
| 020 | `feedback` | In-app feedback submissions — `feedback` table (UUID id, `user_id` CASCADE, `org_id` SET NULL, `title`, `body`). Stored + emailed to support. |
| 021 | `job_indexes` | Partial indexes for the cron sweeps: `idx_sprints_planned_start` on `sprints(start_date) WHERE status='planned'` (sprint auto-start) + `idx_invites_unaccepted_expiry` on `invites(expires_at) WHERE used_at IS NULL` (invite cleanup). Keep each tick's scan touching only due rows. |
| 022 | `price_in_rupees` | Renames `plans.price_per_seat_cents` → `price_per_seat_inr` and divides by 100 (5000 → 50). Price is now whole rupees; paise conversion happens only at the Razorpay call. **Guarded** (`DO $$ … IF column exists`) so it's a safe no-op when the column was already renamed out-of-band — re-running never throws "column price_per_seat_cents does not exist". |
| 023 | `org_razorpay_customer` | Moves the Razorpay customer id to `organizations.razorpay_customer_id` (one customer per org, persists across subscription cancel/recreate). `ADD COLUMN IF NOT EXISTS` + backfills from the newest subscription row that has one. |
| 024 | `price_129` | Raises the Standard plan to **₹129/seat/month** (`UPDATE plans SET price_per_seat_inr = 129`). Runs once (tracked), so a later in-table edit isn't clobbered. The recurring Razorpay Plan amount must be set to ₹129 in the dashboard to match. |

## Schema rules worth knowing
- **Tenant isolation:** every query filters by `org_id`. Tenant tables FK to `organizations ON DELETE CASCADE` — the CASCADE wipe happens when a row is hard-deleted.
- **Org delete is soft (recycle bin):** `DELETE /orgs/:id` stamps `deleted_at` instead of removing the row; membership queries (`getMembership`, `getMembershipsForUser`) filter `deleted_at IS NULL`, so the org vanishes app-wide but stays recoverable for 30 days (`ORG_RESTORE_WINDOW_DAYS`). The slug stays reserved (unique constraint spans soft-deleted rows). `npm run purge:orgs` (scripts/purge-orgs.ts) hard-deletes rows past the window, triggering the CASCADE + freeing the slug. ✓ Now wired into the cron runner (`purge-orgs`, daily 03:30 IST) — see `Guide/dev-notifications.md` → Scheduled jobs.
- **Backlog** = `tickets WHERE sprint_id IS NULL` (no separate table).
- **Sub-tickets** = `tickets.parent_id` → another ticket.
- **Comment replies** = `comments.parent_comment_id` → a *root* comment (replies-of-replies blocked at the API layer).
- **IDs:** users / orgs / invites use UUID; projects / sprints / tickets / comments use BIGSERIAL integers (Q13 decision).
- **Invariants in the DB, not just code:** one-owner-per-org, one-active-sprint-per-project, one-live-invite-per-(org,email), one-live-subscription-per-org are all enforced by partial unique indexes.
- **Billing gate vs detail:** the read-only write-gate reads `organizations.subscription_status` (`trial`/`active`/`suspended`/`cancelled`) on every request via the existing membership join — no extra round-trip. The `subscriptions` table holds the richer billing detail; `billing.service` maps detail → gate (`trialing→trial`, `active→active`, `past_due`/`canceled→suspended` so members keep context and can reactivate). Trials/lapsed periods are flipped to read-only by `npm run billing:sweep` (scripts/billing-sweep.ts); recurring renewals are driven by Razorpay webhooks.
- **Seats are derived, never stored as the source of truth:** the live seat count = `COUNT(user_orgs WHERE org_id = ?)`. `subscriptions.peak_seats` tracks the cycle high-water mark for Maximum Quantity Billing; `seats` is the last-invoice snapshot.
