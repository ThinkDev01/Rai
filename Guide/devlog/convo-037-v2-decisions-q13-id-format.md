# Convo 037 — v2 Q13 Locked: ID Format

**Date:** 14 May 2026

---

## What happened

Second decision of the session, immediately after Q12. Walked through the per-table ID format choices for v2. User asked to be shown what IDs v1 actually uses significantly (not just "every table has an id") so they could reason from concrete usage — good instinct, avoided abstract debate.

---

## The framing

Read the migrations to map v1's current ID landscape:

| Table | v1 PK | Type | User-visible? |
|---|---|---|---|
| `users` | `id` | SERIAL | Never in URL |
| `projects` | `id` | SERIAL | Yes — `/projects/${id}/...` |
| `projects` | `key` | VARCHAR(10) | Yes — prefix for ticket keys |
| `sprints` | `id` | SERIAL | Yes — `/projects/${id}/sprints/${sprint.id}` |
| `tickets` | `id` | SERIAL | No |
| `tickets` | `key` | VARCHAR(20) | Yes — `/projects/${id}/tickets/${ticket.key}` |
| `comments` | `id` | SERIAL | Never |
| `project_members` | `id` | SERIAL | Never; (project_id, user_id) is the natural key |
| `ticket_status_history` | `id` | SERIAL | Never |

Tables added in v2: `organizations`, `user_orgs`, `subscriptions`.

Hard constraint: `users.id` MUST be UUID v4 because Cognito's `sub` claim is UUID v4.

---

## What got proposed and rejected

**User's first guess: composite `acme-{uuid}` for org IDs.**

Rejected on two grounds:
1. **PKs must be stable.** If "Acme" rebrands or sells, the prefix should change — but PKs can't change without rippling through every FK in 12 tables.
2. **One column, one job.** Database wants opaque/stable; humans want readable/mutable. Cramming both means neither does its job.

**Industry pattern cited:** Linear, Notion, Slack, GitHub orgs, Stripe — all use opaque UUID PK + separate mutable `slug` column. URLs use the slug; FKs use the UUID. User agreed.

---

## What got locked

**Per-table format (final):**

| Table | PK | Type | Other ID columns |
|---|---|---|---|
| `users` | `id` | UUID v4 (from Cognito `sub`) | `email` unique |
| `organizations` | `id` | UUID v7 app-side | `slug VARCHAR(63)` unique |
| `subscriptions` | `id` | UUID v7 app-side | — |
| `user_orgs` | composite `(user_id, org_id)` | both UUID | `role` enum |
| `projects` | `id` | BIGSERIAL | `key VARCHAR(10)` unique per org |
| `sprints` | `id` | BIGSERIAL | — |
| `tickets` | `id` | BIGSERIAL | `key VARCHAR(20)` unique per project |
| `comments` | `id` | BIGSERIAL | — |
| `project_members` | composite `(project_id, user_id)` | int + UUID | `role` enum |
| `ticket_status_history` | `id` | BIGSERIAL | — |

**Companion uniqueness changes from v1:**
- `projects.key`: was `UNIQUE (key)` globally → becomes `UNIQUE (org_id, key)`. Two orgs can both have a "PROJ".
- `tickets.key`: stays `UNIQUE (project_id, key)` — same as v1. User initially thought it should be `UNIQUE (org_id, key)`, but discussion concluded the chain `tickets → projects → orgs` means `project_id` already encodes the org; adding `org_id` to the constraint would be redundant.

---

## UUID v7 — app-side, not DB extension

UUID v7 (time-ordered) preferred over v4 for tables we control because it inserts cluster better in B-tree indexes (~10–30% improvement at huge scale).

Postgres 16 (current Docker image) doesn't have native `uuidv7()` — that's PG 18+. Two options weighed:

- **DB extension `pg_uuidv7`** — supported on AWS RDS PG 16.2+, but: `CREATE EXTENSION` per DB, parameter group config, every new env needs to remember it. Real infra burden, gets in the way of the Docker → RDS migration (Q8).
- **App-side via `uuidv7` npm package** — generate in `orgs.service.ts` and `billing.service.ts` before INSERT, pass as parameterized arg. Zero DB dependency, identical storage and performance, easy to mock in tests.

**Locked: app-side.** Package details:
- Pinned to exact version in `package.json` (no `^`).
- Imported only in the two services that mint new orgs/subscriptions.
- Unit test asserts generated IDs are valid UUID v7.
- Authored by LiosK (UUID v7 RFC co-author), ~250k weekly downloads, zero dependencies, frozen spec.

When we upgrade to Postgres 18 later, swap to native `gen_uuidv7()` if desired — but app-side keeps working indefinitely. No forced revisit.

---

## BIGINT handling in Node

`BIGSERIAL` is 8 bytes; JS `Number` safe to `2^53 - 1` (~9 quadrillion). The `pg` driver returns BIGINT (OID 20) as a string by default to preserve precision.

Two options:
- **Keep as string** — fully safe, but every controller, URL builder, React key, and sort treats IDs as strings. Death by paper cuts.
- **Cast to number at driver level** — `pg.types.setTypeParser(20, (val) => parseInt(val, 10))` once at app startup. Risk is theoretical (10^15+ rows in one table to lose precision); convenience is real.

**Locked: cast to number.** One line in `backend/db/pool.ts` at startup; standard practice across Postgres + Node shops. Codified in `standards.md` §2.

---

## Discussion notes

- User asked good clarifying questions throughout — wanted to understand *why* `acme-{uuid}` was wrong (not just "trust me"), *what* a Postgres extension actually is, *how* the driver cast works mechanically. Each got a concrete answer with code where relevant.
- The "extension vs app-side" call was the user's instinct after I laid out the trade-offs ("only extension is there, no other issues?"). Honest answer: extensions do touch RDS parameter groups and per-DB enabling, so app-side is genuinely cleaner.
- User specifically asked for reliability assurance on `uuidv7` package. Captured the package's provenance and the three-step "stay bug-free" hygiene (pin version, single import path, unit test).
- The `projects.key` global → per-org uniqueness change was flagged during the format discussion, not pre-planned — caught by reviewing v1 schema. Trivial schema consequence but real if missed.

---

## Doc state at session close

- `docs/v2-decisions.md` — Q13 rewritten from PENDING to fully locked, with per-table format table, UUID v7 app-side rationale, BIGINT parser config, and uniqueness scope notes. Status list updated.
- `docs/standards.md` — two new entries in §2:
  - **BIGINT → JS number at the driver level** (one-liner pg type parser config)
  - **ID generation: UUIDs are app-side, not DB-side** (no `CREATE EXTENSION pg_uuidv7`, no `gen_random_uuid()` defaults in migrations)
- `docs/devlog/convo-037-*.md` — this file.

---

## v2 decisions status at session close

- ✅ **All 16 locked** — Q1–Q16

🎉 **Decision phase complete.** No deferrals remain.

---

## Resume context (next session)

Per the build plan locked at the end of convo-035:

1. **Phase re-sequencing conversation** (next) — now that all decisions are locked, sequence the v2 build into concrete phases. Inputs:
   - Q1–Q11, Q14 give the scope (Cognito, multi-tenant, billing, retention).
   - Q12 gives the module layout (auth/orgs/billing as service-exposing modules).
   - Q13 gives the schema shape (per-table ID format, slugs, uniqueness).
   - Q4 says drop-and-reseed at staging cutover.
   - Q16 flags `org_id` index audit as part of the migration work.
2. Frontend shell first → APIs to match → manual testing → happy path testing → automated edge cases → `/security-review` → staging → production.

Microsoft + Google SSO already locked into Phase B from convo-035.
