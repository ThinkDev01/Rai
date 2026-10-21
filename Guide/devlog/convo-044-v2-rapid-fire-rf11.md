# Convo 044 — v2 Rapid-Fire RF-11 (Active-org deleted while user is logged in)

**Date:** 16 May 2026

---

## What happened

Resumed from yesterday's close (convo-043, RF-10 lock). User opened with "where were we?" — confirmed the state: Q1–Q16 locked, RF-1 to RF-10 locked, RF-11–RF-16 pending in queue order, RF-17 already covered by Q3.

User proposed RF-11 in one shot: "handle similar to how we are handling if user is removed from org — banner appears if org is deleted and if a user does any action then he will be redirected to the org switch page." Confirmed alignment with the RF-9 pattern, flagged the one deliberate divergence (any API call triggers redirect, not just writes), called out the inherited "stays on page is best-effort" caveat, and clarified the v2-scope reality (only self-serve 2FA hard-delete triggers this in v2 because Q14 locked v2 as indefinite retention). User said "yes" — locked in one pass.

---

## Locked decision

**RF-11 → A + E + G + H.** Sticky banner + Q3-middleware-level detection (LEFT JOIN distinguishes deleted org from revoked membership) + lazy per-device detection + storage-event cross-tab propagation.

### One divergence from RF-9 / RF-10

- RF-9 / RF-10: banner sticky, reads keep working from cache, writes 403 with toast.
- RF-11: banner mounts + **any** API call (read or write) triggers toast + redirect to org switcher.

Reason: in RF-9 / RF-10 the org still exists, so cached reads are real data the user can still see. In RF-11 the org row is gone for everyone — React Query refetches on focus / mount will 403 regardless, so the "writes only" trigger from RF-9 / RF-10 doesn't translate.

### Backend

- New error code: `code: "ORG_DELETED"` in the standard 403 envelope.
- Q3 tenant-scoping middleware learns to distinguish `MEMBERSHIP_REVOKED` from `ORG_DELETED` via a LEFT JOIN variation on the existing per-request membership query:
  - `user_orgs` row missing → `MEMBERSHIP_REVOKED` (RF-9).
  - `organizations` row missing → `ORG_DELETED` (RF-11).
  - Both present + `subscriptions.status = 'expired'` + write method → `SUBSCRIPTION_EXPIRED` (RF-10).
- One DB query covers all three. ~5 lines on top of RF-9 / RF-10.

### Frontend

- `PermissionBanner` gets a 4th copy variant ("This organization has been deleted. Switch to another org to continue.").
- Axios interceptor handles `ORG_DELETED` → toast + mount banner + redirect helper (org switcher, or RF-4 empty-state if no other orgs).
- RF-1 `storage` event listener gets an `orgDeleted` event alongside `permissionChange` (RF-9) and `subscriptionExpired` (RF-10). All four events landed from day one.
- No proactive UI disabling; same philosophy as RF-9 / RF-10.

### Deleter's own session

The user who clicked self-serve 2FA hard-delete in settings does **not** go through the interceptor flow. Delete endpoint returns success → frontend explicitly navigates them to the switcher (or RF-4 empty-state). The banner-flow is for everyone else: the deleter's own other tabs / devices, and every other admin/owner session in the same org.

### Net new code

~5 lines on top of RF-9 / RF-10 infrastructure — one error code constant, one banner copy variant, one storage event name, one redirect line in the interceptor. The middleware-side change is a LEFT JOIN tweak, also ~5 lines.

### v2 scope clarification

Q14 locked v2 as **indefinite retention** — no auto-deletion. The only path that triggers RF-11 in v2 is **another admin/owner hitting the self-serve 2FA hard-delete button** in settings. v3+ retention-expiry deletion gets pre-deletion emails at T-30 / T-7 / T-1 per Q14, so users have warning before this banner ever appears.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-11:** locked.
- 🔜 **Rapid-fire RF-12 to RF-16:** pending (5 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-11 moved Pending → Decided. Pending header relocated below RF-11.
- `docs/v2-decisions.md` — full strategic write-up appended after RF-10. Four option groups (surfacing / enforcement / propagation, plus implicit redirect-trigger comparison vs RF-9/RF-10), Decision = A+E+G+H, companion locks, discussion notes, v2-scope clarification.
- `docs/devlog/convo-044-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park; RF-11 fully lands in v2.
- `docs/standards.md` — no new general-purpose pattern; RF-9 already introduced the error-code-envelope + `PermissionBanner` pattern.
- `docs/deployment.md` — no infra change.

**Memory:** nothing new saved this session. Decisions captured fully in v2-decisions.md.

---

## Resume context (next session)

Pick up at **RF-12** in the rapid-fire queue. Remaining 5 in queue order:

- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal).
- **RF-13.** Token refresh stale window during org switch.
- **RF-14.** Per-request membership validation scaling (when to add caching). **Note:** RF-9 / RF-10 / RF-11 have now all extended the same middleware query — that's the same DB call RF-14 is about scaling.
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14.
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping).

---

## Carried action items (build phase — accumulated through RF-11)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved 403 codes: `MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`, `ORG_DELETED`.
- Tenant-scoping middleware: one query covers membership (`user_orgs`), role, subscription status (`subscriptions`), and org existence (`organizations`) via LEFT JOIN. Distinguishes the four 403 codes from the join result shape.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/components/PermissionBanner.tsx` with four copy variants (membership revoked / role changed / subscription expired / org deleted).
- Axios response interceptor handling all four 403 codes. RF-11's `ORG_DELETED` branch also triggers the redirect helper.
- RF-1 `storage` event listener must propagate four events from day one: `permissionChange` (RF-9), `subscriptionExpired` (RF-10), `orgDeleted` (RF-11). Single listener, four event names.

**Infra:**
- CloudWatch + SNS + email alert pipeline during v2 infra setup phase (RF-8). Project memory `project_v2_alert_pipeline.md` flags this. ~1h setup. Blocks production cutover.

**Reserved log event names** (RF-8):
- `event: "<flow>_rollback_failed"` for compensation failures.
- `event: "<flow>_mismatch"` for middleware-detected state mismatches.
- Code that fires these must use the exact patterns to match the CloudWatch metric filter.

**React Query convention** (RF-6):
- All TanStack Query keys for tenant-scoped data start with `['org', orgId, ...]`. Codified in `standards.md` §3.

---

## After all rapid-fire locks (unchanged plan, copied for continuity)

1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Phase re-sequencing — map onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
