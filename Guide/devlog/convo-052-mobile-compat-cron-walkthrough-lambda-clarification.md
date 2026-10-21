# Convo 052 — Mobile compat from v2 + cron walkthrough + EventBridge/Lambda clarification

**Date:** 16 May 2026

---

## What happened

Continuation from convo-051. User asked clarifying questions on the notifications architecture:

1. **Where does `notify()` get called from?** — service layer of triggering module (not controller, not model). Walked through file-by-file using ticket status change as the example.
2. **EventBridge + Lambda — only for cron, or also event-triggered?** — only for cron. Lambda is a thin trigger that hits a backend internal endpoint; notifications logic stays in backend. No duplication.
3. **In-app channel — web-only?** — platform-agnostic. Web and mobile both read from the same `notifications` table. Mobile-specific addition is `push.channel.ts` (v3 only).
4. **Mobile-API-compatible from v2?** — user explicitly committed: v2 APIs designed mobile-compatible from day one so v3 mobile team needs zero backend rework. Codified in standards.md.
5. **Web vs mobile request detection?** — usually not needed (notifications driven by user prefs, not request origin). `X-Client-Type` header convention added for analytics / feature flags.
6. **Manage-devices feature in v3 — save device info now?** — minimum v2 schema (5 columns); extend in v3 as the manage-devices UI lands.
7. **node-cron file structure walkthrough** — file-by-file with concrete code snippets.

User confirmed understanding throughout, including the EventBridge + Lambda nuance: cron.ts → EventBridge; job *logic* stays in backend (behind internal endpoints); Lambda is just a thin trigger.

Wrapped session for resumption "after some days" — next session begins app + infra review.

---

## Locked decisions

### `notify()` caller pattern

**Always from the service file of the triggering module.** Codified in `docs/notifications.md` "Where `notify()` gets called from" section.

| Layer | Calls notify()? |
|---|:-:|
| `<module>.controller.ts` | – |
| `<module>.service.ts` | ✓ |
| `<module>.model.ts` | – |

All templates live in `notifications/templates/` regardless of which module triggers them.

### Mobile-API-compatibility from v2 (codified in standards.md §3)

Even though native mobile is v3, v2 APIs designed compatible from day one:

1. **JWT/Bearer auth only** — no cookie-only endpoints.
2. **One endpoint per resource** — no `/web/...` vs `/mobile/...` forks.
3. **JSON-only responses** — no HTML rendering on the backend.
4. **`X-Client-Type` header convention** — frontend self-reports `web`/`ios`/`android`/`cli`. v2 logs it, may branch on it for analytics/feature flags; doesn't gate functionality.
5. **`POST /api/v1/devices/register` stub endpoint** — accepts `{device_token, platform}`, writes to `user_devices` table. ~10 lines in v2. v3's push.channel.ts reads from this table.

Result: v3 mobile team can build against v2 APIs with zero backend rework.

### v2 `user_devices` table — minimum stub schema

```sql
CREATE TABLE user_devices (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token  TEXT NOT NULL,
  platform      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_token)
);
```

5 columns. v3 extends with `device_name`, `model`, `os_version`, `app_version` as the manage-devices UI lands. ALTER TABLE ADD COLUMN — cheap, no migration pain.

### node-cron file structure (locked)

```
backend/
├── server.ts                          ← imports + calls startCron() on boot
└── jobs/
    ├── cron.ts                        ← single registration file
    ├── sprint-auto-start-job.ts
    ├── sprint-notification-job.ts
    ├── subscription-warning-job.ts
    └── invite-cleanup-job.ts
```

- `server.ts` calls `startCron()` once at startup.
- `jobs/cron.ts` registers every job + schedule with one line each: `cron.schedule('*/5 * * * *', sprintAutoStartJob)`.
- Each `<name>-job.ts` exports one function that: queries DB for due rows → for each, calls `notify()` → marks `fired_at = NOW()`.
- Adding a new job = new file + one register line in `cron.ts`.

### v3 EventBridge + Lambda evolution (clarification)

| v2 | v3 |
|---|---|
| `backend/jobs/cron.ts` (the schedule registrations) | AWS EventBridge rules (defined in AWS Console) |
| `backend/jobs/<name>-job.ts` (the actual logic) | **stays in backend** as `POST /api/v1/internal/fire-<name>` endpoint |
| (didn't exist) | **AWS Lambda function** ~10 lines: hits the backend internal endpoint on EventBridge's schedule |

**Job logic doesn't move to Lambda.** It stays in backend, behind internal HTTP endpoints. Lambda is the thin trigger layer only. Single source of truth for notifications logic preserved.

### v3 manage-devices UI (parked in upgrades.md)

Distinct from "Active sessions UI" (which is about Cognito auth sessions). This is about push notification delivery targets — list user's devices, show device details, revoke specific devices. v2 stub stores tokens; v3 adds the UI + schema columns for device names/models.

---

## What landed where

**Modified:**
- `docs/notifications.md` — added "Where `notify()` gets called from" section + "How v3 evolves the cron piece (without disrupting the notifications module)" section + "Mobile-compatible from day one (v2)" section.
- `docs/standards.md` §3 — added "APIs are mobile-compatible from v2 day one" entry.
- `docs/upgrades.md` — added "Manage-devices UI (push notification device list per user)" v3 park.
- `docs/v2-plans.md` Phase D — expanded notification entry with build-phase checklist (the ~20-25 `notify()` wire-up sites + 3 cron jobs + preferences UI).
- `docs/devlog/convo-052-*.md` — this file.

**Not modified:**
- `docs/rbac.md` — no permission changes this session
- `docs/v1-feedback-triage.md` — already at 21/21 done
- `docs/team/product-decisions.md` — already extended in convo-051
- `docs/deployment.md` — infra not touched yet (next phase)

**Memory:** no new entries this session. `feedback_walkthrough_style.md` from convo-051 has been driving how I'm explaining things — confirmed working.

---

## Status going into next session

| Phase | Status |
|---|---|
| Q1–Q16 strategic | ✅ |
| RF-1 to RF-16 rapid-fire | ✅ |
| RBAC pass (all matrices + all TBDs) | ✅ |
| v1 feedback walk-through (21 items) | ✅ |
| Notifications architecture | ✅ |
| Scheduling pattern | ✅ |
| Mobile-API-compat commitment | ✅ |
| Background-jobs file structure | ✅ |
| EventBridge + Lambda v3 evolution clarified | ✅ |
| **App + infra review** | 🔜 NEXT |
| Phase re-sequencing | 🔜 |
| Build kickoff | 🔜 |

---

## Resume context (next session — possibly "after some days")

User explicitly wrapping: *"we will continue with the app + infra part after some days so save all the convo and relavant files and see you later."*

**Next session begins app + infra review.** Suggested topics (carried from convo-051's resume context):

1. Walk v1 codebase against locked v2 decisions — for each existing module (auth, users, projects, sprints, tickets, comments, etc.), call out: carry-over (as-is), retrofit (multi-tenant additions), rewrite (significant changes), drop (not needed in v2).
2. File structure for v2 backend — confirm modular monolith layout per Q12. Plan new modules (orgs, user_orgs, invites, billing, subscriptions, notifications, jobs). Confirm `backend/lib/` shape (retry, error-codes, cognito-retry, ses-client, db pool).
3. File structure for v2 frontend — org-aware routing, new pages.
4. Devops handoff spec sheet — Cognito user-pool config, RDS instance class, SES domain + templates, CloudWatch metric filters, SNS topic + subscribers, EC2 details.
5. Branch / git strategy — `v2-predev` backup + `v2` dev branch on top + freeze `developement` (per `feedback_v1_stays_as_is`).
6. Mock-first frontend approach — what mocks look like; AuthClient mock; swap to real Cognito after infra lands.

After app + infra review: phase re-sequencing (first time phase letters re-enter since rapid-fire), then build kickoff.

---

## Standing reminders for next session

- v1 codebase stays untouched during v2 work (feedback_v1_stays_as_is).
- Explanations in walkthrough style — file-by-file, plain language, define jargon (feedback_walkthrough_style).
- Devops handles infra setup; spec sheet drafted at start of infra discussion.
- No docs created during build phase outside the established structure (decisions.md, plans.md, standards.md, rbac.md, notifications.md, upgrades.md, team/ folder, devlog/).
