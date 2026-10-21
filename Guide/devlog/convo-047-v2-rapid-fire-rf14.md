# Convo 047 — v2 Rapid-Fire RF-14 + RF-15 (Membership validation scaling)

**Date:** 16 May 2026

---

## What happened

Same session, resumed after RF-13 lock. User opened with their own framing: handle RF-14 and RF-15 together, defer all v3 caching/replica/TTL discussions, focus v2 on getting the foundation right so the v3 Redis swap is mechanical. Asked for the concrete per-request middleware footprint before locking.

Walked through the auth chain — by RF-13 it had absorbed work from RF-9 (role read), RF-10 (subscription status), RF-11 (org-existence + revoked-vs-deleted distinction), RF-12 (none — invite-create is a write path, not a per-request gate), RF-13 (none — uses the same query as before). Per-request shape ended up at **2 DB queries** for any tenant-scoped endpoint: `loadUser` (`users` by `cognito_sub`) plus the combined LEFT JOIN of `user_orgs` + `organizations` + `subscriptions`. Both sub-millisecond at v2 scale.

User accepted the locked shape in one pass:
- v2 footprint + index list locked at first migration
- `MembershipResolver` interface introduced now so v3 Redis drops in as a decorator
- v3 activation governed by explicit metric thresholds, not subjective "feels slow"
- RF-15 stays formally bound to RF-14, activates together

User explicitly framed the underlying philosophy: "we will do all things as per industry scaling standard even a little tiny thing but as per versions am making the priorities." This is the right posture — solve at current scale, design so next scale drops in.

---

## Locked decision

**RF-14 → A + D + G.** v2 footprint + indexes locked + `MembershipResolver` interface + mechanical v3 activation triggers.
**RF-15 → deferred to v3, activates together with RF-14.**

### Per-request DB footprint (confirmed for v2)

For any tenant-scoped endpoint:

1. `verifyCognitoJwt` — no DB (JWKS cached in-memory by `aws-jwt-verify`).
2. `loadUser` — `SELECT ... FROM users WHERE cognito_sub = $1` (1 query).
3. Combined check — LEFT JOIN of `user_orgs` + `organizations` + `subscriptions` filtered by `(user_id, org_id)` (1 query). Returns `role`, `org_exists`, `sub_status` in one round trip.

**Total = 2 queries per tenant-scoped request.**

### Index list locked at first migration

- `users(cognito_sub)` UNIQUE — drives `loadUser`.
- `user_orgs(user_id, org_id)` UNIQUE composite — drives membership query.
- `user_orgs(org_id)` — tenant-scoping side.
- `user_orgs(user_id, last_accessed_at DESC)` composite — drives RF-5 dropdown.
- `organizations(slug)` UNIQUE — drives slug uniqueness + lookup-by-slug.
- `subscriptions(org_id)` UNIQUE — one sub per org.
- `invites(token)` UNIQUE — drives Q6 click handler.
- `invites(invited_email, org_id) WHERE used_at IS NULL AND revoked_at IS NULL` partial — drives RF-12 pre-flight + supersede.

Composite column order follows equality-first / range-last. Partial indexes used where the query filters most rows out.

### `MembershipResolver` interface

```ts
// backend/modules/auth/membership.resolver.ts
export interface MembershipResolver {
  resolve(userId: string, orgId: string): Promise<MembershipContext | null>;
}

export type MembershipContext = {
  role: 'admin' | 'project_manager' | 'user';
  orgExists: boolean;
  subStatus: 'active' | 'expired' | 'trialing' | 'canceled';
};

export class DbMembershipResolver implements MembershipResolver {
  async resolve(userId, orgId) { /* the LEFT JOIN query */ }
}
```

v2 ships only `DbMembershipResolver`. v3 adds `CachedMembershipResolver` wrapping the DB one with Redis lookup-then-fallback. One DI registration change to swap.

### v3 activation triggers (mechanical, not subjective)

- p99 auth middleware latency sustained >10ms over a 24h window (CloudWatch alarm), OR
- concurrent active users >500 sustained, OR
- DB connection pool saturation traceable to middleware queries.

Any one fires → RF-14 + RF-15 v3 work activates.

### Net code in v2

~5 lines (interface + concrete class) + index DDL in first migration.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-15:** locked (RF-15 = deferred-bound-to-RF-14).
- 🔜 **Rapid-fire RF-16:** pending (1 entry queued — Cognito swap future-proofing).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-14 and RF-15 both moved Pending → Decided.
- `docs/v2-decisions.md` — full RF-14 write-up after RF-13. RF-15 short write-up (deferred-bound-to-RF-14).
- `docs/standards.md` §2 (Backend) — new "Indexes on hot paths locked at first migration" entry referencing RF-14.
- `docs/standards.md` §8 (Design Patterns) — `MembershipResolver` added to the existing "Service-interface abstraction for swap-ready infrastructure" entry.
- `docs/upgrades.md` — three new v3 parks: Redis membership cache (RF-14), cache invalidation strategy (RF-15), read replicas (RF-14).
- `docs/devlog/convo-047-*.md` — this file.

**Not modified:**
- `docs/deployment.md` — no infra change in v2.
- No new error codes, no new log events. RF-14 is purely a shape + indexes lock.

**Memory:** nothing new saved this session. Decisions captured fully in v2-decisions.md.

---

## Resume context (next session)

Only **RF-16** left in the rapid-fire queue. After RF-16 locks:

1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Roles / RBAC dedicated pass.
4. Phase re-sequencing — map onto Phase A/B/C…
5. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.

---

## Carried action items (build phase — accumulated through RF-15)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved codes: `MEMBERSHIP_REVOKED` (403), `INSUFFICIENT_ROLE` (403), `SUBSCRIPTION_EXPIRED` (403), `ORG_DELETED` (403), `ALREADY_MEMBER` (409).
- `backend/modules/auth/membership.resolver.ts` — `MembershipResolver` interface + `DbMembershipResolver` (RF-14).
- Tenant-scoping middleware calls `resolver.resolve(userId, orgId)` instead of inline SQL.
- Invite endpoints: create (pre-flight + supersede), revoke, list pending.
- Switch-org endpoint returns `priorLastAccessedAt` for revert. Companion `/switch-org/revert` endpoint.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/lib/cognito-retry.ts` — mirror of backend's `withCognitoBackoff`.
- `frontend/src/components/PermissionBanner.tsx` with four copy variants.
- Axios response interceptor handling all 403 codes + 409 `ALREADY_MEMBER`.
- RF-1 `storage` event listener propagating four events.
- Team page "Pending invites" section.
- Org switcher with claim-verification + retry banner + Contact Support escalation.

**Schema (locked at v2's first migration):**
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`.
- Full index list per RF-14.

**Infra:**
- CloudWatch + SNS + email alert pipeline (RF-8). Project memory `project_v2_alert_pipeline.md` flags this. ~1h setup. Blocks production cutover.

**Reserved log event names:**
- `event: "<flow>_rollback_failed"` (RF-8).
- `event: "<flow>_mismatch"` (RF-8).
- `event: "org_switch_revert_failed"` (RF-13).

**Standards locked:**
- All TanStack Query keys for tenant-scoped data start with `['org', orgId, ...]` (RF-6, codified in `standards.md` §3).
- Indexes on hot paths locked at first migration (RF-14, codified in `standards.md` §2).
- `MembershipResolver` follows the swap-ready abstraction pattern (RF-14, codified in `standards.md` §8).
