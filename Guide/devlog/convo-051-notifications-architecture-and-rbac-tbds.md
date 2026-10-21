# Convo 051 — Notifications architecture + RBAC TBD resolution + walkthrough-style preference

**Date:** 16 May 2026

---

## What happened

Continuation from convo-050. Three threads in one session:

1. **RBAC TBD confirmations** — user tightened project delete to **admin + owner ONLY** (PMs cannot delete projects). Sprint delete and ticket delete stayed at admin + PM-in/on-public as I'd proposed. All three TBDs in `docs/rbac.md` now resolved.

2. **Notifications architecture deep-dive** — user wanted full clarity on cron mechanics, where notify() gets called from, how event-triggered vs time-scheduled flows work, AWS Lambda + EventBridge in v3, FCM for mobile push, and where files live for each. Walked through it file-by-file in plain language; user signaled the explanation style is what they prefer ("this explanation is so much better... use this kind of explanation from next time").

3. **Walk-through style locked as feedback memory** — saved `feedback_walkthrough_style.md` capturing the preference for file-by-file walk-throughs over jargon-heavy paragraphs.

By session end: notifications architecture fully designed and documented, ~22 notification types cataloged with channels, v3 parks added for FCM/WebSocket/SMS/Slack/Teams, scheduling pattern codified in standards.md.

---

## Locked decisions

### RBAC TBD final resolutions

| Action | Authority | Confirmation pattern |
|---|---|---|
| **Project delete** | **admin + owner ONLY** (no PMs) | Typed-slug confirmation gate (GitHub-style) |
| **Project archive / unarchive** | admin + PM-in/on-public | Simple yes/no |
| **Sprint delete** | admin + PM-in/on-public | Simple yes/no |
| **Sprint archive / unarchive** | admin + PM-in/on-public | Simple yes/no |
| **Ticket delete** | admin + PM-in/on-public ONLY (not reporter/assignee) | Simple yes/no |

PM cannot delete projects because deletion is permanent + removes all child data; responsibility sits at the org level. PMs retain archive (reversible).

### Notifications architecture

**Channel matrix:**

| Channel | v2 | v3+ |
|---|:-:|:-:|
| In-app (bell + inbox) | ✓ | ✓ |
| Email (AWS SES) | ✓ | ✓ |
| Mobile push (FCM) | – | ✓ |
| Web push | – | ✓ |
| SMS | – | parked |
| Slack/Teams | – | parked |

**Two flows that converge at `notificationService.notify()`:**
- **Event-triggered** (immediate): fires from service layer at trigger points (ticket assign, status change, etc.). ~20 types in v2.
- **Time-scheduled** (delayed): uses per-domain tables with `scheduled_at`/`fired_at` columns; cron job polls and fires. 3 types in v2 (sprint-start opt-in, sub T-7d, sub T-1d).

**Module structure:**

```
backend/modules/notifications/
├── notifications.service.ts        ← notify(userId, type, data, channels?)
├── notifications.model.ts          ← in-app history table
├── notifications.controller.ts     ← fetch / mark-as-read / preferences API
├── notifications.routes.ts
├── channels/
│   ├── email.channel.ts            ← AWS SES
│   ├── inapp.channel.ts            ← writes to notifications table
│   └── push.channel.ts             ← FCM stub in v2; real in v3
├── templates/
│   ├── ticket-assigned.template.ts
│   ├── (one per type — ~22 files in v2)
└── user-preferences.service.ts     ← per-user opt-in/out per type per channel
```

**Caller pattern (locked):**

`notify()` is called from the SERVICE file of the triggering module (not controller, not model). Layering rule from Q12 + standards.md §2:

| Layer | Calls notify()? |
|---|:-:|
| `<module>.controller.ts` | – |
| `<module>.service.ts` | ✓ |
| `<module>.model.ts` | – |

All templates live in `notifications/templates/` regardless of which module triggers them — central source of truth.

**Wire-up at build time:** approximately 20-25 `notify()` call sites added across existing services (tickets ~7, sprints ~3, projects ~4, orgs ~5, invites ~2, billing ~3). Each ~5 lines. Pure additive change to v1's existing services.

### Scheduling pattern (codified in standards.md §2)

- `node-cron` inside backend container, polls every minute (per-job interval tunable — 1-min default for user-facing notifications, daily for cleanup).
- Per-domain tables with `scheduled_at TIMESTAMPTZ` + `fired_at TIMESTAMPTZ NULL` columns.
- Partial index on `(scheduled_at) WHERE fired_at IS NULL` — keeps polling sub-millisecond.
- `FOR UPDATE SKIP LOCKED` so multiple backend instances can run the same cron without double-processing.
- Idempotent by design — re-running the query returns nothing for already-fired rows.

### v3 parks added to upgrades.md

- Mobile push via Firebase Cloud Messaging (FCM)
- WebSocket-based in-app notifications (replace polling)
- SMS notifications (Twilio / AWS SNS)
- Slack / Microsoft Teams notification integrations
- AWS EventBridge + Lambda for distributed scheduled jobs

### Feedback memory locked

- `feedback_walkthrough_style.md` — explain architecture file-by-file with plain language; define jargon before using; tables/lists not wall-of-text; reference docs can be wordy but chat responses stay plain.

---

## What landed where

**New docs:**
- `docs/notifications.md` — comprehensive notifications doc (channel matrix, full type catalog, module structure, caller pattern, time-scheduled vs event-triggered, v3 additions).
- `docs/devlog/convo-051-*.md` — this file.

**Modified:**
- `docs/rbac.md` — project delete tightened to admin + owner only with footnote explaining why PMs are excluded. Sprint actions table and ticket actions table TBDs resolved. Sprint lifecycle section added.
- `docs/standards.md` §2 — "Notifications: single module with channel adapters" entry added (points to notifications.md). "Background jobs (scheduled tasks)" entry refined with DB-as-scheduler pattern.
- `docs/upgrades.md` — 5 new parks: FCM, WebSocket in-app, SMS, Slack/Teams, EventBridge+Lambda.
- `docs/team/product-decisions.md` — extended "Can I delete a project/sprint/ticket?" section to reflect admin+owner only for project delete.
- `docs/v1-feedback-triage.md` — item 21 implementation note updated to reflect admin+owner only project delete authority.
- `docs/v2-plans.md` Phase D — notification system entry expanded with build-phase checklist (notifications module, 20-25 notify() wire-up sites across services, 3 cron jobs, preferences UI).

**Memory:**
- `feedback_walkthrough_style.md` — new feedback memory.
- `project_v2_multitenant.md` — refreshed: v1 walk-through marked complete, RBAC fully locked, notifications architecture added, app + infra review marked as active workstream.
- `MEMORY.md` — index updated with the new feedback entry.

---

## Status snapshot

| Phase | Status |
|---|---|
| Q1–Q16 strategic decisions | ✅ all locked |
| RF-1 to RF-16 rapid-fire | ✅ all locked |
| RBAC pass (all matrices + TBDs) | ✅ fully locked |
| v1 feedback walk-through (21 items) | ✅ all decided |
| Notifications architecture | ✅ locked + docs'd |
| Scheduling pattern | ✅ locked (node-cron, partial-indexed, idempotent) |
| App + infra review | 🔜 next |
| Phase re-sequencing | 🔜 |
| Build kickoff | 🔜 |

---

## Resume context (next session) — app + infra review begins

Suggested topics for the app + infra review phase:

1. **Walk v1 codebase against locked v2 decisions** — for each existing module (auth, users, projects, sprints, tickets, comments, etc.), call out: carry-over (as-is), retrofit (multi-tenant additions), rewrite (significant changes), drop (not needed in v2). Output: a "what to do with each v1 file" reference.
2. **File structure for v2 backend** — confirm modular monolith layout per Q12 + standards.md. Plan the new modules (orgs, user_orgs, invites, billing, subscriptions, notifications, jobs). Confirm `backend/lib/` for shared utilities (retry, error-codes, cognito-retry, ses-client, db pool).
3. **File structure for v2 frontend** — org-aware routing, new pages (org switcher, billing, members page, banner system, etc.).
4. **Devops handoff spec sheet** — concrete AWS config: Cognito user-pool settings, RDS instance class + Postgres version, SES domain identity + template list, CloudWatch metric filter expressions + SNS topic + subscriber emails, EC2 instance details.
5. **Branch / git strategy** — confirm v2-predev backup → v2 dev branch on top → freeze `developement` during v2 work → merge or fast-forward at the end (per `feedback_v1_stays_as_is`).
6. **Mock-first frontend approach** — what mocks look like; how AuthClient mock works; how to swap to real Cognito after infra lands.

After app + infra review: phase re-sequencing (phase letters re-enter — first time since rapid-fire), then build kickoff.

---

## Carried action items (updated post-this-session)

**Backend code modules to build:**
- `backend/lib/retry.ts` — `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` — `MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`, `ORG_DELETED`, `ALREADY_MEMBER` (5 codes).
- `backend/lib/ses-client.ts` — AWS SES SDK wrapper.
- `backend/modules/auth/cognito-auth.service.ts` — `AuthService` impl (sole holder of Cognito SDK imports).
- `backend/modules/auth/membership.resolver.ts` — `MembershipResolver` interface + `DbMembershipResolver` (RF-14).
- `backend/modules/notifications/` — full module per `docs/notifications.md` (service + 22 templates + email/inapp channels + user-preferences).
- `backend/modules/invites/` — create / revoke / list pending endpoints + supersede logic (RF-12).
- `backend/modules/orgs/` — switch-org + switch-org/revert endpoints (RF-13).
- `backend/modules/billing/` — subscription flows + Q11 reactivation.
- `backend/jobs/cron.ts` — registration file + per-job files (sprint-auto-start, sprint-start-notification, sub-pre-expiry-T7, sub-pre-expiry-T1, invite-cleanup).
- Tenant-scoping middleware (Q3 + RF-9/10/11 extensions via `MembershipResolver`).
- **`notify()` wire-up across existing services** — ~20-25 call sites in tickets/sprints/projects/orgs/invites/billing services.

**Frontend code to build:**
- `frontend/src/lib/auth-client.ts` — `AuthClient` interface + `CognitoAuthClient`.
- `frontend/src/lib/cognito-retry.ts` — mirrors backend's `withCognitoBackoff`.
- `frontend/src/lib/error-codes.ts` — mirror of backend codes.
- `frontend/src/components/PermissionBanner.tsx` — 4 copy variants.
- Axios interceptor — 4 error codes + 409 ALREADY_MEMBER.
- Org switcher with claim-verification + retry banner + Contact Support escalation.
- Team page with Pending Invites section.
- Project Members page (separate from settings).
- Notifications bell + inbox + Settings page for preferences.
- RF-1 storage event listener (4 events: `permissionChange`, `subscriptionExpired`, `orgDeleted`, etc.).

**Schema (v2 first migration):**
- `users (id UUID v7 PK, email UNIQUE, external_auth_id UNIQUE, ...)` per RF-16.
- `user_orgs.role` enum: 4 values incl. `owner`. Partial UNIQUE index for one-owner-per-org.
- `tickets.created_by` immutable audit; `tickets.reporter_id` becomes nullable.
- `sprints.updated_by` audit field. Sprint lifecycle: either `status` enum extended OR `archived_at TIMESTAMP` flag.
- `projects.archived_at TIMESTAMP NULL`.
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`.
- `notifications (id, user_id, type, data jsonb, read_at, created_at)` for in-app history.
- `notification_preferences (user_id, notification_type, channel, enabled)`.
- `sprint_start_notifications (id, sprint_id, user_id, org_id, scheduled_at, fired_at, created_at)`.
- `subscription_expiry_warnings (id, org_id, scheduled_at, fired_at, warning_type)`.
- Full hot-path index list per RF-14.

**Infra (devops handles, spec drafted at start of app+infra review):**
- AWS Cognito user pool (Google + MS federation enabled)
- AWS RDS Postgres 16 (staging cutover)
- AWS SES (Cognito + invite + notification emails)
- CloudWatch + SNS alert pipeline (RF-8, blocks prod cutover)
- EC2 + Docker

**Standards locked across all passes:**
- React Query keys start with `['org', orgId, ...]` (RF-6)
- Indexes on hot paths locked at first migration (RF-14)
- `MembershipResolver` swap-ready abstraction (RF-14)
- `AuthService.verifyAccessToken()` normalization + no-raw-provider-SDK rule (RF-16)
- `users.id` decoupled from external auth ID (RF-16, Q13 revision)
- Responsive web is baseline for all new pages
- Background jobs via node-cron + DB-as-scheduler (item 19)
- Notifications via single module with channel adapters (item 19 + notifications.md)
