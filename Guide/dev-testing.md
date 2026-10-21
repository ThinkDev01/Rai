# Rai — Testing Documentation

**Status (v2):** A **critical-path integration suite is now live** at `backend/tests/v2-api.test.ts` (auth, tenant isolation, RBAC, sprint state machine, ticket rules, visibility) — see §0 below. It runs in CI via the buildspec test gate. The exhaustive per-endpoint suite documented in §1–§11 is the **v1** suite; that code lives archived at `backend/tests/v1-archive/` (excluded from runs) and remains the template for broadening v2 coverage.

---

## 0. v2 critical-path suite (live)

The first v2 automated tests. One focused file covering what actually breaks production — not cosmetic UI behaviour.

**Files:**
- `tests/v2-api.test.ts` — the suite (26 cases across health, auth, orgs, tenant isolation, project RBAC/visibility, sprint state machine, tickets, comments, search). **Verified green** against a local Postgres (26/26 passing).
- `tests/mock-auth.ts` — `MockAuthService` injected via `setAuthService()`; no real Cognito call. A "token" is the user's sub; org is chosen per request via the `X-Org-Id` header (mirrors the frontend).
- `tests/helpers.ts` — `cleanDB()` (truncate between tests), `seedUser()` / `addMembership()` (direct seed, bypassing the SES invite flow), and `req()` (supertest builder with auth + org headers).

**What it asserts (the high-value rules):**
- **Auth** — no token / unknown token → 401; fresh user resolves via JIT.
- **Tenant isolation** — a project in org A is invisible (list + direct GET 404) under org B; non-members get 403.
- **RBAC** — plain `user` can't create projects or delete tickets; can create tickets/comments.
- **Sprint state machine** — planned→active, one-active-per-project (409), no revert-to-planned, no delete-while-active.
- **Tickets** — sequential key gen (`RAI-1`, `RAI-2`), assignee-must-be-member, type validation.
- **Visibility** — private projects hidden from non-members; archived projects read-only.

> ⚠ **Safety guard.** The suite DROP/CREATEs `rai_test_db` on startup. `tests/setup.ts` refuses to run unless `DB_HOST` is a **local** host — so it can never fire against the staging RDS in `.env`. You must create `backend/.env.test` (copy `.env.test.example`) pointing `DB_HOST=localhost`. Tests load `.env.test` first, so it wins over `.env`.

**Run locally (needs a local Postgres):**

```bash
# 1. one-time: a throwaway local Postgres on :5432
docker run -d --name rai-test-db -e POSTGRES_USER=rai_user \
  -e POSTGRES_PASSWORD=rai_password -p 5432:5432 postgres:16-alpine

# 2. one-time: point tests at it
cp backend/.env.test.example backend/.env.test

# 3. run
cd backend && npm test
```

**CI:** the buildspec test gate (`npx vitest run --passWithNoTests`) runs this automatically once devops adds a Postgres service to the CodeBuild project (see §10).

**Canonical testing doc.** The forward-looking v2 testing strategy lives here (next section). Scaling/capacity reference moved into `dev-standards.md` § 10 (Scaling & Capacity).

---

## v2 testing strategy — do before feature freeze

Tests come *after* the features settle, not before. While features change daily, automated tests would break constantly and slow us down. The plan below is what we add once the surface stops moving. **CI/CD itself is now in place** for v2 (CodePipeline + CodeBuild gates — see §10); the *test* gate is wired but dormant (`--passWithNoTests`) and activates when this suite lands.

**When to add:** after all core features are complete (Projects, Sprints, Tickets, Backlog).

**What to add** — layer / tool / coverage grid:

| Layer | Tool | Covers |
|---|---|---|
| Integration | Vitest + supertest | API endpoints hitting a real test DB *(most valuable)* |
| E2E | Playwright | Critical browser flows (login, create ticket, …) |
| Unit | Vitest | Pure functions only — not needed until logic complex |

> **Skip mocking the DB.** Tests hit a real PostgreSQL test instance — mock/prod divergence has burned projects before. Auth in tests runs through `MockAuthService`; the real Cognito path is exercised in dev (`rai-dev` pool) and CI integration tests (`rai-ci` pool that resets between runs).

**File structure (when the time comes):**

```
backend/tests/
  auth.test.ts        ← register, login, /me, edge cases
  projects.test.ts
  sprints.test.ts
  tickets.test.ts
frontend/tests/
  auth.spec.ts        ← Playwright: login, register, logout, expired-token redirect
```

**Edge cases to cover per module** (pre-written reference):

- **Auth** — duplicate email on register · wrong password · expired token · missing fields · `/me` with no token · `/me` with tampered token · cross-org token reuse (membership re-check)
- **Projects** — create with missing name · access another tenant's project (JWT org-scope) · delete non-existent
- **Tickets** — move to closed sprint · assign to non-member · status transition order enforcement

---

## v1 test suite (archived reference)

> **Was / Now:** the sections below (§1–§11 + the manual checklist) documented the **v1** automated suite (~185 cases, self-built JWT auth, no org scoping). **Now:** that code is archived at `backend/tests/v1-archive/` and no longer runs against v2. Kept verbatim as the coverage template for the v2 re-implementation described above.

## 1. Testing Philosophy

Tests exist to catch regressions before they hit users. For initial release, we focus on **backend API tests** — they verify every endpoint, every validation, every business rule, and every error path. This gives maximum coverage with minimum infrastructure.

What we test:
- Every API endpoint — happy path + all error paths
- Every validation rule — missing fields, invalid types, boundary values
- Every business constraint — RBAC, archived projects, sprint state machine, etc.
- Database integrity — transactions, cascades, constraints

What we skip for now (future phases):
- Frontend unit tests (React Testing Library) — UI correctness verified manually
- E2E browser tests (Playwright/Cypress) — valuable but high effort; deferred
- Load/performance tests — premature at current scale

---

## 2. Tools & Frameworks

| Tool | Purpose | Why |
|------|---------|-----|
| **Vitest** | Test runner + assertions | Fast, TypeScript-native, ESM-first, zero-config with TS |
| **Supertest** | HTTP request testing | Makes Express endpoint calls without starting a real server |
| **PostgreSQL (test DB)** | Isolated test database | Real database — no mocks, catches real SQL/constraint issues |
| **bcryptjs** | Already in project | Used to hash passwords in test seed data |
| **jsonwebtoken** | Already in project | Used to verify token responses in auth tests |

### Why not mocks?

We use a **real test database**, not mocked queries. Mocked DB tests pass when the SQL is wrong — we got this guidance early. The test DB runs the same migrations as production, so schema mismatches are caught immediately.

### Why Vitest over Jest?

- Native TypeScript/ESM support without babel transforms
- Same assertion API (`expect`, `describe`, `it`)
- 2-5x faster execution on TypeScript projects
- Single dependency (`vitest`) vs Jest's ecosystem (`jest`, `ts-jest`, `@types/jest`, babel config)

---

## 3. Test Database Setup

### Database

A separate PostgreSQL database `rai_test_db` is used. Same Docker Postgres instance, different database name.

```
DB_NAME=rai_test_db    (tests only)
DB_NAME=rai_db         (development)
```

### Lifecycle

```
Before all tests (global setup):
  1. Connect to PostgreSQL
  2. DROP and CREATE rai_test_db (clean slate)
  3. Run all migrations (001–016)
  4. Seed base test data (admin user, regular user, PM user)

Before each test suite:
  5. Clean all data tables (TRUNCATE CASCADE) — except schema_migrations
  6. Re-seed base test users

After all tests (global teardown):
  7. Close DB pool
```

This ensures:
- Every test suite starts with a known state
- No test depends on another test's side effects
- Migrations are verified every run

---

## 4. Test Structure

```
backend/
├── tests/
│   ├── setup.ts                 ← global setup: DB create, migrate, seed helpers
│   ├── helpers.ts               ← shared utilities: login, createProject, createTicket, etc.
│   ├── auth.test.ts             ← register, login, /me
│   ├── users.test.ts            ← list users, update role, delete user, RBAC
│   ├── projects.test.ts         ← project CRUD, visibility, archive, members
│   ├── sprints.test.ts          ← sprint CRUD, state machine, start/complete
│   ├── tickets.test.ts          ← ticket CRUD, status changes, parent/child
│   ├── comments.test.ts         ← add/delete comments, RBAC
│   ├── search.test.ts           ← search query, min length, access filtering
│   ├── my-work.test.ts          ← assigned tickets, cross-project
│   ├── reports.test.ts          ← burndown, sprint report, velocity
│   └── health.test.ts           ← health check, DB connectivity
├── vitest.config.ts             ← vitest configuration
```

### Naming Convention

- Files: `<module>.test.ts`
- Suites: `describe('MODULE — endpoint description', ...)`
- Tests: `it('should <expected behavior>', ...)`
- Negative tests: `it('should return 400 when <condition>', ...)`

---

## 5. Test Helpers

Shared utilities in `tests/helpers.ts` to avoid boilerplate:

| Helper | Purpose |
|--------|---------|
| `registerUser(name, email, password)` | Register + return token |
| `loginUser(email, password)` | Login + return token |
| `authHeader(token)` | Returns `{ Authorization: 'Bearer <token>' }` |
| `createTestProject(token, overrides?)` | Create project with defaults |
| `createTestSprint(token, projectId, overrides?)` | Create sprint with defaults |
| `createTestTicket(token, projectId, overrides?)` | Create ticket with defaults |
| `addMember(token, projectId, userId)` | Add user to project |
| `seedUsers()` | Create admin + PM + regular users, return all 3 tokens |

---

## 6. Running Tests

```bash
# Run all tests
cd backend
npm test

# Run a specific test file
npm test -- auth

# Run with verbose output
npm test -- --reporter=verbose

# Run in watch mode (re-runs on file change)
npm run test:watch
```

### npm scripts (backend/package.json)

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

### Frontend type check

```bash
cd frontend
npm run typecheck    # runs tsc --noEmit
```

---

## 7. Complete Test Plan

### 7.1 Health (`health.test.ts`)

| # | Test | Method | Expected |
|---|------|--------|----------|
| 1 | Health check returns ok | GET /api/health | 200, status: 'ok', db: 'connected' |

---

### 7.2 Auth (`auth.test.ts`)

**POST /api/v1/auth/register**

| # | Test | Expected |
|---|------|----------|
| 1 | Register with valid data | 201, returns token + user object |
| 2 | Register — missing name | 400 |
| 3 | Register — name too short (1 char) | 400 |
| 4 | Register — missing email | 400 |
| 5 | Register — email without @ | 400 |
| 6 | Register — missing password | 400 |
| 7 | Register — password too short (7 chars) | 400 |
| 8 | Register — duplicate email | 409 |
| 9 | Register — default role is 'user' | 201, role_type = 'user' |

**POST /api/v1/auth/login**

| # | Test | Expected |
|---|------|----------|
| 10 | Login with valid credentials | 200, returns token + user |
| 11 | Login — wrong password | 401 |
| 12 | Login — nonexistent email | 401 |
| 13 | Login — missing email | 400 |
| 14 | Login — missing password | 400 |
| 15 | Login — token contains correct user id | 200, decoded token matches |

**GET /api/v1/auth/me**

| # | Test | Expected |
|---|------|----------|
| 16 | Get current user with valid token | 200, returns user |
| 17 | Get current user — no token | 401 |
| 18 | Get current user — invalid token | 401 |

---

### 7.3 Users (`users.test.ts`)

**GET /api/v1/users**

| # | Test | Expected |
|---|------|----------|
| 1 | List all users (authenticated) | 200, array of users |
| 2 | List users — no auth | 401 |

**PATCH /api/v1/users/:id/role**

| # | Test | Expected |
|---|------|----------|
| 3 | Admin updates user role | 200, updated role |
| 4 | Update role — non-admin denied | 403 |
| 5 | Update role — cannot change own role | 403 |
| 6 | Update role — invalid role_type | 400 |
| 7 | Update role — missing role_name | 400 |
| 8 | Update role — user not found | 404 |
| 9 | Update role — invalid user id | 400 |

**DELETE /api/v1/users/:id**

| # | Test | Expected |
|---|------|----------|
| 10 | Admin deletes user | 200 |
| 11 | Delete user — non-admin denied | 403 |
| 12 | Delete user — cannot delete self | 403 |
| 13 | Delete user — user not found | 404 |

---

### 7.4 Projects (`projects.test.ts`)

**GET /api/v1/projects**

| # | Test | Expected |
|---|------|----------|
| 1 | Admin sees all projects | 200, includes private projects |
| 2 | Regular user sees only public + member projects | 200, filtered list |
| 3 | List projects — no auth | 401 |

**POST /api/v1/projects**

| # | Test | Expected |
|---|------|----------|
| 4 | Admin creates project | 201, full project returned |
| 5 | Creator auto-added as member | 201, members includes creator |
| 6 | Create — non-admin denied | 403 |
| 7 | Create — missing name | 400 |
| 8 | Create — invalid key format (lowercase) | 400 |
| 9 | Create — key too short (1 char) | 400 |
| 10 | Create — key too long (11 chars) | 400 |
| 11 | Create — invalid visibility | 400 |
| 12 | Create — duplicate key | 409 |

**GET /api/v1/projects/:id**

| # | Test | Expected |
|---|------|----------|
| 13 | Get project with full data (sprints, tickets, members, backlog) | 200 |
| 14 | Get project — not found | 404 |
| 15 | Get project — invalid id | 400 |
| 16 | Private project — non-member cannot access | 404 |
| 17 | Public project — non-member can access | 200 |

**PATCH /api/v1/projects/:id**

| # | Test | Expected |
|---|------|----------|
| 18 | Update project name | 200, name changed |
| 19 | Update project description | 200 |
| 20 | Update project visibility | 200 |
| 21 | Archive project | 200, archived = true |
| 22 | Update — non-admin denied | 403 |
| 23 | Update — archived project cannot be modified | 403 |
| 24 | Update — empty name | 400 |
| 25 | Update — no fields | 400 |
| 26 | Update — project not found | 404 |

**DELETE /api/v1/projects/:id**

| # | Test | Expected |
|---|------|----------|
| 27 | Delete project | 200, project gone |
| 28 | Delete — non-admin denied | 403 |
| 29 | Delete — not found | 404 |
| 30 | Delete — cascades to sprints and tickets | 200, children gone |

**POST /api/v1/projects/:id/members**

| # | Test | Expected |
|---|------|----------|
| 31 | Add member to project | 200, member in list |
| 32 | Add member — user not found | 404 |
| 33 | Add member — already a member | 409 |
| 34 | Add member — archived project | 403 |
| 35 | Add member — non-admin denied | 403 |

**DELETE /api/v1/projects/:id/members/:userId**

| # | Test | Expected |
|---|------|----------|
| 36 | Remove member | 200 |
| 37 | Remove member — not a member | 404 |
| 38 | Remove member — non-admin denied | 403 |

---

### 7.5 Sprints (`sprints.test.ts`)

**POST /api/v1/projects/:id/sprints**

| # | Test | Expected |
|---|------|----------|
| 1 | Create sprint | 201, sprint returned |
| 2 | Create — missing name | 400 |
| 3 | Create — duplicate name in project | 409 |
| 4 | Create — archived project | 403 |
| 5 | Create — regular user denied | 403 |
| 6 | Create — PM allowed | 201 |

**PATCH /api/v1/projects/:id/sprints/:sprintId**

| # | Test | Expected |
|---|------|----------|
| 7 | Update sprint name | 200 |
| 8 | Update sprint goal and notes | 200 |
| 9 | Start sprint (planned → active) | 200, status = 'active' |
| 10 | Start sprint — sets start_date if not set | 200 |
| 11 | Start sprint — another sprint already active | 409 |
| 12 | Complete sprint (active → completed) | 200, status = 'completed' |
| 13 | Complete sprint — moves incomplete tickets to backlog | 200, tickets have sprint_id = null |
| 14 | Complete sprint — done tickets stay in sprint | 200 |
| 15 | Cannot revert to planned | 400 |
| 16 | Cannot change completed sprint status | 400 |
| 17 | Sprint already in requested status | 400 |
| 18 | Update — sprint not found | 404 |
| 19 | Update — archived project | 403 |
| 20 | Update — no fields | 400 |

**DELETE /api/v1/projects/:id/sprints/:sprintId**

| # | Test | Expected |
|---|------|----------|
| 21 | Delete planned sprint | 200 |
| 22 | Delete — moves tickets to backlog first | 200, tickets in backlog |
| 23 | Delete — active sprint cannot be deleted | 400 |
| 24 | Delete — completed sprint cannot be deleted | 400 |
| 25 | Delete — admin only (PM denied) | 403 |
| 26 | Delete — sprint not found | 404 |

---

### 7.6 Tickets (`tickets.test.ts`)

**GET /api/v1/projects/:id/tickets/:key**

| # | Test | Expected |
|---|------|----------|
| 1 | Get ticket by key | 200, full ticket with comments + sub-tickets |
| 2 | Get ticket — not found | 404 |
| 3 | Get ticket — project not found | 404 |

**POST /api/v1/projects/:id/tickets**

| # | Test | Expected |
|---|------|----------|
| 4 | Create ticket with required fields | 201, key auto-generated |
| 5 | Create ticket with all fields | 201 |
| 6 | Create — auto-incrementing key (RAI-1, RAI-2, ...) | 201, sequential keys |
| 7 | Create — reporter is current user | 201, reporter matches |
| 8 | Create — default status is 'todo' | 201 |
| 9 | Create — with assignee (project member) | 201 |
| 10 | Create — assignee not project member | 400 |
| 11 | Create — with sprint | 201, sprintId set |
| 12 | Create — sprint not in project | 400 |
| 13 | Create — with parent ticket | 201, parentKey set |
| 14 | Create — parent ticket not found | 400 |
| 15 | Create — missing title | 400 |
| 16 | Create — invalid type | 400 |
| 17 | Create — invalid priority | 400 |
| 18 | Create — invalid status | 400 |
| 19 | Create — archived project | 403 |
| 20 | Create — status change logged in history | 201, history row exists |

**PATCH /api/v1/projects/:id/tickets/:ticketId**

| # | Test | Expected |
|---|------|----------|
| 21 | Update title | 200 |
| 22 | Update status | 200, status changed |
| 23 | Update status — change logged in history | 200, new history row |
| 24 | Update assignee | 200 |
| 25 | Clear assignee (null) | 200, assignee = null |
| 26 | Move ticket to sprint | 200, sprintId changed |
| 27 | Move ticket to backlog (null sprint) | 200, sprintId = null |
| 28 | Update multiple fields at once | 200 |
| 29 | Update — empty title | 400 |
| 30 | Update — invalid type | 400 |
| 31 | Update — invalid status | 400 |
| 32 | Update — assignee not member | 400 |
| 33 | Update — sprint not in project | 400 |
| 34 | Update — ticket not found | 404 |
| 35 | Update — archived project | 403 |
| 36 | Update — no fields | 400 |

**DELETE /api/v1/projects/:id/tickets/:ticketId**

| # | Test | Expected |
|---|------|----------|
| 37 | Delete ticket (admin) | 200 |
| 38 | Delete ticket (PM) | 200 |
| 39 | Delete — regular user denied | 403 |
| 40 | Delete — ticket not found | 404 |

---

### 7.7 Comments (`comments.test.ts`)

**POST /api/v1/projects/:id/tickets/:ticketId/comments**

| # | Test | Expected |
|---|------|----------|
| 1 | Add comment | 201, comment with author |
| 2 | Add comment — empty content | 400 |
| 3 | Add comment — ticket not found | 404 |
| 4 | Add comment — archived project | 403 |

**DELETE /api/v1/projects/:id/tickets/:ticketId/comments/:commentId**

| # | Test | Expected |
|---|------|----------|
| 5 | Delete own comment | 200 |
| 6 | Admin deletes any comment | 200 |
| 7 | PM deletes any comment | 200 |
| 8 | Regular user cannot delete other's comment | 403 |
| 9 | Delete — comment not found | 404 |

---

### 7.8 Search (`search.test.ts`)

**GET /api/v1/search?q=**

| # | Test | Expected |
|---|------|----------|
| 1 | Search finds tickets by title | 200, matching results |
| 2 | Search finds tickets by key | 200 |
| 3 | Search — query too short (1 char) | 400 |
| 4 | Search — no results | 200, empty array |
| 5 | Search — respects project visibility | 200, only accessible tickets |

---

### 7.9 My Work (`my-work.test.ts`)

**GET /api/v1/me/tickets**

| # | Test | Expected |
|---|------|----------|
| 1 | Returns tickets assigned to current user | 200, correct tickets |
| 2 | Includes project and sprint context | 200, nested objects present |
| 3 | No assigned tickets — empty array | 200, [] |
| 4 | Tickets from multiple projects | 200, cross-project results |

---

### 7.10 Reports (`reports.test.ts`)

**GET /api/v1/projects/:id/reports/burndown?sprintId=X**

| # | Test | Expected |
|---|------|----------|
| 1 | Returns burndown data for sprint | 200, points array |
| 2 | Empty sprint — empty points | 200, totalTickets = 0 |
| 3 | Burndown — invalid sprintId | 400 |
| 4 | Burndown — project not found | 404 |

**GET /api/v1/projects/:id/reports/sprint-report?sprintId=X**

| # | Test | Expected |
|---|------|----------|
| 5 | Returns completed + incomplete + removed lists | 200 |
| 6 | Sprint report — sprint not found | 404 |
| 7 | Sprint report — project not found | 404 |

**GET /api/v1/projects/:id/reports/velocity**

| # | Test | Expected |
|---|------|----------|
| 8 | Returns velocity data for all sprints | 200, array |
| 9 | No sprints — empty array | 200, [] |
| 10 | Velocity — project not found | 404 |

---

### 7.11 AI Agent Endpoints (`ai-agent.test.ts`)

**GET /api/v1/users/:id/tickets**

| # | Test | Expected |
|---|------|----------|
| 1 | Returns tickets across projects | 200, correct count |
| 2 | Empty array when no assignments | 200, [] |
| 3 | User not found | 404 |
| 4 | Invalid user id | 400 |
| 5 | No auth | 401 |
| 6 | Includes sprint and project context | 200, fields present |
| 7 | Ordered by status priority | in_progress first |

**GET /api/v1/projects/:id/tickets (filtered)**

| # | Test | Expected |
|---|------|----------|
| 8 | Returns all tickets in project | 200 |
| 9 | Filter by status | 200, only matching |
| 10 | Filter by type | 200, only matching |
| 11 | Filter by assigneeId | 200, only matching |
| 12 | Filter by priority | 200, only matching |
| 13 | Combine multiple filters | 200, intersection |
| 14 | Invalid status filter | 400 |
| 15 | Project not found | 404 |
| 16 | Empty result set | 200, [] |

---

### 7.12 Cross-cutting (`auth.test.ts` — middleware tests)

| # | Test | Expected |
|---|------|----------|
| 1 | Any protected endpoint — no token | 401 |
| 2 | Any protected endpoint — expired token | 401 |
| 3 | Any protected endpoint — malformed token | 401 |
| 4 | Role-restricted endpoint — insufficient role | 403 |

---

### 7.12 Frontend Type Check

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | All pages, hooks, types compile | `tsc --noEmit` | Exit code 0, no errors |

---

## 8. Test Data Conventions

### Base seed users (created before every test suite)

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin User | admin@test.com | password123 | admin |
| PM User | pm@test.com | password123 | project_manager |
| Regular User | user@test.com | password123 | user |

### Default test project

| Field | Value |
|-------|-------|
| Name | Test Project |
| Key | TEST |
| Visibility | public |

### Default test sprint

| Field | Value |
|-------|-------|
| Name | Sprint 1 |
| Start date | today |
| End date | today + 14 days |

### Default test ticket

| Field | Value |
|-------|-------|
| Title | Test Ticket |
| Type | task |
| Priority | medium |
| Status | todo |

---

## 9. What Tests Catch That Manual Testing Misses

- **Race conditions** in ticket key generation (advisory lock test)
- **Cascade integrity** — deleting a project/sprint properly cleans up children
- **RBAC gaps** — every role combination tested on every restricted endpoint
- **Archive enforcement** — archived projects are truly read-only across all mutation endpoints
- **Sprint state machine** — all invalid transitions rejected (e.g. completed → planned)
- **Boundary values** — 1-char name, empty strings, null vs undefined, NaN ids
- **Token handling** — expired, malformed, missing auth header

---

## 10. CI/CD Pipeline (buildspec gates)

The release pipeline runs every check automatically on push, before anything reaches production. The full architecture:

```
GitHub → CodePipeline → CodeBuild → ECR → SSM → EC2 (Docker + Nginx) → CloudWatch
```

### What we own vs what devops owns

The **only** file we (dev) write is `buildspec.yml` — one per repo (`backend/buildspec.yml`, `frontend/buildspec.yml`). It lists the *app* commands CodeBuild runs. Everything around it is devops infra.

| Stage | Owner | Notes |
|---|---|---|
| GitHub source / webhook | devops | repo trigger |
| CodePipeline (stage orchestration) | devops | infra config, not a script |
| **CodeBuild (the gates)** | **dev** | driven by `buildspec.yml` |
| ECR (image registry) | devops | IAM + repo |
| SSM → EC2 deploy | devops | deploy document |
| CloudWatch (logs/alerts) | devops | + RF-8 alert pipeline |

### The gate sequence (in `buildspec.yml`)

Runs top-to-bottom; **any failure kills the build** so a bad image never reaches ECR.

| # | Gate | Command | Blocks on |
|---|---|---|---|
| 1 | Install | `npm ci` | lockfile mismatch |
| 2 | Static check | `npm run build` (BE, tsc) / `npm run typecheck` (FE) | type errors |
| 3 | Tests | `npx vitest run --passWithNoTests` (BE) | failing tests |
| 4 | Dep audit | `npm audit --audit-level=high` | high/critical CVE in deps |
| 5 | Docker build | `docker build …` | build failure |
| 6 | Image scan | `trivy image --severity HIGH,CRITICAL` | high/critical CVE in image |
| 7 | Push | `docker push … ECR` | only runs if 1–6 pass |

### Two slots that are stubbed today (by design)

- **Static check slot is "lint" in name only.** No ESLint config exists yet in either repo, so we use the TypeScript compiler (`tsc`) as the static-analysis gate. Add ESLint later and swap the command — the slot is already there.
- **Backend test slot — suite exists, CI DB pending.** The v2 suite (`tests/v2-api.test.ts`, 26/26 green locally — see §0) is written and verified. `--passWithNoTests` stays on the gate until **devops adds a Postgres service** (or an `rai-ci` test DB) to the CodeBuild project + a `backend/.env.test` pointing at it, mirroring the local `rai_test_db` lifecycle in §3. Once that DB exists, the suite runs for real in CI. Frontend has **no test runner** — `tsc` typecheck is its only gate (Playwright E2E deferred → `upgrades.md`).

### CodeBuild env vars devops must set

`AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION`, `ECR_REPO`, plus (frontend only) every `NEXT_PUBLIC_*` — these are baked into the client bundle at build time and passed as `--build-arg`.

### Local dry-run (before handing to devops)

The gates are just npm/docker commands — run them locally to confirm a clean pass:

```bash
# Backend
cd backend && npm ci && npm run build && npx vitest run --passWithNoTests && npm audit --audit-level=high

# Frontend
cd frontend && npm ci && npm run typecheck && npm audit --audit-level=high
```

> The earlier GitHub-Actions sketch was a placeholder. The real pipeline is AWS CodePipeline + CodeBuild (above); tests are still run locally before each release until the v2 suite lands.

---

## 11. Total Coverage Summary

| Module | Endpoints | Test Cases |
|--------|-----------|------------|
| Health | 1 | 1 |
| Auth | 3 | 18 |
| Users | 4 | 13 |
| Projects | 7 | 38 |
| Sprints | 3 | 26 |
| Tickets | 5 | 40 |
| Comments | 2 | 9 |
| Search | 1 | 5 |
| My Work | 1 | 4 |
| Reports | 3 | 10 |
| AI Agent | 2 | 16 |
| Cross-cutting | — | 4 |
| Frontend typecheck | — | 1 |
| **Total** | **32** | **~185** |

Every endpoint has at minimum: one happy path test, one auth test, and one validation error test.


---

## Appendix — Manual Test Checklist (v1)

_Merged in from the former `test-manual.md` on 2026-06-02. v1 commands — the suite they run is now archived._

### Prerequisites

- PostgreSQL running locally (your existing Docker Postgres works fine)
- Credentials: `rai_user` / `rai_password` on `localhost:5432`
- Tests automatically create a separate `rai_test_db` database — your dev `rai_db` is never touched

### Backend tests

```bash
cd backend

# Full test suite (all 139 tests)
npm test

# Run a single test file
npm test -- auth
npm test -- projects
npm test -- sprints
npm test -- tickets
npm test -- comments
npm test -- search
npm test -- my-work
npm test -- reports
npm test -- health

# Watch mode — re-runs on file save (great during development)
npm run test:watch

# Verbose — shows each individual test name and result
npm run test:verbose
```

#### What happens when you run `npm test`

1. Creates `rai_test_db` database (drops if exists)
2. Runs all 16 migrations on it
3. For each test suite: truncates all data tables, seeds 3 test users (admin/PM/user)
4. Runs all test cases
5. Closes DB pool

#### Test duration

Full suite takes ~10-12 minutes due to bcrypt hashing (password creation for seed users in each suite). This is expected — bcrypt cost factor 12 is intentionally slow for security.

### Frontend type check

```bash
cd frontend

# Verify all TypeScript compiles without errors
npm run typecheck
```

This runs `tsc --noEmit` across all pages, hooks, types, and components. Takes ~10 seconds.

### Troubleshooting

**Tests fail with "connection refused"**
- Postgres isn't running. Start it: `docker compose up postgres-db -d`

**Tests fail with "database rai_test_db does not exist"**
- First run creates it automatically. If it fails, your DB user may not have CREATE DATABASE permission. Check with: `psql -U rai_user -d postgres -c "SELECT 1"`

**Tests timeout (hook timeout)**
- This can happen on slow machines. Increase timeout in `backend/vitest.config.ts` → `hookTimeout`

**Rate limit errors (429)**
- Should not happen — rate limiter is set to 10,000 in test mode. If you see this, check `NODE_ENV` is set to `test` in `tests/setup.ts`
