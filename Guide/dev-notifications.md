# Rai — Notifications Architecture & Catalog

Single source of truth for: what notifications fire, who receives them, what channels they go through, and how the system is structured.

Locked during v1 fix item 19 walk-through (May 2026).

---

## At a glance

v2 fires **~23 distinct notification types** — each with its own template file, all dispatched through the single `notificationService.notify()` entry. This is the quick tally; the [full catalog](#notification-catalog) below has channels, recipients, and triggers for each.

**Event-triggered (immediate)**

- **Tickets** — assigned · reporter-changed-to-you · status-changed · new-comment · comment-edited · @mentioned · deleted
- **Sprints** — completed · archived
- **Org & membership** — invite-sent · invite-accepted · added-to-project · removed-from-project · removed-from-org · role-changed · promoted-to-admin/owner
- **Subscription** — expired · reactivated
- **Projects** — archived / unarchived · deleted

**Time-scheduled (cron)** — fired by the in-process node-cron runner ([Scheduled jobs](#scheduled-jobs-cron-runner))

1. Sprint **auto-started** — a planned sprint reaches its start date → flips active + notifies members ✓ Live
2. Subscription pre-expiry — T-7d ✓ Live
3. Subscription pre-expiry — T-1d ✓ Live
4. Sprint start — opt-in alert at the user's chosen time ⏳ Deferred (needs a per-domain scheduled table)

---

## Implementation status (v2 Phase 3)

Built in the Phase 3 notifications pass — **event-triggered, in-app + email + push (FCM)**, dispatched through the single `notificationService.notify()` entry. Mobile push went live as a real channel (see "Mobile push (FCM)" below); it mirrors the in-app row and is a safe no-op until `FIREBASE_SERVICE_ACCOUNT` is configured.

**Live now (event-triggered):**
- Tickets — assigned · status-changed *(in-app)* · new-comment · @mentioned · comment-edited *(in-app)* · deleted *(in-app)*
- Sprints — completed *(in-app)* · archived *(in-app)*
- Projects — archived/unarchived *(in-app)* · deleted · member-added · member-removed
- Org & membership — role-changed · removed-from-org *(email, always)* · invite-accepted

**Deviations from the catalog (deliberate):**
- **Comment-edited is in-app only** (not email). Emailing everyone on every edit is noise; suppressing trivial edits stays a v3 refinement.
- **@mentions live** ✓ — via the `ticket_comment_mention` type (in-app + email). **Routing is id-bound, not name-text:** the composer sends a `mentions: string[]` of the user ids the author explicitly picked from the @-dropdown, and the backend validates them against project membership. This is deliberate — Rai display names aren't unique, so a name-text match could ping the wrong "Alice Smith"; binding the id (Instagram-style) routes to the exact person. A typed-but-**unselected** `@name` carries no id and notifies nobody (the composer shows a soft "not selected" warning nudging the user to pick from the list). A member who is *both* mentioned and reporter/assignee gets only the mention (it wins over plain new-comment). On an edit, a **newly-introduced** mention (a selected id whose name wasn't already in the pre-edit body) notifies the freshly-mentioned member; existing mentions aren't re-pinged.
- **Reporter-changed not wired** — the API has no "change reporter" field to hook.
- **Removed-from-org** still writes an in-app row (the feed is one cross-org inbox per user, so the user sees it in their bell) **and** always emails.

**Live now (scheduled — cron runner wired 2026-06-09):**
- **Sprint auto-start** (`sprint_started`, in-app + email + push) — planned sprints flip to active on their start date; project members notified. Hourly tick.
- **Trial-ending (7d, 1d)** (`trial_expiring`) + **subscription expired** (`subscription_expired`) — fire from the daily `billing-sweep` job (was: ran only via manual `npm run billing:sweep`; now scheduled daily).
- See [Scheduled jobs (cron runner)](#scheduled-jobs-cron-runner) for the full job list + schedules.

**Deferred to follow-ups:**
- **Sprint-start opt-in alert** (user picks a time) — distinct from auto-start above; still needs a per-domain `sprint_start_notifications` table + its own job.
- **Subscription reactivated** — ✓ built (`subscription_reactivated`), fires from `activate()` when a read-only org comes back.
- **Frontend** — bell + inbox (polling) and Settings → Notifications email toggles (built in the frontend pass).

## Channel matrix

| Channel | v2 | v3+ | Implementation |
|---|:-:|:-:|---|
| **In-app** (bell icon + inbox) | ✓ | ✓ | `notifications` DB table; user fetches via polling in v2, WebSocket push in v3 |
| **Email** | ✓ | ✓ | AWS SES (same setup as Cognito verification + RF-12 invite emails) |
| **Mobile push** (iOS / Android) | ✓ | ✓ | Firebase Cloud Messaging (FCM). Backend send + device registry shipped in v2 (`push.channel` + `device_tokens` + `/api/v1/devices`); the mobile app (other dev) registers tokens + renders. No-op until `FIREBASE_SERVICE_ACCOUNT` is set. |
| **Web push** | – | ✓+ | FCM web push or browser Web Push API |
| **SMS** | – | parked | Twilio or AWS SNS, if customer demand surfaces |
| **Slack / MS Teams** | – | parked | Webhook integration; Microsoft Teams plugin already in v3 plans (`v2-plans.md` Phase E) |

---

## Two notification flows

### 1. Event-triggered (immediate)

Fire the moment a user action happens. No scheduling.

```ts
// inside the ticket-assign endpoint
await notificationService.notify({
  userId: newAssigneeId,
  type: 'ticket_assigned',
  data: { ticketId, ticketTitle, assignerName },
});
```

Most notifications fall into this bucket.

### 2. Time-scheduled (delayed)

Fire at a specific future time. Uses the `scheduled_at` / `fired_at` pattern from `dev-standards.md` "Background jobs."

Per-domain table holds the scheduled row:

```sql
CREATE TABLE sprint_start_notifications (
  id            BIGSERIAL PRIMARY KEY,
  sprint_id     BIGINT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  fired_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sprint_notif_pending
  ON sprint_start_notifications (scheduled_at) WHERE fired_at IS NULL;
```

Cron job polls every minute → finds due rows → calls the same `notificationService.notify()` → marks `fired_at`.

Both flows converge at the same `notify()` entry — caller doesn't care which path triggered it.

---

## Scheduled jobs (cron runner)

All recurring background work runs in-process via **`node-cron`** inside the backend container — registered in **`backend/jobs/cron.ts`**, started from `server.ts` once the HTTP server is listening, stopped on graceful shutdown. Single-instance only for now; per `dev-standards.md §3` this moves to EventBridge + Lambda when v3 scales horizontally (the job *functions* stay identical — only the trigger changes).

**Wired 2026-06-09.** All times **IST**. Each run is wrapped (a throwing job is logged + swallowed, never crashes the scheduler) and guarded against overlap (a tick is skipped if the previous run of that job is still in flight).

| Job | Schedule (IST) | What it does | Notifies |
|---|---|---|---|
| `sprint-autostart` | hourly (`0 * * * *`) | Flips planned sprints whose start date has arrived → `active` (one per project, earliest first). | `sprint_started` → all project members (in-app + email + push) |
| `invite-cleanup` | daily 03:00 (`0 3 * * *`) | Hard-deletes expired unaccepted invites (frees the live-invite unique slot; keeps the table lean). | — silent housekeeping |
| `billing-sweep` | daily 03:15 (`15 3 * * *`) | `sweepTrialWarnings()` (T-7d / T-1d) then `sweepExpired()` (lapsed → read-only). | `trial_expiring`, `subscription_expired` |
| `purge-orgs` | daily 03:30 (`30 3 * * *`) | Hard-deletes soft-deleted orgs past the recovery window (cascade). | — |

**Each job is also a standalone, idempotent entrypoint** (the cron registration is just a thin trigger) — run any of them manually:

```bash
npm run jobs:sprint-autostart   # activate due sprints now
npm run jobs:invite-cleanup     # purge expired invites now
npm run billing:sweep           # warnings + expiry sweep now
npm run purge:orgs              # purge lapsed soft-deleted orgs now
```

**Disable the whole runner** with `CRON_ENABLED=false` (e.g. on a second instance once we scale, so jobs run on exactly one node).

**Performance:** each tick scans a domain table for "due" rows; partial indexes (`migration 021`) keep those scans touching only candidates — `idx_sprints_planned_start` (planned sprints) + `idx_invites_unaccepted_expiry` (unaccepted invites).

**Why these poll domain tables directly (no `scheduled_at`/`fired_at` table):** the "due" predicate already lives on the domain row — a sprint's `start_date`, an invite's `expires_at`. The dedicated per-domain scheduled-table pattern (above) is only needed when there's no natural due-column to poll, e.g. the opt-in sprint-start alert at a *user-chosen* time.

---

## Notification catalog

### Tickets

| Event | Trigger | Channels (default) | Notes |
|---|---|---|---|
| Assigned to ticket | Event | in-app + email | Fires to new assignee |
| Reporter changed to you | Event | in-app + email | Fires to new reporter |
| Status changed | Event | in-app | Fires only to reporter + assignee (not project members) |
| New comment on your ticket | Event | in-app + email | Fires to reporter + assignee (a mentioned member gets the `@mentioned` notification instead — mention wins) |
| Comment edited on your ticket | Event | in-app + email | Same recipients as new-comment (reporter + assignee + @mentioned). Comment editing shipped 2026-06-08 (author-only); the matching notification trigger wires in when this subsystem is built (Phase 3). Suppressing notifications for trivial / whitespace-only edits is a v3 refinement. |
| @mentioned in a comment | Event | in-app + email | ✓ Live (`ticket_comment_mention`). **Id-bound:** notifies the project members the author explicitly picked from the @-dropdown (sent as `mentions: string[]`, validated against membership), excluding the commenter — *not* a name-text match, so duplicate display names route correctly. A typed-but-unselected `@name` notifies nobody (composer warns). A mention newly introduced *during an edit* notifies the newly-mentioned member; existing mentions aren't re-pinged. Was: deferred in v2 (no mention parsing). Per-user opt-in granularity stays a v3 refinement; the email toggle already works via the standard preference row. |
| Ticket deleted (you were reporter/assignee) | Event | in-app | History row, no email noise |

### Sprints

| Event | Trigger | Channels | Notes |
|---|---|---|---|
| Sprint auto-started (reached start date) | Scheduled (cron) | in-app + email + push | ✓ Live (`sprint_started`). The `sprint-autostart` job flips a planned sprint to active on its start date and notifies all project members. System-triggered (no actor). |
| Sprint started — opt-in user alert | Scheduled | in-app + email | ⏳ Deferred. User picks time at sprint creation OR via notification icon on sprint page — distinct from auto-start; needs its own `sprint_start_notifications` table |
| Sprint completed | Event | in-app | Fires to project members |
| Sprint archived | Event | in-app | Fires to project members |

### Org / membership

| Event | Trigger | Channels | Notes |
|---|---|---|---|
| Invite sent to you | Event | email (only) | RF-12; recipient isn't in any org yet |
| Invite accepted (to inviter) | Event | in-app + email | Inviter learns who joined |
| You were added to a project | Event | in-app + email | Welcome to project X |
| You were removed from a project | Event | in-app + email | Plain notification |
| Your role in org changed | Event | in-app + email | Banner-pattern already covered by RF-9; notification is the audit-trail entry |
| Promoted to admin / owner | Event | in-app + email | Critical — always email |
| Removed from org | Event | email (only) | They don't have in-app access anymore |

### Subscription / billing (per Q11)

| Event | Trigger | Channels | Notes |
|---|---|---|---|
| Free trial started | Event | in-app + email + push | ✓ Live (`trial_started`). Fires to the owner on org creation — welcomes them + the 30-day trial end date + billing link |
| Trial ending soon (T-7d, T-1d) | Scheduled | in-app + email (always) | ✓ Live (`trial_expiring`). Fired by `sweepTrialWarnings` in the daily `billing-sweep` cron job (03:15 IST); owner+admins. **v2 policy: 7-day + 1-day only** (no T-1h). |
| Subscription expired | Event | in-app + email (always) | ✓ Built (`subscription_expired`). Fired **once** by `sweepExpired` when an org flips to read-only (one-way flip ⇒ no repeat). Owner+admins. Banner UX is separate (RF-10) |
| Subscription reactivated | Event | in-app + email | ✓ Built (`subscription_reactivated`). Fires to owner+admins when a read-only org goes Active again (detected in `activate()` — prior gate was suspended/cancelled). First subscribe + normal renewals don't fire it. |
| Payment failed (dunning, v3) | Event | email + in-app to admins | Parked |

### Project lifecycle

| Event | Trigger | Channels | Notes |
|---|---|---|---|
| Project archived | Event | in-app | Fires to project members |
| Project unarchived | Event | in-app | Fires to project members |
| Project deleted (you were a member) | Event | in-app + email | Permanent — email matters |

### System / errors (ops only — NOT user-facing notifications)

These flow through the RF-8 alert pipeline (CloudWatch → SNS → ops email), not the user notification system:

- `*_rollback_failed` — DB/Cognito sync failures
- `*_mismatch` — middleware-detected inconsistency
- `org_switch_revert_failed` — RF-13 revert failure

Listed here so it's clear these don't end up in user inboxes / bells.

---

## Module structure

```
backend/modules/notifications/
├── notifications.service.ts        ← main entry: notify(userId, type, data, channels?)
├── notifications.model.ts          ← in-app notifications table (per-user history)
├── notifications.controller.ts     ← API for fetch / mark-as-read / preferences
├── notifications.routes.ts
├── channels/
│   ├── email.channel.ts            ← AWS SES integration
│   ├── inapp.channel.ts            ← writes to notifications table; v3 also pushes via WebSocket
│   ├── push.channel.ts             ← FCM send + dead-token prune (real in v2; no-op until configured)
│   └── (sms.channel.ts, slack.channel.ts later if demand)
├── templates/
│   ├── ticket-assigned.template.ts
│   ├── sprint-starting.template.ts
│   ├── invite-accepted.template.ts
│   └── (one per notification type)
└── user-preferences.service.ts     ← per-user opt-in/out per type per channel
```

### Where `notify()` gets called from

**Always from the SERVICE file of the triggering module.** Not from the controller (which is the HTTP layer), not from the model (which is pure DB access).

| Layer | Calls `notify()`? | Why |
|---|:-:|---|
| `<module>.controller.ts` | – | HTTP layer; parses request, returns response |
| `<module>.service.ts` | ✓ | Business orchestration owns side effects (notifications, audit logs, cache invalidation) |
| `<module>.model.ts` | – | Pure DB access — no side effects |

For time-scheduled notifications, the cron job file calls `notify()` directly after polling the per-domain scheduled table.

### Caller pattern

```ts
await notificationService.notify({
  userId,
  type: 'ticket_assigned',
  data: { ticketId, ticketTitle, assignerName },
  channels: ['inapp', 'email'],  // optional override; defaults come from user prefs + type defaults
});
```

The service:
1. Looks up the user's preferences for this notification type.
2. Resolves which channels to actually send through (intersection of requested + user-allowed + system-defaults).
3. Loads the template for `type`, renders it with `data`.
4. Dispatches to each channel adapter in parallel.
5. Writes one row to the `notifications` table regardless of channel mix (for the in-app history).

### Adding a new notification type (typical PR)

1. Add a row to the catalog table above.
2. Add `templates/<type>.template.ts` (subject + body for email, summary text for in-app, payload shape for push).
3. Call `notificationService.notify({ type: 'new_type', ... })` from the relevant endpoint.

If it's time-scheduled (rare):
1. **If the domain row already carries the due-column** (like a sprint's `start_date` or invite's `expires_at`) — poll it directly; no new table. Add a model query for the due rows + a partial index on the predicate.
2. Otherwise (due time is independent, e.g. a user-chosen alert time) — add a per-domain table with `scheduled_at` + `fired_at` and a partial index on `(scheduled_at) WHERE fired_at IS NULL`.
3. Add `backend/jobs/<name>.job.ts` exporting a standalone, idempotent `run*()` (mirror `sprint-autostart.job.ts`: pure function + `require.main` guard for manual runs).
4. Register it in the `JOBS` array in `backend/jobs/cron.ts` with a cron expression (IST).

---

## User preferences

Per user, per notification type, per channel. Stored in a `notification_preferences` table:

```sql
CREATE TABLE notification_preferences (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  channel           TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, notification_type, channel)
);
```

Default: enabled. User can disable per-channel-per-type from a Settings → Notifications page (v2 has basic; v3 expands).

System-critical notifications (subscription expired, removed from org, security events) **ignore preferences and always send via email**. Captured in the catalog above with the (always) marker.

---

## How v3 evolves the cron piece (without disrupting the notifications module)

When v3 hits the trigger criteria (horizontal backend scaling, >10 jobs, or sub-minute latency need), the cron job moves out of the backend into **AWS EventBridge + Lambda**. Critically:

- The **notifications module stays exactly where it is** — service file, templates, channels, all unchanged. Lambda does NOT duplicate notification logic.
- Lambda is a ~10-line function whose job is "call the backend's internal endpoint."
- New internal endpoint: `POST /api/v1/internal/fire-due-notifications` (auth-gated to AWS IAM or a shared secret). Endpoint runs the same `SELECT ... WHERE scheduled_at <= NOW() AND fired_at IS NULL` query + calls `notify()` for each row + updates `fired_at`.
- EventBridge cron expression triggers Lambda; Lambda hits the backend endpoint; backend does the real work.

So the v3 picture is:

```
v2:  backend process { http server, node-cron (every 1 min) → notify() }

v3:  backend process { http server, notify() ← unchanged }
     AWS infra      { EventBridge schedule → Lambda → POST /internal/fire-due-notifications → backend.notify() }
```

**One notifications module forever.** Trigger source swaps; logic doesn't.

Alternative for v3 (per-row precision): when each `*_notifications` row is created, also create one EventBridge Scheduler schedule that fires at exact `scheduled_at`. Lambda receives the trigger with the notification ID → hits backend with that specific ID. No polling needed. Migration decision made at activation time.

## Mobile push (FCM) — backend side (v2)

The native mobile app is built by another dev; the backend owns only the **send side**. The split:

**Backend owns (shipped in v2):**
- **Device registry** — `device_tokens` table (migration 018) + the `push` module:
  - `POST /api/v1/devices` `{ token, platform }` — register / refresh a token (the app calls this on login + every FCM token refresh).
  - `DELETE /api/v1/devices` `{ token }` — unregister (on logout / push-off).
  - User-scoped (no org header) — a device belongs to the user and receives their cross-org notifications, exactly like the bell feed.
- **FCM send** — `notifications/channels/push.channel.ts`. For every dispatched notification it looks up the user's tokens, sends a multicast via `firebase-admin`, and **prunes dead tokens** (FCM `registration-token-not-registered` / `invalid-*`) so the registry self-heals. Best-effort like email — a push failure never breaks the triggering action.
- **FCM init** — `config/firebase.ts`. Lazy singleton; loads the service-account credential from one env var; logs + disables push (no-op) if absent or invalid, so the backend boots fine before Firebase is set up.
- **Payload** — `notification: { title, body }` (body = the template's `pushBody` or its `inappText`) + `data: { type, link, orgSlug }` for the app to deep-link without re-fetching.

**Mobile dev owns:** the Firebase client SDK in the app, obtaining the FCM token, calling register/unregister, and rendering / deep-linking the received push.

**Mobile-compatible feed (also v2):** `GET /api/v1/notifications` returns the in-app history; web bell + mobile inbox read the same `notifications` table via the platform-agnostic `inapp.channel.ts`. Codified in `dev-standards.md` — "APIs are mobile-compatible from v2 day one."

### Firebase setup (one-time, before push goes live)

Code is complete and dormant — these are the only steps to switch it on:

1. **Firebase Console** → create a project (or reuse one) → **Build → Cloud Messaging** (enabled by default for new projects).
2. **Project settings → Service accounts → Generate new private key** → downloads a service-account JSON.
3. Base64-encode that JSON and set it as the backend env var **`FIREBASE_SERVICE_ACCOUNT`** (base64 recommended — survives `.env` files without newline/quote mangling of the private key; raw JSON is also accepted).
   - macOS/Linux: `base64 -w0 service-account.json`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))`
4. Restart the backend (env-only change; `.env` is mounted, not baked — **no rebuild**). On boot the log prints `Firebase Admin initialised - mobile push enabled`.
5. Ensure migrations are applied (`npm run migrate`) so `device_tokens` exists — same for prod.
6. Hand the mobile dev the same Firebase project (their app config / `google-services.json` / `GoogleService-Info.plist` come from it) so client tokens and server creds belong to one project.
7. **iOS only:** upload the **APNs auth key** in Firebase → Cloud Messaging → Apple app config (Apple requires it; Android needs nothing extra). FCM bridges to APNs automatically once the key is set.

**Per-env note:** use the same Firebase project across staging + prod, or one project per env — just match each backend's `FIREBASE_SERVICE_ACCOUNT` to the mobile app config pointing at the same project. Setup is identical in every env (env-only change, mounted `.env`).

The credential is created under the **`devops@novetum.com`** Firebase/Google account (dev/infra ownership).

### Env var

| Var | Required | Notes |
|-----|----------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | no | Base64 (or raw JSON) of the FCM service-account credential. Unset → push silently disabled; in-app + email unaffected. Optional in `env.ts` (not in `REQUIRED`), like `SES_FROM_EMAIL`. |

## v3 additions (parked in `upgrades.md`)

- ~~**Mobile push via FCM** — `push.channel.ts` becomes real~~ ✓ **Done in v2.** Was: planned for v3 with the mobile app. Now: backend send + device registry shipped (see "Mobile push (FCM)" above); only the Firebase credential + the mobile client remain.
- **WebSocket in-app push** (replaces polling for both web and mobile)
- **Per-channel preferences UI** (basic settings page in v2 → granular matrix in v3)
- **Notification history archive** (90-day auto-archive)
- **Rich @mention parsing + autocomplete**
- **Bundling / digest emails** ("3 tickets assigned to you today" instead of 3 separate emails)

---

## Email sender configuration

### Single transactional mailbox

v2 ships with ONE sender for all product emails: **`rai@novetum.com`**. Stored in backend env as `SES_FROM_EMAIL`. Matches the Slack/Linear/Notion pattern of a single transactional address.

Subject + body differentiate the type — recipients understand it's "Rai" regardless of whether the email is an invite, password reset, or ticket assignment.

### Sender per email type — v2

| Email type | Sender | Sent via | Notes |
|---|---|---|---|
| Cognito email verification (signup) | `rai@novetum.com` | Cognito → SES | Requires Cognito to be configured to use our SES (see "Cognito → SES integration" below). Until then, falls back to AWS default `no-reply@verificationemail.com`. |
| Password reset code | `rai@novetum.com` | Cognito → SES | Same — gated on Cognito SES config |
| MFA codes (v3) | `rai@novetum.com` | Cognito → SES | Same |
| Org invite | `rai@novetum.com` | Our backend → SES | Product email — written and rendered by our notification service, sent via `email.channel.ts` |
| Invite accepted (to inviter) | `rai@novetum.com` | Our backend → SES | Product email |
| Ticket assigned / commented / @mentioned | `rai@novetum.com` | Our backend → SES | Product email |
| Project added / removed | `rai@novetum.com` | Our backend → SES | Product email |
| Role change | `rai@novetum.com` | Our backend → SES | Product email |
| Subscription pre-expiry, expired, reactivated | `rai@novetum.com` | Our backend → SES | Product email |
| Subscription payment failed (v3) | `rai@novetum.com` | Our backend → SES | Product email |

### Cognito → SES integration (one-time devops setup)

By default, Cognito sends its own emails (verify, reset, MFA) from `no-reply@verificationemail.com` — unbranded and looks like spam. Routing them through our SES makes them come from `rai@novetum.com` like everything else.

In AWS Console → Cognito → user pool → **Messaging** tab → **Email** section:
- Switch from "Send email with Cognito" to **"Send email with Amazon SES"**
- Select the verified identity: `rai@novetum.com`
- FROM address: `rai@novetum.com`
- FROM sender name: `Rai`
- Reply-to: same (or `support@novetum.com` once that mailbox exists)

After this, all Cognito-sent emails route through our SES with our branding. No code change on our side.

### v3+ segmentation (parked)

If email volume grows or different sender personas matter, split into:
- `noreply@novetum.com` — security/auth (verify, reset, MFA, suspicious-login alerts)
- `notifications@novetum.com` — product activity (ticket assigned, @mention, comment)
- `support@novetum.com` — replies + manual outreach (real mailbox, monitored)
- `billing@novetum.com` — subscription, invoices, payment failures

Each becomes a separate verified SES identity. Backend `email.channel.ts` picks the FROM based on notification category. Parked until volume warrants — `rai@novetum.com` covers v2 fine.

### IAM permission requirement

The backend's AWS IAM user (the one whose `AWS_ACCESS_KEY_ID` is in `.env`) needs `ses:SendEmail` + `ses:SendRawEmail` on the verified identity ARN. One-time policy attachment; no per-request token.

---

## Template structure

Each notification type has its own template file at `backend/modules/notifications/templates/<type>.template.ts`. The template owns three render outputs because the same notification ships through multiple channels:

```ts
// templates/ticket-assigned.template.ts
import type { Template } from '../notifications.types';

interface TicketAssignedData {
  ticketKey:    string;
  ticketTitle:  string;
  assignerName: string;
  ticketUrl:    string;
}

export const ticketAssignedTemplate: Template<TicketAssignedData> = {
  emailSubject: (d) => `${d.assignerName} assigned you ${d.ticketKey}: ${d.ticketTitle}`,
  emailHtml:    (d) => `
    <p>${d.assignerName} just assigned you a ticket:</p>
    <p><strong>${d.ticketKey}</strong> — ${d.ticketTitle}</p>
    <p><a href="${d.ticketUrl}">Open in Rai</a></p>
  `,
  emailText:    (d) => `${d.assignerName} assigned you ${d.ticketKey} — ${d.ticketTitle}\n\n${d.ticketUrl}`,
  inappText:    (d) => `${d.assignerName} assigned you ${d.ticketKey}`,
  pushTitle:    (d) => `Assigned: ${d.ticketKey}`,
  pushBody:     (d) => d.ticketTitle,
};
```

Per channel:
- **`emailSubject` + `emailHtml` + `emailText`** — used by `email.channel.ts`. Plaintext fallback is required (some clients block HTML).
- **`inappText`** — used by `inapp.channel.ts` for the bell-icon list. Short, no formatting.
- **`pushTitle` + `pushBody`** — used by `push.channel.ts` in v3. Title ≤ 30 chars, body ≤ 150 (FCM display limits).

### Branded HTML layout (`templates/layout.ts`) — ✅ Done in v2

Email templates no longer hand-write `emailHtml`. They call a single shared shell, `renderEmail(...)` from `templates/layout.ts`, so every notification email looks like the product and the design lives in one place.

- **`renderEmail({ heading, body, highlight?, code?, cta?, footnote? })`** returns the full branded HTML — a table-based, fully-inline-styled card (email-client safe: Gmail/Outlook/Apple Mail strip `<style>` and classes).
  - `heading` — card title. `body` — array of paragraphs. `highlight?` — emphasised blue callout box (e.g. the ticket label / new role). `code?` — big centered letter-spaced one-time code (the OTP code block). `cta?` — `{ text, url }` primary button (omit for no-link types like *removed-from-org/project*). `footnote?` — small print below the code/CTA (expiry, "ignore this email").
- **Colours mirror the app's light-theme tokens** in `frontend/app/globals.css` (primary `#0052CC`, surfaces, borders, text) and match the v1 Cognito emails in `frontend/content/emails/`. No dark-theme for email — clients control that; system font stack since clients can't load Inter.
- **All interpolated values are HTML-escaped** inside the layout (names/titles/org names are user-controlled), so templates pass raw strings.
- **Emphasis via `**bold**` only — never raw HTML.** `body` paragraphs are escaped *first*, then Markdown-style `**...**` markers become `<strong>`. Writing a literal `<strong>` in a body string is a bug: it gets escaped and renders as the visible text `<strong>` in the email. Escape-then-emphasise keeps the injection guarantee while letting templates bold key values (org name, dates, sprint name).
- **Currently wired** (the 12 email-producing types): `ticket_assigned`, `ticket_comment_new`, `invite_accepted`, `org_role_changed`, `org_member_removed`, `project_deleted`, `project_member_added`, `project_member_removed`, `trial_started`, `trial_expiring`, `subscription_expired`, `subscription_reactivated`. In-app-only types render no email.
- **Also uses the shell:** the **invite email** (`modules/email/templates/invite.template.ts`) and the **OTP email** (`modules/email/templates/otp.template.ts`) both import `renderEmail`, so every backend-sent email — notifications, invites, and OTP codes — shares the same R-logo header, footer and colours. OTP uses the `code` + `footnote` slots. The only separate files are the **Cognito** templates in `frontend/content/emails/`, which are pasted into the AWS Console (can't import code) but replicate the same shell by hand.

### Why no templating engine (Handlebars/MJML/Mustache)

For v2 scale, JS template literals with typed `data` are enough. Type-safety > flexibility — TypeScript checks every substitution. No runtime parse step, no template-injection surface.

Branded HTML (header, CTA button, highlight callout) landed in v2 via the shared `templates/layout.ts` shell — see above. If emails ever need richer layouts (multi-column, dark-mode-aware), `renderEmail` is the single place to migrate to **MJML** (compiles to email-safe HTML across all clients) without touching any template, channel, or service file.

### Plain-text-first rule

Every template MUST produce `emailText`. Reasons:
- Spam filters score HTML-only emails higher (looks suspicious)
- Screen readers prefer text
- Email clients that block HTML get the plaintext fallback
- Easier to reason about in tests (snapshot the string)

`emailHtml` is optional; when omitted, the channel sends plain text only.

---

## Related docs

- `dev-standards.md` §2 — "Background jobs (scheduled tasks)" — DB-as-scheduler pattern used for time-scheduled notifications.
- `v2-plans.md` Phase D — original notification system entry.
- `guide-rbac.md` — who can do actions that trigger notifications (role-changes, member-removal, etc.).
- `v2-decisions.md` Q11 + RF-10 — subscription expiry notifications (pre-expiry emails + banner).
- `v2-decisions.md` RF-12 — invite emails.
- `v2-decisions.md` RF-8 — ops alert pipeline (separate from user notifications).
- `upgrades.md` — v3 push notifications, WebSocket, SMS, Slack/Teams integrations.
