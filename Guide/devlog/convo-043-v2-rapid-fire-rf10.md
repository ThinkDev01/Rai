# Convo 043 — v2 Rapid-Fire RF-10 (Subscription expiry session behavior)

**Date:** 15 May 2026

---

## What happened

Quick lock for RF-10. User recalled Q11 (org-level read-only state on expiry) and proposed: same banner pattern as RF-9, with subscription-expiry-specific copy and error code. Confirmed and locked in one pass. No iterations needed.

User wrapped the session with "save everything until now we will discuss rest of the questions tomorrow."

---

## Locked decision

**RF-10 → A + E + H + J.** Sticky banner + middleware-level enforcement + lazy per-device detection + storage-event cross-tab propagation.

### Backend
- New error code: `code: "SUBSCRIPTION_EXPIRED"` in the standard 403 envelope.
- Q3 tenant-scoping middleware extends to also read `subscriptions.status` in the same query (single join). If status is `expired` AND request method is POST/PUT/PATCH/DELETE → return 403. Reads continue to flow per Q11's indefinite read-only guarantee.

### Frontend
- `PermissionBanner` component (built for RF-9) gets a third variant.
- Axios interceptor handles `SUBSCRIPTION_EXPIRED` alongside `MEMBERSHIP_REVOKED` and `INSUFFICIENT_ROLE`.
- Banner copy: admins see "Reactivate subscription" button; non-admins see "Contact your organization admin to reactivate."
- UI stays as-is — no proactive disabling. Click write button → 403 → toast "Cannot save — subscription has expired" + sticky banner mounts.
- Cross-tab: RF-1's `storage` event listener gets a `subscriptionExpired` event alongside `permissionChange`.
- Cross-device: lazy per-device detection.
- Banner auto-dismisses on next successful write (after reactivation).

### Net new code
~10 lines on top of RF-9's infrastructure. Reuses banner component, interceptor, and storage listener.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-10:** locked.
- 🔜 **Rapid-fire RF-11 to RF-16:** pending (6 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-10 moved Pending → Decided. Pending header relocated below RF-10.
- `docs/v2-decisions.md` — full strategic write-up appended after RF-9. Three option groups (surfacing / enforcement / propagation), Decision = A+E+H+J, companion locks, discussion notes.
- `docs/devlog/convo-043-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park; RF-10 fully lands in v2.
- `docs/standards.md` — no new general-purpose pattern; RF-9 already introduced the error-code pattern and `PermissionBanner` component.
- `docs/deployment.md` — no infra change.

**Memory:** nothing new saved this session. Decisions captured fully in v2-decisions.md.

---

## Resume context (next session — 16 May 2026)

Pick up at **RF-11** in the rapid-fire queue. Remaining 6 in queue order:

- **RF-11.** Active-org deleted while user is logged in (auto-switch vs force org-selection — partial: Q14 locks retention, this is the user-side delta). **Note:** consistent with RF-9's lock, the answer here is likely "no auto-switch — redirect to org list/switcher page."
- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal).
- **RF-13.** Token refresh stale window during org switch.
- **RF-14.** Per-request membership validation scaling (when to add caching). **Note:** RF-10 extended the same middleware query — that's the same DB call that RF-14 is about scaling.
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14.
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping).

---

## Carried action items (build phase — accumulated through RF-10)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved 403 codes: `MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`.
- Tenant-scoping middleware extension: read `user_orgs.role` AND `subscriptions.status` in the same query (single join). Gates writes when subscription expired.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/components/PermissionBanner.tsx` with three copy variants (membership revoked / role changed / subscription expired).
- Axios response interceptor handling all three 403 codes.
- RF-1's `storage` event listener must propagate both `permissionChange` (RF-9) and `subscriptionExpired` (RF-10) from day one.

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
