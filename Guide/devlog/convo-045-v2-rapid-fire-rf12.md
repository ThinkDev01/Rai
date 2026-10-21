# Convo 045 — v2 Rapid-Fire RF-12 (Invite edge cases)

**Date:** 16 May 2026

---

## What happened

Resumed same session as RF-11. User opened RF-12 with their own draft proposal: email-only invite (confirmed against Q6), Team-page UI surface, `admin` + `project_manager` can invite (not `user`), 24-hour TTL, single-use, removed-user with old link gets expired-page friendly response, re-invite is just a fresh invite.

First message arrived half-baked (cut off mid-sentence at "if user was removed from org then the user can..."). Asked the user to finish; they re-sent the complete version: "the user if clicked on the previous link it'll not work since its expired he need to contact again via other ways to again send invite nothing complex and if user was again invited to the org a fresh invite was given in mail."

Surfaced one conflict (24h TTL vs Q6's locked 7d) and three uncovered edge cases (duplicate-invite-to-same-pending-email resolution, already-a-member pre-flight, revoke-pending-invite mechanism). User resolved all four in one pass: keep Q6's 7d, supersede duplicates, pre-flight already-member check, Team-page pending-invites list with cancel button.

User also asked "what was q6 7days?" mid-flow — answered tight (1 line): Q6 is the original "Invite flow for non-existing users" decision, locked single-token / two-paths / 7-day-single-use.

---

## Locked decision

**RF-12 → A + D + F.** Newer-invite-supersedes-older + pre-flight already-member 409 guard + Team-page "Pending invites" section with revoke.

### Schema add

`invites.revoked_at TIMESTAMP NULL` column added to Q6's existing schema. Final v2 schema:

```
invites (
  id, token, org_id, role, invited_email, invited_by,
  expires_at, used_at, revoked_at, created_at
)
```

Token validity check across all three terminal states:

```
used_at IS NULL
AND revoked_at IS NULL
AND expires_at > NOW()
```

### Invite-create endpoint flow

1. Role gate: caller must be `admin` or `project_manager` (Q5).
2. Subscription gate: RF-10 middleware returns `403 SUBSCRIPTION_EXPIRED` for write methods if org is in read-only — no RF-12-specific code.
3. Pre-flight already-member check: resolve email → `user_id` → `user_orgs(user_id, current_org_id)` lookup. If row exists → `409 ALREADY_MEMBER`, no email, no DB row.
4. Supersede: in the same transaction as the new INSERT, `UPDATE invites SET revoked_at = NOW() WHERE invited_email = $email AND org_id = $org_id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`.
5. INSERT new row with fresh token + 7-day expiry.
6. SES email with body "This invite expires in 7 days."
7. Frontend toast: "Invite sent to bob@x.com — expires in 7 days."

### Revoke endpoint

`POST /api/v1/invites/:id/revoke` — role-gated to `admin` / `project_manager`. Sets `revoked_at = NOW()`. Silent (no notification email to invitee). Revoked tokens land on the same friendly "this invite is no longer valid" page as expired / used tokens.

### Team-page UI

"Pending invites" section at the bottom of the member list (or filterable via toggle). Lists rows where the token is still valid. Each row shows `invited_email` / `role` / `invited_by` / time-to-expiry / Cancel button. Cancel calls the revoke endpoint, optimistic UI removes from list.

### Net new code

~30 lines:
- Pre-flight 409 guard at the top of the invite-create endpoint.
- Supersede UPDATE inside the existing INSERT transaction.
- New revoke endpoint (~5 lines).
- New pending-invites list endpoint (~5 lines, `GET /api/v1/invites?status=pending`).
- Team page Pending Invites section (~15 lines of React Query + UI).

### Reserved error codes

Added to `backend/lib/error-codes.ts`:
- `ALREADY_MEMBER` (`409`)

Now sits alongside the four 403 codes accumulated through RF-9 / RF-10 / RF-11: `MEMBERSHIP_REVOKED`, `INSUFFICIENT_ROLE`, `SUBSCRIPTION_EXPIRED`, `ORG_DELETED`.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-12:** locked.
- 🔜 **Rapid-fire RF-13 to RF-16:** pending (4 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-12 moved Pending → Decided. Pending header relocated below RF-12.
- `docs/v2-decisions.md` — full strategic write-up appended after RF-11. Three option groups (duplicate / already-member / revoke), Decision = A+D+F, companion locks, edge cases explicitly covered, discussion notes.
- `docs/devlog/convo-045-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park (per-org invite quota and bounce-handling are v3 abuse-prevention work, fits under existing v3 abuse-prevention envelope, not a new park).
- `docs/standards.md` — no new general-purpose pattern; just one more reserved error code.
- `docs/deployment.md` — no infra change.

**Memory:** nothing new saved this session. Decisions captured fully in v2-decisions.md.

---

## Resume context (next session)

Pick up at **RF-13** in the rapid-fire queue. Remaining 4 in queue order:

- **RF-13.** Token refresh stale window during org switch — how to handle refresh failures mid-switch, abort flow, and consistency between active org and current token.
- **RF-14.** Per-request membership validation scaling. **Note:** RF-9 / RF-10 / RF-11 / RF-12 have now all extended (or relied on) the same middleware query — that's the same DB call RF-14 is about scaling.
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14.
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping).

---

## Carried action items (build phase — accumulated through RF-12)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved codes: `MEMBERSHIP_REVOKED` (403), `INSUFFICIENT_ROLE` (403), `SUBSCRIPTION_EXPIRED` (403), `ORG_DELETED` (403), `ALREADY_MEMBER` (409).
- Tenant-scoping middleware: one query covers membership, role, subscription status, and org existence via LEFT JOIN; distinguishes the four 403 codes from the join result shape.
- Invite endpoints: create (with pre-flight check + supersede transaction), revoke, list pending.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/components/PermissionBanner.tsx` with four copy variants (membership revoked / role changed / subscription expired / org deleted).
- Axios response interceptor handling all four 403 codes + the new 409 `ALREADY_MEMBER` (toast at point-of-invite, not banner).
- RF-1 `storage` event listener propagates four events: `permissionChange` (RF-9), `subscriptionExpired` (RF-10), `orgDeleted` (RF-11).
- Team page "Pending invites" section (RF-12).

**Schema:**
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`. Locked v2-final at first migration.

**Infra:**
- CloudWatch + SNS + email alert pipeline during v2 infra setup phase (RF-8). Project memory `project_v2_alert_pipeline.md` flags this. ~1h setup. Blocks production cutover.

**Reserved log event names** (RF-8):
- `event: "<flow>_rollback_failed"` for compensation failures.
- `event: "<flow>_mismatch"` for middleware-detected state mismatches.

**React Query convention** (RF-6):
- All TanStack Query keys for tenant-scoped data start with `['org', orgId, ...]`. Codified in `standards.md` §3.

---

## After all rapid-fire locks (unchanged plan, copied for continuity)

1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Roles / RBAC dedicated pass — explicitly parked during RF-12 ("alot to dicuss about roles and rbac though we will discuss it after the rapid fire round is done").
4. Phase re-sequencing — map onto Phase A/B/C…
5. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
