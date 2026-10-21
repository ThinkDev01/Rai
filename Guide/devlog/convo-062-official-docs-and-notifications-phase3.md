# convo-062 — Official documentation + Notifications (Phase 3)

**TL;DR**
- Created `Guide/Official Documentation/` — public-facing **Product Guide, Release Notes, Terms of Service, Privacy Policy** (ToS/Privacy under **Indian law / DPDP Act**, with bracketed placeholders to fill before publishing).
- Consolidated the repeating pre-prod blocks in `upgrades.md` into **one "Production go-live plan"** (launch decision + v3→v2 phase mapping + a single grouped go-live checklist with a status-marker legend).
- Built the **Notifications subsystem (Phase 3)** end-to-end for event-triggered **in-app + email**: backend module + migration 014 + 15 event types wired into trigger services, and the frontend **bell + inbox + Settings email toggles**. Verified: typecheck clean both ends, 26 backend tests pass.
- **Next:** user tests tomorrow. Deferred: mobile push (FCM), cron/scheduled (sprint-start alert), subscription-event triggers (Phase 4).

---

## 1. Official documentation

**Ask:** create publish-ready docs in a new `Guide/Official Documentation/` folder before prod — ToS, Privacy Policy, Release notes, Product docs. Professional, marketing-grade, to the point.

**What was created** (no copies of public content — all original):
- `product-docs.md` — public **Product Guide** (what Rai is, getting started, orgs, roles, projects, sprints, tickets, My Work, notifications, invites, billing/trial, sign-in/security, support).
- `release-notes.md` — **Rai 1.0 — Launch** notes, latest-first.
- `terms-of-service.md` — ToS, **India governing law**.
- `privacy-policy.md` — Privacy Policy, **DPDP Act 2023–aligned**.
- `README.md` — folder index + placeholder checklist.

**Decisions:**
- **Did NOT move the internal `guide-overview.md` / `guide-product.md`** into the folder — they're internal (competitor "where we lag" analysis, v2/v3 roadmap jargon), not safe to expose. Wrote fresh customer-facing product docs instead; left the internal guides where the README index points to them.
- **Legal specifics left as placeholders** (user chose "placeholder for now"): `[LEGAL ENTITY NAME]`, `[support email]`, `[product URL]`, `[effective date]`, `[city, India]` (dispute jurisdiction), `[name / designation]` (Grievance Officer).
- **Jurisdiction locked: India** (fits Razorpay + IST; privacy aligned to DPDP).
- Confirmed it's **general SaaS** privacy posture — only account/org/usage/payment-status data; Razorpay holds card details, we don't; no sensitive data, no selling, no ad trackers.
- Flagged: ToS/Privacy are industry-standard drafts but **need a lawyer's review** before publishing; `support@` inbox still needs setting up.
- Registered the new folder in `Guide/README.md`.

## 2. Pre-prod checklist consolidation (`upgrades.md`)

The "⬆ Promoted to v2", "Go-to-market batch", and a newly-added "Pre-prod work" block were **repeating each other**. Consolidated into a single top-level section:

**`## ⬆ Promoted to v2 — Production go-live plan (2026-06-08)`** with:
- **Launch decision** — ship to prod at end of v2; mobile app ready (separate dev) ships alongside; skip internal admin dashboard (support via `support@`); custom logos cut to v3; explicit "out for launch" list.
- **Pulled forward from v3 (phase mapping)** — table: Razorpay→P4, data import/recycle→P5, MFA/sessions/suspicious→P7, OTP gate→P7, mobile push (FCM)→P3.
- **Go-live checklist** — grouped **A. Non-code (paperwork/admin)** / **B. Engineering launch-critical (in phases)** / **C. Engineering additional**, with a **status-marker legend** (✅ done · 🔄 in progress · ⚠ critical-open · blank not started; done items keep their line + date + how/where, drop the ⚠).
- Updated the two back-references (§ email-deliverability, § org-soft-delete) to point at the new section; updated the Contents index.

**Rate-limiter clarification:** the limiter **is already live** (Postgres-backed, `rateLimiter.ts`). Replaced the "build basic abuse protection" line with the real remaining work — **prod retuning** (per-user key for corporate NAT, per-endpoint limits tighter on `/auth/*`, higher ceiling), per `v2-plans.md`.

**How completion gets tracked going forward:** mark-in-place with `✅ + date + one-line how/where`, never delete (keeps the launch record); the remaining `⚠` lines are always "what's critical and still open".

## 3. Notifications subsystem — Phase 3

**Scope agreed:** in-app + email channels now; **push deferred** ("we'll do later"); SES prod access already obtained. Event-triggered notifications are the bulk; scheduled/cron deferred (service built so cron is drop-in).

### Backend (`backend/modules/notifications/`)
- **Migration 014** — `notifications` (per-user in-app feed: user_id, org_id nullable, type, title, link, read_at; indexed by user + partial unread index) + `notification_preferences` (PK user/type/channel, default-enabled opt-out).
- **`notify()` / `notifyMany()` service** — single dispatch entry, called from trigger modules' controllers (the orchestration layer here; service files are thin re-export barrels). **Bulletproof: never throws** — fully wrapped so a notification problem can't break/slow the action that triggered it. Fire-and-forget (`void notify(...)`) at call sites so the HTTP response isn't delayed by email sends.
- **Channels** — `inapp` (always writes the durable feed row — this IS the inbox), `email` (best-effort over the existing SES `email.service`; failures log + swallow), `push` (no-op stub).
- **Template registry** (`templates/index.ts`) — one file per type; `NotificationType` union derived from registry keys; each entry carries `defaultChannels`, `alwaysEmail`, `label`, `category`. **15 event types** live.
- **6 endpoints** at `/api/v1/notifications` (user-scoped, **no `X-Org-Id`** — one cross-org feed per user): list · unread-count · mark-read · mark-all-read · get/update-preferences.

### Triggers wired (recipients exclude the actor)
- **Tickets** — assigned (create + reassign), status-changed *(in-app)*, new-comment, comment-edited *(in-app)*, deleted *(in-app)*. Recipients = reporter + assignee.
- **Sprints** — completed *(in-app)*, archived *(in-app)*. Recipients = project members.
- **Projects** — archived/unarchived *(in-app)*, deleted, member-added, member-removed. Members captured **before** delete-cascade.
- **Orgs** — role-changed (only on real type change), removed-from-org *(email, always)*.
- **Invites** — invite-accepted → notifies the inviter.

### Frontend
- **`NotificationBell`** (header) — bell + unread badge (polls unread count every 45s), dropdown inbox (fetched on open), unread highlight + dot, relative time (`lib/time.ts`), per-row org name, click → mark read + deep-link via the row's own `org_slug`, "Mark all read", footer link to settings. Replaced the old "coming soon" placeholder.
- **`NotificationPreferencesSection`** (Settings) — per-type **email** toggles grouped by category; in-app always on; system-critical types locked on.
- **`useNotifications.ts`** — cross-org keys `['notifications', …]` (not org-scoped); queries + mark-read/all + preferences mutations.
- UI copy centralized in `content/notifications.ts`.

### Deliberate deviations / decisions
- **Cross-org per-user feed** (one bell across all orgs) rather than org-scoped — standard inbox model; each row deep-links via its slug.
- **`comment_edited` is in-app only** (catalog said in-app+email) — emailing on every edit is noise / below industry standard. Documented.
- **@mention notifications deferred** — no mention parsing in v2; new-comment still notifies reporter + assignee.
- **`reporter_changed` not wired** — the API has no editable reporter field.
- **removed-from-org** still writes an in-app row (feed is per-user/global so the user sees it) **and** always emails.

### Verification
- Backend `tsc --noEmit` clean; `vitest run` **26/26 pass**; rendered all **15 templates** → channel/flag consistency OK.
- Frontend `tsc` clean for all notification code. (One unrelated **pre-existing** error — `EpicTag` in `board/page.tsx` from the concurrent Pins/epic work — will block `next build` until that feature's author fixes it.)

### Docs updated (same pass, per CLAUDE.md)
- `backend/Api-Documentation/` — `notifications-api/` (6 endpoint pairs) + README inventory.
- `backend/guide - db.md` — tables + migration 014.
- `backend/guide - backend.md` — module + route map.
- `Guide/dev-notifications.md` — **implementation-status** section (live now / deviations / deferred).
- `frontend/guide - frontend.md` — notifications hook + bell + prefs.
- `Guide/v2-plans.md` — Phase 3 marked ✅/⏳ per item.

> Note: a parallel **Pins** feature (`user_pins`, 4 endpoints) landed during this session by other work — left intact; our migration 014 and API count edits coexist with it.

## What's next
- **User tests the notifications feature tomorrow** (restart backend so migration 014 runs on boot; bell populates as tickets are assigned, comments added, roles changed, etc.).
- Deferred, in rough order of self-containedness: **cron sprint-start opt-in alert** (per-domain table + node-cron; service is drop-in) → **mobile push (FCM)** backend + handoff → **subscription-event triggers** (Phase 4 billing).
- Pre-prod: fill the legal placeholders + lawyer review; stand up `support@`.
