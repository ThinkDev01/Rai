# Convo 031 — v2 Decisions Q3–Q16 Bulk Lock

**Date:** 5 May 2026

---

## What was discussed

Walked through 14 of the remaining 16 v2 architecture questions. User answered most in a single batch; deferred the four billing-adjacent questions (Q10, Q11, Q12, Q14) to a dedicated future conversation. One sub-decision (Q13 ID format) left pending user confirmation between mixed and all-UUID.

---

## Decisions locked

### Q3 — Tenant isolation: middleware-only for v2

**Locked: A — middleware-only.** RLS deferred to `upgrades.md` as defense-in-depth, layered on once middleware is proven solid in staging (within the same v2 cycle).

Reason: cleaner debugging path during early v2 (a query returning empty has one possible source, not two). Both walls active before anything ships to production.

### Q4 — Existing v1 staging data: drop and reseed

**Locked: A — drop and reseed.** Internal staging only ~10 fake test users. Fresh v2 schema from scratch — no nullable→NOT NULL backfill needed. v1 EC2 instance kept on the side for 30 days as legacy reference, then wiped.

### Q5 — Org admin vs project admin: two tiers

**Locked: A — two tiers.** Existing v1 role names preserved (`admin`, `project_manager`, `user`); semantics expand to be org-aware in v2.

- `admin` = org admin (Jira "Site Admin" equivalent) — full org control, only role that can change `role_type`
- `project_manager` = project admin (Jira "Project Admin") — project settings, members, sprints, tickets within their projects
- `user` = regular member — works on tickets in projects they're a member of

Industry parallels: Jira (Site/Project Admin), GitHub (Owner/Admin/Member), Slack (Owner/Admin/Member), Notion (Owner/Admin/Member). All two-tier.

### Q6 — Invite flow: single token, two paths

**Locked: A — single token, two paths.**

- v2 ships **email invite only**: 7-day TTL, single-use token. Link `rai.app/invite/<token>`. Three paths handled (signed in, signed out with account, no account → signup).
- Code-based join (Discord-style) **deferred to a later release**, parked in `upgrades.md`. **Refinement:** 24-hour auto-refreshing code (auto-rotates server-side every 24 hours to limit leak blast radius) instead of static 7-day code.

Pre-creating ghost users on invite (option B) rejected — adds cleanup burden.

### Q7 — Email verification: verify before any org action

**Locked: A.** Sign-in itself is blocked until email is verified. Implementation under Cognito = a pool toggle (no code).

### Q8 — RDS migration timing: Docker → fresh RDS at staging cutover

**Locked: B (refined).**

1. Develop v2 in local Docker Postgres.
2. Deploy v2 to staging EC2 → fresh RDS Postgres 16 + fresh Cognito `rai-staging` pool + run migrations.
3. v1 instance stays on the side for 30 days as legacy reference.
4. After 30 days: wipe v1 (Docker volumes, EBS snapshots).

Same Postgres major version (16) across local Docker and RDS — plain SQL migrations port without changes. Combining schema overhaul + RDS migration into one cutover is OK because the schema is fresh (Q4 = drop and reseed) — no data migration step.

### Q9 — Cognito pool: single pool with custom attribute

**Locked: A.** Already implicitly locked at Q1 when AWS Cognito was chosen. `custom:current_org_id` user attribute distinguishes orgs.

### Q13 — Migration order: drop and recreate from scratch

**Locked (migration order): B — drop staging data, recreate schema with `org_id NOT NULL` from the start.** Locked because Q4 = drop and reseed; no incremental backfill needed.

**Pending (ID format):** awaiting user confirmation between two options:
- **Mixed (recommended):** UUID for `users.id` (Cognito `sub` requires it), UUID + slug for `organizations.id`, BIGSERIAL kept for tenant entities (`projects`, `sprints`, `tickets`, `comments`) since they're tenant-scoped behind `org_id`.
- **All-UUID:** UUIDs everywhere. Slight cost: ~10–15% bigger indexes, more migration churn from v1's BIGSERIAL.

### Q15 — Last admin leaves: block + "contact support" message

**Locked: A.** Backend rejects `DELETE /orgs/:id/members/me` with `last_admin_cannot_leave` if user is the only `admin`. UI shows "contact support" message.

Possible future UX enhancement (parked for product consideration): dual-path UI offering self-service "promote another member, then leave" alternative.

### Q16 — `org_id` index audit: action item

**Locked.** Required indexes per tenant table:
- Single-column index on `org_id`
- Composite indexes for common query paths: `(org_id, status)`, `(org_id, project_id)`, `(org_id, assignee_id)`, `(org_id, created_at DESC)`, etc.

Process:
- Every migration that adds `org_id` includes the relevant composite indexes.
- After staging launch, run `EXPLAIN ANALYZE` against slow-query log for ~1 week to catch missed composites.
- Some v1 indexes may become redundant under `org_id`-prefixed composites — drop in follow-up migration.

---

## Deferred to a dedicated billing/subscription conversation

**Q10** (free trial card on file), **Q11** (subscription expiry — read-only grace vs hard lock vs soft warn), **Q12** (service layer decomposition — TenantService / AuthService / BillingService), **Q14** (org deletion — hard vs soft + retention) — all four billing-adjacent decisions tied together; handled in a focused session, not piecemeal.

---

## Doc updates

`docs/v2-decisions.md`:
- Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q15, Q16 — full decisions + discussion notes added.
- Q13 — migration-order half locked; ID-format half pending user confirmation.
- Q10, Q11, Q12, Q14 — marked DEFERRED with cross-references.
- "How to use this doc" section: status table updated to show all 12 closures + 4 deferrals; capture convention codified.

`docs/upgrades.md`:
- Code-based org invites entry — refined spec to **24-hour auto-refreshing** (was static 7-day).

---

## Status

| Status | Count | Questions |
|---|---|---|
| ✅ Locked | 11 | Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q15, Q16 |
| ⚠️ Partial | 1 | Q13 (migration order locked; ID format pending) |
| 🔜 Deferred (billing batch) | 4 | Q10, Q11, Q12, Q14 |

12 of 16 effectively closed. After Q13 ID format confirms + the billing conversation lands, all 16 are done and the dedicated phase-planning conversation begins.

---

## What's next

1. User confirms Q13 ID format (mixed vs all-UUID).
2. Schedule billing/subscription conversation for Q10/Q11/Q12/Q14 (interconnected — handle together).
3. After all 16 lock: dedicated phase-planning conversation re-sequences work into concrete phases.
