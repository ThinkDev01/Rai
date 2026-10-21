# Convo 041 — v2 Rapid-Fire RF-8 (DB ↔ Cognito sync failure reconciliation)

**Date:** 15 May 2026

---

## What happened

RF-8 locked. Three iterations of pushback from the user reshaped the original draft:

1. **Critical-vs-cosmetic split → dropped.** User: "if we treat cosmetic things as background thing and show users other things first it still results in bugs somewhere isn't it." Correct. Replaced with: all writes critical, one rule, no background-write category.
2. **Silent auto-heal → dropped.** User: "autoheal on next read seems dangerous." Correct. Replaced with: middleware-detected mismatches return `500 + structured log + alert`, ops fixes manually.
3. **Account-delete ordering → reversed to Cognito-first.** User: "in case of account delete its better to do it in Cognito first only nah?" Correct — Cognito-first locks the user out immediately, so the orphaned-DB window has no security exposure. Earlier draft had DB-soft-delete-first; that's gone.
4. **Compensation added.** User: "also if anything is done halfway we should rollback nah?" Correct — added best-effort compensation per flow (revert the Cognito side if DB exhausts retries), about 10 lines per flow. Only viable where the Cognito-side operation is reversible.

---

## Locked decision

**RF-8 → C + D + E + H + J.** Cognito-first universal rule + bounded retry + best-effort compensation + no silent auto-heal + all writes critical.

### Universal pattern

1. **Cognito-first.** Every cross-system write does Cognito then DB. No exceptions.
2. **`withCognitoBackoff` + `withDbRetry`** wrap each side. Both helpers in `backend/lib/retry.ts`, same retry shape (100ms → 300ms → 1s, ±20% jitter, max 3 retries).
3. **Best-effort compensation** if DB fails after retries. Per-flow viability:
   - Signup ✅ (`AdminDeleteUser(sub)`)
   - Org switch ✅ (revert `custom:current_org_id` to previous value)
   - Email change ✅ (revert attribute)
   - Account delete ❌ (Cognito `AdminDeleteUser` is destructive — can't recreate same `sub`)
   - Memberships N/A (DB-only)
4. **All writes critical.** No background-write split. Failures error the user-facing operation.
5. **No silent auto-heal.** Middleware returns `500 "Account state inconsistent"` + alert on detected mismatches.

### Reference code shape

```ts
async function signup(email, password) {
  const { sub } = await withCognitoBackoff(() => cognito.signUp(email, password));
  try {
    await withDbRetry(() => db.insertUser({ id: sub, email }));
    return { success: true };
  } catch (dbError) {
    try {
      await withCognitoBackoff(() => cognito.adminDeleteUser(sub));
      throw new BadRequestError("Signup failed, please try again.");
    } catch (rollbackError) {
      logger.error({ event: "signup_rollback_failed", sub, dbError, rollbackError });
      throw new InternalServerError("Signup failed, please contact support.");
    }
  }
}
```

Same shape for `switchOrg` and `changeEmail`. `accountDelete` skips the compensation try/catch.

### Ops alert pipeline (v2 infra setup phase)

- pino logs (`event: "*_rollback_failed"`, `event: "*_mismatch"`, `severity: "critical"`)
- → CloudWatch Logs on EC2 (unified agent)
- → metric filter on the marker pattern
- → CloudWatch alarm (threshold = 1 occurrence / 5-min window)
- → SNS topic
- → email to `diptanshu@novetum.com`

~1 hour one-time setup. Full steps captured in `deployment.md` under "v2 Infra Setup — Critical-error alert pipeline." **Must land before production cutover** — RF-8's manual-fix path assumes someone is notified.

---

## Rejected alternatives

- **Saga with full compensating actions** (Option A) — heavier per-flow code than D, and the recursive failure question ("what if compensation fails?") still ends at "alert + manual fix" anyway. D gets 95% of the value with 30% of the code.
- **Outbox pattern** (Option B) — gold standard but requires a worker process + queue + monitoring. Overkill for v2 scale. Parked in `upgrades.md` with the migration sketch.
- **DB-first ordering** (Option F) — would let users sign in successfully after DB writes succeed but Cognito hasn't yet; nope. Cognito owns identity, so it commits first.
- **Silent auto-heal** (Option G) — masks bugs, ships silent partial state. User flagged this explicitly.
- **Critical-vs-cosmetic split** (Option I) — two failure models, hidden background-write bugs. User flagged this explicitly.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-8 moved from Pending → Decided. Conversational answer captures the full pattern.
- `docs/v2-decisions.md` — full strategic write-up appended after RF-7. Four sub-option groups (strategy / ordering / failure / classification), Decision = C+D+E+H+J, per-flow compensation table, reference code, ops pipeline, full discussion notes capturing all four iterations of user pushback.
- `docs/standards.md` — new §2 backend entry "Cross-system writes: Cognito-first + bounded retry + best-effort compensation." New §6 logging entry "Reserved structured log markers" naming the alert pipeline's watched events (`<flow>_rollback_failed`, `<flow>_mismatch`).
- `docs/upgrades.md` — new entry "Outbox pattern for cross-system writes (Cognito ↔ Postgres) *(RF-8)*" with concrete migration sketch + revisit triggers.
- `docs/deployment.md` — new section "v2 Infra Setup — Critical-error alert pipeline (RF-8)" with full step-by-step pipeline setup. Must land in same phase as EC2 + Docker + Nginx.
- `docs/devlog/convo-041-*.md` — this file.

**Memory:**
- `project_v2_alert_pipeline.md` — new. Flags the alert-pipeline setup as a blocking item for v2 infra phase. User explicitly asked to be reminded.
- `MEMORY.md` index updated.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-8:** locked.
- 🔜 **Rapid-fire RF-9 to RF-16:** pending (8 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## Resume context (next session)

Pick up at **RF-9** in the rapid-fire queue. Remaining 8 in queue order:

- **RF-9.** Session and permission consistency mid-flight (user removed mid-session; role changed mid-session — frontend reaction?)
- **RF-10.** Subscription expiry session behavior (user-side UX moment expiry fires mid-action)
- **RF-11.** Active-org deleted while user is logged in (auto-switch vs force org-selection)
- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal)
- **RF-13.** Token refresh stale window during org switch
- **RF-14.** Per-request membership validation scaling (when to add caching)
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping)

**Carried action items:**
- **`backend/lib/retry.ts`** must ship with `withCognitoBackoff` (RF-2) and `withDbRetry` (RF-8). Both used everywhere cross-system writes happen. Captured in standards.md.
- **CloudWatch + SNS + email alert pipeline** during v2 infra setup phase. Captured in `deployment.md` and as a project memory (`project_v2_alert_pipeline.md`).
- **Reserved log event names** (`<flow>_rollback_failed`, `<flow>_mismatch`) — code that fires these must use the exact patterns to match the metric filter.

**After all rapid-fire locks** (unchanged plan):
1. v1 functional issue capture (must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Phase re-sequencing — map onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
