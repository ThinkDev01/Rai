# Convo 049 — RBAC pass + v1 walk-through items 1-12 + team folder + product-decisions doc

**Date:** 16 May 2026

---

## What happened

Continuation session after RF-16 closed out the rapid-fire round (convo-048). Covered five major workstreams in one continuous session:

1. **RBAC core pass** — locked the 4-tier role model (owner > admin > PM > user), project visibility matrix (private/public × in/not-in per role), ticket two-slot operational model (reporter + assignee mutable, created_by immutable audit), orphan-ticket exception, admin self-demote allowed under owner-tier invariant. Schema implications captured.

2. **v1 functional-issue walk-through items 1-12** — triaged 12 of 21 items. 3 ACCEPTs (items 5, 7, 10), 8 REJECTs (items 1, 2, 3, 6, 8, 9, 11-app-part, 12), 1 CARRY-OVER (item 4). Item 11 split: REJECT in-app legend + ACCEPT as user-guide deliverable for post-build doc cleanup phase.

3. **Doc structure expansion** — created `docs/team/` folder for human-shareable docs (README + copies of v2-plans, rbac, standards, upgrades). Created `docs/v1-feedback-triage.md` as the canonical "what was decided about v1 feedback" tracking doc. Created `docs/team/product-decisions.md` as plain-language "why Rai works this way" user-facing rationale doc.

4. **Plan refinement** — locked the post-walk-through sequence: app + infra review → phase re-sequencing → build kickoff (app shell mock-first → infra setup with Cognito/RDS/SES/CloudWatch+SNS → APIs phase-wise → testing layers per-phase → full happy-path → automation/edge-case → security review → developement + staging merge → prod merge → tag v2.0.0 → doc cleanup as step 10).

5. **Git workflow + time estimates** — user opted for simple single-branch workflow (commit current state + work on v2 branch + merge to developement at end). I pushed back honestly on the "v2 in 3-4 days" assumption — realistic range is 2-3 weeks of autonomous build sessions. Logged feedback memory `feedback_v1_stays_as_is` capturing the directive that v1 stays untouched during v2 development.

---

## Locked decisions this session

### RBAC core (4-tier model)

- **Roles:** owner > admin > project_manager > user. Owner DB-enforced via partial UNIQUE index `user_orgs(org_id) WHERE role = 'owner'`. Owner always = admin (`owner ⊇ admin`).
- **Owner transfer:** 2-step demotion (owner → admin → optionally user). Owner can't leave without transferring first.
- **Owner-only:** delete org. v3 adds OTP gate for ownership transfer (parked).
- **Admin self-demote / cross-demote:** allowed (owner-tier guarantees ≥1 admin invariant).
- **Project visibility matrix:**
  - Private: admin = full, PM-in = full, PM-not-in = read-only + "contact admin" toast, user-in = full per role, user-not-in = invisible.
  - Public: admin = full, PM-in/not-in = full (membership irrelevant), user-in = full per role, user-not-in = read-only + "contact PM" toast.
- **Ticket operational rights** (status, change reporter, change assignee, edit title, edit description): current reporter + current assignee + PM-in-project + admin.
- **Ticket content rights** (comment, create): any project member.
- **Orphan ticket exception:** when both `reporter_id` and `assignee_id` are NULL, any project member can claim → becomes both reporter and assignee in one action.
- **Schema implications:** `user_orgs.role` enum extended to 4 values; partial UNIQUE index for one-owner-per-org; `tickets.created_by` new immutable audit field; `tickets.reporter_id` becomes nullable (was NOT NULL in v1).

### v2 vs v3 visibility tightening (parked in upgrades.md)

- v3 strict-private-project mode: visible only to creator-admin + assigned PMs + members + owner. Other admins/PMs can't see. For sensitive HR/legal/M&A.

### Sprint actions added to rbac.md

| Action | Authority |
|---|---|
| Create / edit name / edit goal / start / close | admin + PM-in/on-public |
| Edit dates (not-started or active) | admin + PM-in/on-public |
| Edit dates (completed sprint) | locked in v2 (no edits) — v3 revisits with audit trail |
| Delete | TBD |

### v1 feedback items 1-12

| # | Status | Note |
|---|---|---|
| 1 | REJECT | User reconsidered — layouts seem fine. |
| 2 | REJECT | My Work + per-project activity cover it; all-projects-progression not a meaningful aggregate. |
| 3 | REJECT | Same as #2 — no aggregate project status. |
| 4 | CARRY-OVER | Members already in v1 overview. Preserve. |
| 5 | ACCEPT | Small line on overview: "Created by: X · PM(s): Y, Z, ..." |
| 6 | REJECT | Misread (was click-outside, not hover-outside); standard modal behavior is fine. |
| 7 | ACCEPT | Sprint dates editable in v2 for not-started + active sprints; completed locked. Schema add: `sprints.updated_by`. |
| 8 | REJECT | Misread — actual default shows project name, not "TEST Sprint". |
| 9 | REJECT | Strikethrough on done text is poor UX choice. |
| 10 | ACCEPT | Ticket creation allows status = `done` directly. Status dropdown defaults to `todo`. |
| 11 | REJECT in-app, ACCEPT as user doc | Icon legend goes into post-build user guide, not in-app. |
| 12 | REJECT | Cosmetic synonym; "Create" stays. |

### Plan sequence (locked)

1. Finish v1 walk-through (items 13-21 remaining)
2. App + infra review
3. Phase re-sequencing
4. Build kickoff:
   1. App Shell Full (mock-first)
   2. Infra setup (RDS + Cognito + SES + CloudWatch + SNS alert pipeline, by devops)
   3. API dev phase-wise
   4. Per-phase happy-path testing
   5. Full happy-path testing
   6. Automation + edge-case testing
   7. Security testing (`/security-review`)
   8. Developement + staging merge, staging shakedown
   9. Prod merge + tag v2.0.0
   10. Doc cleanup + restructure (post-prod)

### Feedback memory locked

- `feedback_v1_stays_as_is.md` — v1 is tried-and-tested fallback; v2 work happens on a separate branch (`v2-predev` backup + new v2 branch on top); `developement` branch frozen during v2 work; v1 instance stays running for 30 days as legacy reference.

---

## What landed where

**New docs created:**
- `docs/rbac.md` — overwrote v1 RBAC doc with v2 RBAC guide (4-tier, project/ticket/sprint action tables, visibility matrix, orphan-ticket exception, schema implications, v3 deferrals).
- `docs/v1-feedback-triage.md` — canonical "v1 feedback decisions" doc; 12 items decided + 9 pending.
- `docs/team/` folder — README + copies of v2-plans, rbac, standards, upgrades. Team-shareable subset.
- `docs/team/product-decisions.md` — plain-language "why Rai works this way" user-facing rationale doc.
- `docs/devlog/convo-049-*.md` — this file.

**Modified:**
- `docs/v2-decisions.md` — Q5 implicitly extended (4-tier from 3-tier) per RBAC pass. Q13 already revised under RF-16 lock.
- `docs/standards.md` §3 — new "Responsive web is baseline, not a separate phase" entry.
- `docs/upgrades.md` — added 3 RBAC parks (OTP for ownership transfer, strict private-project visibility, per-project role override).
- `docs/v2-plans.md` Phase E — corrected stale "Third-party login (Google, GitHub)" entry (Google + MS already in v2 per RF-7; GitHub stays in v3).

**Memory updates:**
- `project_v2_multitenant.md` — refreshed to reflect rapid-fire complete + RBAC core locked + v1 walk-through active + `docs/rbac.md` + `docs/v1-feedback-triage.md` + `docs/team/` added to doc structure list.
- `feedback_v1_stays_as_is.md` — new feedback memory.
- `MEMORY.md` — index updated with the new feedback entry.

---

## Resume context (next session)

User will continue with **item 13** of v1 feedback walk-through.

Remaining 9 items (13-21):
- **13.** Slide-left animation needs improvement in ticket selection
- **14.** "type: all types" → "type: all" wording
- **15.** Non-rounded squares for report color indicators
- **16.** Project click: options below instead of new screen navigation
- **17.** Completed sprint should not auto-archive *(user has effectively asserted this is the v2 lock; confirm surrounding behavior)*
- **18.** Archive confirmation + retrievability
- **19.** Auto-start sprint on assigned date?
- **20.** Project settings visibility — already SETTLED-ELSEWHERE per rbac.md; just confirm
- **21.** "Danger zone" naming + confirmation dialogs for archive/delete

After v1 walk-through completes: app + infra review → phase re-sequencing → build kickoff per the locked sequence above.

---

## Standing notes

- v1 stays untouched during v2 work per `feedback_v1_stays_as_is`. All v2 changes happen on `v2` branch on top of `v2-predev` backup snapshot.
- Devops handles infra setup (Cognito + RDS + SES + CloudWatch + SNS); spec sheet gets drafted when we hit infra discussion phase.
- User-guide doc (icon meanings, filter usage, keyboard shortcuts, etc.) deferred to post-prod doc cleanup phase per item 11 lock.
- `docs/team/product-decisions.md` will keep growing as more user-facing decisions surface during walk-through and build.
