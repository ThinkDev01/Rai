# Convo 046 — v2 Rapid-Fire RF-13 (Token refresh stale window during org switch)

**Date:** 16 May 2026

---

## What happened

Resumed same session, immediately after RF-12 lock. User opened RF-13 with a draft proposal that conflated it with RF-8 (Cognito-first, retry, SNS alert). Corrected the framing: RF-8 covers the backend two-step (Cognito attribute write + DB `last_accessed_at` write), RF-13 covers the *third* step — the frontend's `Auth.currentSession({forceRefresh: true})` call that mints a new ID token containing the updated `custom:current_org_id` claim.

User then asked "how are we generally handling states and triggers as of now?" — answered with a snapshot of the v2 state plan (token claim as source of truth, Amplify session mirror, RF-1 storage event listener, RF-6 queryKey convention). User also pushed for "immediate atomic switch on backend success" — explained why that's not technically possible (middleware reads token claim) and walked through the gated-flip-on-refresh model as the right way to get atomicity without lying to the user.

User accepted the gated flip + two-layer retry shape. Pushed back on forced logout — agreed, old token is still valid. This surfaced the silent-switch trap (Amplify's background auto-refresh would silently pick up the orgB attribute ~50 minutes later and flip the UI mid-work). Solved by adding RF-8-style compensation: frontend calls revert endpoint when Layer 1 exhausts, backend reverts Cognito attribute + DB `last_accessed_at`. SNS alert reachable only if revert also fails.

User wrapped with a tidy paraphrase of the full system shape: switcher debounce → backend two-step → frontend gated flip → internal retries → banner → contact support → revert with same retry structure → SNS. Locked in one pass.

---

## Locked decision

**RF-13 → A + D + G.** Gated UI flip + two-layer retry (3 internal + user-facing Retry + Contact Support after 3 Retry clicks) + compensation revert on refresh failure.

### Switch flow (happy path)

1. User clicks switcher → frontend captures `priorOrgId`, disables switcher (RF-6), shows "switching..." spinner.
2. Frontend → `POST /api/v1/auth/switch-org {newOrgId}`.
3. Backend → `withCognitoBackoff(AdminUpdateUserAttributes)` then `withDbRetry(UPDATE user_orgs SET last_accessed_at = NOW())`. Both succeed (RF-8 path).
4. Backend returns `{success, newOrgId, priorLastAccessedAt}` (the prior timestamp captured *before* the write).
5. Frontend → `cognitoRetry(Auth.currentSession({forceRefresh: true}))`.
6. Frontend verifies new token's claim === `newOrgId`. If yes → invalidate all `['org', priorOrgId, ...]` + `['org', newOrgId, ...]` queryKeys → atomic UI flip → spinner clears.

### Switch flow (refresh fails after 3 internal retries)

1. Frontend → `POST /api/v1/auth/switch-org/revert {revertToOrgId: priorOrgId, restoreLastAccessedAt: priorLastAccessedAt}`.
2. Backend reverts Cognito attribute + DB with same retry helpers.
3. Revert succeeds → banner "Org switch unsuccessful — Retry?". State fully resynced to orgA across all three stores.
4. Revert fails after retries → SNS alert (`event: "org_switch_revert_failed"`). Banner shows Retry + Contact Support immediately.

### Why compensation matters

Without revert, Cognito attribute stays at orgB while frontend token still says orgA. Amplify's background auto-refresh ~50 minutes later silently mints a new token with the orgB claim → user's UI flips to orgB mid-work without context. This is the "silent switch trap" — fixed by reverting state immediately on refresh failure so all three stores realign to orgA.

### No forced logout

Old token is still valid and self-consistent (token = orgA = what user sees = what backend returns). Session stays usable. User can keep working in orgA or click Retry.

### Atomic UI update mechanism

RF-6's `['org', orgId, ...]` queryKey convention — when orgId flips, React Query invalidates every tenant-scoped query in one shot. Profile, header, dashboard, sidebar all refetch simultaneously. No "profile orgB / data orgA" race possible.

### Net new code

~50 lines:
- `frontend/src/lib/cognito-retry.ts` — mirror of backend's `withCognitoBackoff` (3 attempts, 100ms / 300ms / 1s, ±20% jitter).
- Switch flow's claim-verification check (~5 lines).
- Retry banner component + Contact Support tracking state (~15 lines).
- `POST /api/v1/auth/switch-org/revert` endpoint (~10 lines).
- `priorLastAccessedAt` capture in switch endpoint before the UPDATE (~3 lines).

### Reserved log event

- `event: "org_switch_revert_failed"` — matches RF-8's CloudWatch metric filter pattern.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-13:** locked.
- 🔜 **Rapid-fire RF-14 to RF-16:** pending (3 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-13 moved Pending → Decided. Pending header relocated below RF-13.
- `docs/v2-decisions.md` — full strategic write-up after RF-12. Three option groups (UI flip timing / refresh-failure handling / post-failure state), Decision = A+D+G, companion locks, what-this-does-not-include block, discussion notes.
- `docs/devlog/convo-046-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park; RF-13 fully lands in v2.
- `docs/standards.md` — no new general-purpose pattern; reuses RF-2 backoff + RF-8 compensation + RF-6 queryKey conventions.
- `docs/deployment.md` — no infra change.

**Memory:** nothing new saved this session. Decisions captured fully in v2-decisions.md.

---

## Resume context (next session)

Pick up at **RF-14** in the rapid-fire queue. Remaining 3 in queue order:

- **RF-14.** Per-request membership validation scaling. **Note:** RF-9 / RF-10 / RF-11 / RF-12 / RF-13 have all extended or relied on the same middleware query — that's the DB call RF-14 is about scaling. The query now reads `user_orgs(user_id, current_org_id)`, joins `organizations` (for ORG_DELETED detection), and joins `subscriptions` (for SUBSCRIPTION_EXPIRED detection). One per-request DB roundtrip.
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14.
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping).

---

## Carried action items (build phase — accumulated through RF-13)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved codes: `MEMBERSHIP_REVOKED` (403), `INSUFFICIENT_ROLE` (403), `SUBSCRIPTION_EXPIRED` (403), `ORG_DELETED` (403), `ALREADY_MEMBER` (409).
- Tenant-scoping middleware: one query covers membership, role, subscription status, and org existence via LEFT JOIN.
- Invite endpoints: create (pre-flight + supersede), revoke, list pending.
- Switch-org endpoint returns `priorLastAccessedAt` for revert. Companion `/switch-org/revert` endpoint.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/lib/cognito-retry.ts` — mirror of backend's `withCognitoBackoff`.
- `frontend/src/components/PermissionBanner.tsx` with four copy variants.
- Axios response interceptor handling all 403 codes + 409 `ALREADY_MEMBER`.
- RF-1 `storage` event listener propagating four events.
- Team page "Pending invites" section.
- Org switcher with claim-verification + retry banner + Contact Support escalation tracking.

**Schema:**
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`.

**Infra:**
- CloudWatch + SNS + email alert pipeline (RF-8). Project memory `project_v2_alert_pipeline.md` flags this. ~1h setup. Blocks production cutover.

**Reserved log event names** (RF-8 pattern):
- `event: "<flow>_rollback_failed"` for compensation failures.
- `event: "<flow>_mismatch"` for middleware-detected state mismatches.
- `event: "org_switch_revert_failed"` (RF-13).

**React Query convention** (RF-6):
- All TanStack Query keys for tenant-scoped data start with `['org', orgId, ...]`. Codified in `standards.md` §3.

---

## After all rapid-fire locks (unchanged plan, copied for continuity)

1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Roles / RBAC dedicated pass.
4. Phase re-sequencing — map onto Phase A/B/C…
5. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
