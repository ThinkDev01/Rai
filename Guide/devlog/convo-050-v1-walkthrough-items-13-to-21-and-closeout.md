# Convo 050 — v1 walk-through items 13-21 + RBAC TBD resolution + walk-through closeout

**Date:** 16 May 2026

---

## What happened

Continuation from convo-049. User walked items 13-21 in one batch, providing verdicts for each. Three rbac.md TBDs (project delete, sprint delete, ticket delete) needed resolution as a side effect — I proposed authority levels with reasoning. Item 19 (sprint auto-start) opened a small architectural question on cron-vs-event-trigger; recommended node-cron for v2 with EventBridge parked for v3.

By end of session: **all 21 v1 feedback items decided**, all three rbac.md TBDs resolved, sprint lifecycle clarified (planned → active → completed → archived with completion ≠ archive lock), background jobs pattern codified in standards.md, EventBridge alternative parked in upgrades.md, product-decisions.md extended with sprint auto-start + delete/archive sections.

---

## Locked decisions

### Items 13-21 verdicts

| # | Status | Note |
|---|---|---|
| 13 | DEFER-TO-BUILD | Animation clean enough; revisit at app shell phase. |
| 14 | ACCEPT | Rename filter label "All types" → "All". |
| 15 | REJECT | Rounded edges look better; stay. |
| 16 | REJECT | Separate page navigation is right; projects have too many sub-pages for inline. |
| 17 | ACCEPT | Completed sprints stay in sprint list with "Completed" tag at end. Manual-only archive moves to archive section. Lifecycle: `planned` → `active` → `completed` → `archived`. |
| 18 | ACCEPT | Confirmation dialogs for project + sprint archive. Unarchive supported (project from settings, sprint from sprint page) by admin + PM-in/on-public. |
| 19 | ACCEPT | node-cron in backend for auto-start. Opt-in notification at sprint creation OR via notification icon on sprint page with time picker. EventBridge parked for v3. |
| 20 | ACCEPT | Settings visible to all project members (read-only for non-PMs). Members section moves out of settings into its own page in project left menu. |
| 21 | MIXED | "Danger zone" name stays (industry-standard, GitHub). Confirmation dialogs for archive + delete accepted. Project delete uses typed-slug confirmation gate. |

### RBAC TBD resolutions

| TBD | Resolved authority | Confirmation pattern |
|---|---|---|
| Project delete | admin + PM-in/PM-on-public | **Typed-slug confirmation gate** (GitHub-style — user must type project slug to enable Delete button) |
| Sprint delete | admin + PM-in/PM-on-public | Simple yes/no confirmation |
| Ticket delete | admin + PM-in/PM-on-public **only** (reporter/assignee cannot delete) | Simple yes/no confirmation |

Reasoning for ticket delete being gated tighter than ticket operational rights: deletion removes the ticket from records permanently. The normal user-level "this is finished" path is status = `done`, not deletion. Deletion is reserved for cleanup of mistakes / duplicates and stays with PMs and admins.

### Sprint lifecycle (new lock)

States: `planned` → `active` → `completed` (default end) → `archived` (only if manually archived).

- Completed != archived. Completed sprints stay in the regular sprint list with "Completed" tag, sorted at end.
- Archive is a manual, deliberate action that moves the sprint to the archive section.
- Auto-start fires via scheduled job (node-cron) on planned start date. Manual start also available.

Schema implication (locked at schema design phase): either extend `sprints.status` enum to include `archived`, OR add `sprints.archived_at TIMESTAMP NULL` flag separate from status. The flag approach is cleaner (status stays as workflow state, archive is metadata).

### Project settings + members page restructure

- Settings visible to all project members (read-only for users; editable for admin + PM-in / PM-on-public).
- Members section relocates out of settings into its own page in the project left menu. Settings becomes focused on metadata / visibility / danger zone; members page becomes the dedicated team management surface.

### Background jobs pattern (codified in standards.md)

v2 uses `node-cron` inside the backend container as the canonical scheduler for:
- Sprint auto-start (item 19)
- Subscription pre-expiry emails (Q11)
- Invite expiry cleanup (RF-12)
- v3 retention deletion warnings (Q14)
- Any future recurring task

Same shape for each job: cron schedule → DB query for "rows ready to act on" → action + side effects → idempotent. v3 alternative (AWS EventBridge + Lambda) parked in upgrades.md with explicit trigger criteria (horizontal backend scaling OR 10+ jobs OR sub-minute latency tolerance).

---

## What landed where

**Modified:**
- `docs/v1-feedback-triage.md` — items 13-21 logged with statuses + impl notes. Walk-through marked complete (all 21/21 decided).
- `docs/rbac.md` — project actions table updated (view-settings row added, archive/unarchive/delete TBDs resolved with footnote ³). Sprint actions table updated (archive/unarchive added, delete resolved with footnote ⁷). Sprint lifecycle states section added. Ticket delete TBD ⁵ resolved (gated to PM + admin).
- `docs/standards.md` §2 — new "Background jobs (scheduled tasks)" entry.
- `docs/upgrades.md` — new entry: "AWS EventBridge + Lambda for distributed scheduled jobs" (v3 alternative to node-cron).
- `docs/team/product-decisions.md` — extended "Why doesn't completing a sprint archive it automatically?" section. New sections: "Will my sprint start automatically?" + "Can I delete a project, sprint, or ticket?"

**Not modified:**
- `docs/v2-decisions.md` — no new Q entry; sprint auto-start handled via standards.md pattern + impl note in triage.
- `docs/v2-plans.md` — Phase D notification system already mentioned; sprint start notification opt-in is a sub-feature of that, captured in impl note.
- `docs/deployment.md` — no infra change for v2 (node-cron runs in existing backend container).

**Memory:** no new memory entries this session. All decisions captured in docs.

---

## Status of the broader plan

✅ **Rapid-fire round** — all 16 RF + 16 Q decisions locked.
✅ **RBAC pass** — 4-tier model + project/ticket/sprint matrices fully locked, all TBDs resolved.
✅ **v1 feedback walk-through** — all 21 items triaged.

**Up next per the locked plan:**
1. App + infra review
2. Phase re-sequencing
3. Build kickoff:
   1. App Shell Full (mock-first)
   2. Infra setup (RDS + Cognito + SES + CloudWatch + SNS) — devops handles, spec sheet drafted at start of infra discussion
   3. API dev phase-wise
   4. Per-phase happy-path testing
   5. Full happy-path testing
   6. Automation + edge-case testing
   7. Security testing (`/security-review`)
   8. Developement + staging merge, staging shakedown
   9. Prod merge + tag v2.0.0
   10. Doc cleanup + restructure (post-prod)

---

## Carried action items (post-v1-walk-through state)

**Frontend pages new in v2 (beyond v1 carry-over):**
- Org switcher (top-right + dropdown with recency + search past 20 orgs)
- Org list / empty-state for users with 0 orgs (Create org or Wait for invite)
- Invite flow (no-account signup → email verify → auto-join)
- Pending invites section on Team page (with cancel)
- Members page in project left menu (separated from settings)
- Owner-aware Settings (delete org button gated to owner; settings layout split between metadata / visibility / danger zone)
- Project archive section + unarchive UI
- Sprint archive UI + unarchive
- Sprint creation with opt-in notification time picker
- Sprint notification icon on sprint page (modal with time picker)
- Banner system (4 copy variants: membership revoked / role changed / subscription expired / org deleted)
- Org-switch retry banner + Contact Support escalation
- Subscription expiry banner + reactivation CTA
- Billing page (admin only)
- 4-tier role displays in member lists

**Backend modules new in v2 (beyond v1 carry-over):**
- `backend/lib/retry.ts` — `withCognitoBackoff` + `withDbRetry`
- `backend/lib/error-codes.ts` — `MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`, `ORG_DELETED`, `ALREADY_MEMBER`
- `backend/modules/auth/cognito-auth.service.ts` — implements `AuthService` interface
- `backend/modules/auth/membership.resolver.ts` — `MembershipResolver` interface + `DbMembershipResolver`
- `backend/modules/invites/*` — create / revoke / list pending endpoints
- `backend/modules/orgs/*` — switch-org / switch-org/revert endpoints
- `backend/modules/billing/*` — subscription + invoice + reactivation flows
- `backend/modules/notifications/*` — in-app + email + opt-in sprint-start notifications
- `backend/jobs/` — node-cron schedulers (sprint auto-start, sub pre-expiry emails, invite cleanup)
- Tenant-scoping middleware (extends Q3 with role + sub status + org existence)

**Schema (locked at v2 first migration):**
- `users (id UUID v7 PK, email UNIQUE, external_auth_id UNIQUE, ...)` per RF-16
- `user_orgs.role` enum extended to 4 values: `owner`, `admin`, `project_manager`, `user`
- Partial UNIQUE index: `user_orgs(org_id) WHERE role = 'owner'`
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`
- `tickets.created_by BIGINT NOT NULL REFERENCES users(id)` immutable audit field
- `tickets.reporter_id` becomes nullable, FK to ON DELETE SET NULL
- `sprints.updated_by BIGINT REFERENCES users(id)` for audit trail
- `sprints` gains either status='archived' or `archived_at TIMESTAMP NULL` (schema design phase decides)
- `projects.archived_at TIMESTAMP NULL` for project archive
- Full hot-path index list per RF-14

**Infra (devops):**
- RDS Postgres 16 (staging cutover)
- Cognito user pool (single, with Google + MS federation enabled per RF-7)
- SES for Cognito-managed + app-sent emails
- CloudWatch + SNS alert pipeline per RF-8 (blocks prod cutover)
- EC2 + Docker per existing hosting plan

**Standards locked across all passes:**
- React Query keys start with `['org', orgId, ...]` (RF-6)
- Indexes on hot paths locked at first migration (RF-14)
- `MembershipResolver` swap-ready abstraction (RF-14)
- `AuthService.verifyAccessToken()` normalization contract + no-raw-provider-SDK rule (RF-16)
- `users.id` decoupled from external auth ID (RF-16; Q13 revision)
- Responsive web is baseline for all new pages (item 13 implicit + standards.md)
- Background jobs via node-cron in backend container (item 19; standards.md)

---

## Resume context (next session)

User starts **app + infra review** next.

Suggested topics during app+infra review:
- Existing v1 codebase walk-through against locked v2 decisions — what carries over vs what gets rewritten vs what gets dropped
- File structure decisions for v2 (modular monolith structure per Q12)
- Frontend folder structure for v2
- Devops handoff spec sheet drafted (Cognito config, RDS instance class, SES domain + templates, CloudWatch metric filters, SNS topic + subscribers)
- Branch / git strategy confirmation (v2-predev backup + v2 branch on top per user's plan)

After app+infra review: phase re-sequencing (phase letters re-enter), then build kickoff.
