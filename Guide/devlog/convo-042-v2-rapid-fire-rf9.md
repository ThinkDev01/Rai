# Convo 042 — v2 Rapid-Fire RF-9 (Session and permission consistency mid-flight)

**Date:** 15 May 2026

---

## What happened

Quick lock for RF-9. User opened by asking "how are we handling all these as per Q3 huh?" — recall signal that the backend side might already be done. Confirmed Q3 middleware re-validates `user_orgs` + reads `role` fresh per request, so RF-9 is purely about the frontend reaction to those 403s. Walked the membership-revoked and role-changed flows; user picked the soft, banner-first approach for both. No iterations needed.

---

## Locked decision

**RF-9 → C + F + I + K.** Banner-first for both cases + redirect on natural navigation for revoked membership + access-denied on admin-route click for demoted role + RF-1's cross-tab/cross-device propagation reused.

### Backend (already done in Q3 — only adds error-code labels)
- Middleware re-validates `user_orgs(user_id, current_org_id)` every request → 403 on removal.
- Middleware reads fresh `user_orgs.role` per request → 403 on role-gated endpoints if role no longer permits.
- **New:** standard 403 envelope adds two error codes:
  - `code: "MEMBERSHIP_REVOKED"` — membership row gone.
  - `code: "INSUFFICIENT_ROLE"` — role doesn't satisfy route requirement.

### Frontend (~30 lines + one banner component)
- **Axios response interceptor** catches 403s with these codes.
- **Membership revoked:** sticky top banner ("You no longer have access to [Org Name]" + "Switch org" button) → page stays mounted → subsequent 403s silent → next nav click redirects to the org list / switcher page where the user picks an org explicitly (no auto-selection of next-most-recent), or to RF-4's empty-state with Join-org / Create-org if zero orgs.
- **Role changed:** banner ("Your role in [Org] has changed…") → all UI stays as-is → admin-only route click renders the standard access-denied page from backend's `403 INSUFFICIENT_ROLE`.
- **Cross-tab:** RF-1's `storage` event listener extends with a small `permissionChange` event (~5 lines) — other tabs in same browser mount the same banner immediately.
- **Cross-device:** lazy — each device gets its own 403 → own banner on next API call. Matches RF-1's pattern.

### Three deliberate non-decisions (captured to prevent drift during build)
- **No forced logout.** User can have other orgs they're still in.
- **No aggressive token refresh.** Would create RF-2 token-refresh storms.
- **No permission-aware UI rewrites.** Access-denied-on-click handles the edge cases for free.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-9 moved from Pending → Decided. Conversational answer captures the full pattern. "Pending discussion" header moved below RF-9.
- `docs/v2-decisions.md` — full strategic write-up appended after RF-8. Three sub-option groups (revoked / role-change / propagation), Decision = C+F+I+K, companion locks, industry comparison, three non-decisions captured.
- `docs/devlog/convo-042-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park; RF-9 fully lands in v2.
- `docs/standards.md` — no new general-purpose pattern; the error-code conventions are RF-9-specific and live in `v2-decisions.md`.
- `docs/deployment.md` — no infra change.

**Memory:** none saved this session. Decisions are entirely captured in v2-decisions.md; no surprising user preferences or new feedback to record.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-9:** locked.
- 🔜 **Rapid-fire RF-10 to RF-16:** pending (7 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## Resume context (next session)

Pick up at **RF-10** in the rapid-fire queue. Remaining 7 in queue order:

- **RF-10.** Subscription expiry session behavior (user-side UX moment expiry fires mid-action — partial: Q11 locks org state, this is the user-side delta)
- **RF-11.** Active-org deleted while user is logged in (auto-switch vs force org-selection — partial: Q14 locks retention, this is the user-side delta)
- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal)
- **RF-13.** Token refresh stale window during org switch
- **RF-14.** Per-request membership validation scaling (when to add caching)
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping)

**Carried action items (unchanged from convo-041):**
- `backend/lib/retry.ts` with `withCognitoBackoff` + `withDbRetry`.
- CloudWatch + SNS + email alert pipeline during v2 infra setup phase.
- Reserved log event names (`<flow>_rollback_failed`, `<flow>_mismatch`).

**New action items from RF-9:**
- Backend error-code constants in `backend/lib/error-codes.ts` (`MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`), mirrored in `frontend/src/lib/error-codes.ts`.
- Frontend `PermissionBanner` component (one component, two copy variants).
- RF-1's storage event listener implementation must include the `permissionChange` extension from day one.

**After all rapid-fire locks** (unchanged plan):
1. v1 functional issue capture (must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Phase re-sequencing — map onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
