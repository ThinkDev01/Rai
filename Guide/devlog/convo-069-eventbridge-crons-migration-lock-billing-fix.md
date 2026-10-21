# convo-069 — EventBridge Crons, Migration Lock & Auto-Renew Bug Fix

**TL;DR**
- Decided to move crons off in-process `node-cron` → **EventBridge** (the other dev's `RP-3` branch already did this via an **HTTP endpoint**, not the SSM→docker-exec we first sketched).
- Made migrations **multi-instance safe** with a Postgres **advisory lock** in `migrate.ts` (no env change; local/staging unaffected).
- Merged `RP-3` into backend `development/RazorpayIntegration`, fixed a typecheck error it introduced, documented the new `INTERNAL_JOB_SECRET`.
- Fixed a billing bug: **turning auto-renew OFF** before the first billing cycle returned a 500 → now a clean **422 `CYCLE_NOT_COMPLETE`**.
- **Next (tomorrow):** further testing, then push. EventBridge + ALB setup is config-only (no code left). Set `INTERNAL_JOB_SECRET` per env.

---

## 1. Crons → EventBridge (approach decided)

### The 4 cron jobs (IST)
| Job | Schedule | Manual command |
|---|---|---|
| sprint-autostart | hourly (`0 * * * *`) | `npm run jobs:sprint-autostart` |
| invite-cleanup | daily 03:00 | `npm run jobs:invite-cleanup` |
| billing-sweep | daily 03:15 | `npm run billing:sweep` |
| purge-orgs | daily 03:30 | `npm run purge:orgs` |

> `billing-sweep` runs two functions in one job: `sweepTrialWarnings()` then `sweepExpired()`.

### Two approaches considered
- **Initial sketch (SSM):** EventBridge → SSM Run Command → EC2 → `docker exec rai-api sh -lc '<npm cmd>'`. Works, but for prod multi-instance you must **tag one instance** so the job runs only once. Extra IAM/SSM plumbing.
- **Chosen (RP-3, HTTP endpoint):** EventBridge → ALB → backend `POST /api/v1/internal/jobs/:name`. **Why better:** the ALB forwards to **one** healthy target automatically → job runs **once** with **no tagging**, no SSM. Cloud-portable, easy to `curl`-test, logs flow through the normal request pipeline.

### Final flow (ALB)
```
EventBridge Scheduler (staging / prod)
  ↓  (on schedule, timezone Asia/Kolkata)
EventBridge Connection  → header  x-internal-secret: <INTERNAL_JOB_SECRET>
  ↓
EventBridge API Destination  → HTTPS POST
  ↓
ALB (TLS listener — public entry)
  ↓  forwards to target group (one healthy backend target)
docker rai-api  →  POST /api/v1/internal/jobs/<job-name>  →  runs the job
```

### EventBridge setup (per env, config-only — still to do)
- **1 Connection** — API-key auth, header `x-internal-secret` = the secret.
- **1 API Destination** — base URL = backend domain, method `POST`.
- **4 Schedules**, timezone `Asia/Kolkata`:
  - hourly → `/api/v1/internal/jobs/sprint-autostart`
  - 03:00 → `/api/v1/internal/jobs/invite-cleanup`
  - 03:15 → `/api/v1/internal/jobs/billing-sweep`
  - 03:30 → `/api/v1/internal/jobs/purge-orgs`
- **Harden (best practice):** ALB listener rule for `/api/v1/internal/jobs/*` → restrict source IP to AWS EventBridge ranges (secret + IP both).

---

## 2. What RP-3 changed (merged into backend dev)

- **Added** `jobs/jobs.routes.ts` → `POST /api/v1/internal/jobs/:name`.
  - Auth: `x-internal-secret` header, **constant-time** compare; missing secret → 503, bad secret → 401.
  - Overlap guard: in-flight job → **409** (not 5xx) so EventBridge does **not** retry.
  - `JOB_MAP` maps the 4 job names to their functions.
- **Mounted** in `app.ts` **before** the rate limiter (EventBridge is a trusted caller, must not be throttled).
- **Removed** in-process scheduler: deleted `jobs/cron.ts`, dropped `startCronJobs/stopCronJobs` from `server.ts`, removed `node-cron` + `@types/node-cron` from `package.json`.
- Job files: **comment-only** updates ("triggered by EventBridge"). **npm scripts kept** for manual runs.

### Fix applied after merge
- `jobs/jobs.routes.ts` failed `tsc` (Express 5 types `req.params` as `string | string[] | undefined`). Fixed: `const name = req.params['name'] as string;` (route is `/:name`, so it's always present). `tsc --noEmit` → clean.

### New env var
- **`INTERNAL_JOB_SECRET`** — shared secret for the job endpoints.
  - **Not** in the required-at-boot list (`config/env.ts`) → server boots fine without it; endpoint just returns 503 until set.
  - **Required** in staging/prod for crons to actually run. Same value in backend env + EventBridge connection header.
  - Documented in `backend/.env.example`.

---

## 3. Migrations — multi-instance safe (advisory lock)

- **Problem:** `runMigrations()` runs on **every** container boot (`server.ts`). With multiple prod instances booting together → race.
- **Fix:** wrapped the run in a Postgres **advisory lock** (`pg_advisory_lock(727101)`) on a dedicated connection, released in `finally` (auto-released by PG if the process dies).
  - Lock is enforced by **Postgres** (shared DB), so it serializes across separate instances/processes.
  - First instance applies migrations; the rest **wait**, then find everything in `schema_migrations` → no-op.
  - **Local/staging (single instance):** acquires instantly → zero behavioral change.
- **No env changes.**
- Can also run as a pipeline step (`npm run migrate`) — still safe, no double-apply.
- Doc: `backend/guide - db.md` "How migrations work".

---

## 4. Billing bug fix — auto-renew OFF before first cycle

- **Symptom:** turning auto-renew **off** → 500 "Could not update auto-renew".
- **Cause:** the off-path calls `provider.cancelSubscription(...)`; Razorpay throws **"no billing cycle"** if the first cycle hasn't completed. `cancel()` already guarded this (`CYCLE_NOT_COMPLETE`), but `setAutoRenew` did not → unhandled → 500.
- **Fix:**
  - `billing.service.ts` — wrapped the off-path cancel in the same `no billing cycle` guard → throws `CYCLE_NOT_COMPLETE` with a human message.
  - `billing.controller.ts` — maps `CYCLE_NOT_COMPLETE` → **422** + the message (mirrors `cancel()`).
  - `billing - docs.md` — documented the new 422 on `PATCH /billing/auto-renew`.
- **Verified:** `tsc --noEmit` clean.

### Related (not a bug)
- **₹5 charge on resubscribe** = the **Razorpay test Plan** amount. Recurring subs charge per `RAZORPAY_PLAN_ID` (the dashboard plan), **not** the DB `price_per_seat_inr` (migration 024 = ₹129). To charge ₹129, update the plan in the Razorpay dashboard.
- **Resubscribe charging** is correct behaviour — a cancelled Razorpay sub can't be un-cancelled, so resuming opens a fresh mandate (→ `RESUBSCRIBE_REQUIRED`, 409).
- **Cancel subscription** works normally (OTP minted + emailed, confirmed in logs).

---

## Repo state

- Backend repo (`Rai-Backend`) branch `development/RazorpayIntegration`: RP-3 merged + fixes above. Uncommitted working-tree changes: `jobs.routes.ts` typecheck fix, `migrate.ts` advisory lock, `billing.service.ts`/`billing.controller.ts` auto-renew fix, `.env.example`, `guide - db.md`, `billing - docs.md`.
- Tests: local run blocked by the **RDS safety guard** (local `.env` `DB_HOST` points at staging RDS) — expected; the pipeline runs them against local docker PG.
- `Guide/upgrades.md`: TODO note at top still reflects the SSM/docker-exec sketch — **update to the HTTP-endpoint approach** when revisiting.

---

## Next (tomorrow)
1. Further testing (billing flows, job endpoints via `curl` with the secret).
2. Commit + push backend; pull into monorepo dev branch.
3. EventBridge + ALB setup per env (config-only) + set `INTERNAL_JOB_SECRET`.
4. Update `Guide/upgrades.md` TODO from SSM → HTTP-endpoint approach.
5. Set the Razorpay dashboard plan to ₹129 (currently ₹5 test).
