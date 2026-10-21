# Convo 048 — v2 Rapid-Fire RF-16 (Cognito swap future-proofing) + Round closeout

**Date:** 16 May 2026

---

## What happened

Same session, picking up the last rapid-fire entry. User opened RF-16 with a tight scoping question — "this is if we want to switch cognito with other service isn't it nothing else nah?" — confirmed yes, RF-16 is only about Cognito swap-portability.

User immediately framed the goal: "make it in such a way this could be easily plug and play with any service." Then asked the load-bearing diagnostic question: "in db is cognito sub the main pk huh?" — surfaced that yes, Q13 had locked `users.id = Cognito sub (UUID v4)`, which is exactly the coupling that makes "plug-and-play" a lie even with the existing `AuthService` interface (Q1 / standards.md §8).

Walked through the industry-standard decouple: internal `users.id` (UUID v7 we generate) + separate `users.external_auth_id` column (Cognito sub today, swappable per provider). Explained why this matters: every FK in the system (`user_orgs.user_id`, `tickets.created_by`, `comments.author_id`, every `assigned_to`/`updated_by`/`owner_id`) points at `users.id`, so without the decouple a swap would orphan the entire FK graph.

User asked two clarifying questions before locking:
1. **Does the new provider need custom-attribute support for `current_org_id`?** Answered yes, but every major provider has equivalent metadata (Auth0 `app_metadata`, Clerk `privateMetadata`, Stytch `trusted_metadata`, self-built = our DB) — table stakes, not a concern.
2. **List all the places where Cognito state intermingles with our system.** Produced a 12-row touch-point migration map (now captured in v2-decisions under RF-16) covering: ID column, external auth ID, email column, Cognito custom attribute, three JWT claims, `withCognitoBackoff` retry helper, federation config, SES, admin SDK calls, auth-event API.

User locked in one pass with "yes" after the doubts cleared.

---

## Locked decision

**RF-16 → A + D + G.** Decouple internal ID from external auth ID + provider-specific state stays in provider metadata behind `AuthService` normalization + no raw provider SDK access outside the concrete impl.

### Schema changes

- `users.id` = UUID v7 (we generate via the `uuidv7` npm package — same as `organizations.id` and `subscriptions.id` per Q13's pattern).
- `users.external_auth_id VARCHAR NOT NULL UNIQUE` — new column. Stores Cognito `sub` today; updated per-user on any future provider swap.
- `users.email VARCHAR NOT NULL UNIQUE` — universal across providers, unchanged.
- UNIQUE index on `external_auth_id` drives `loadUser`.

### `loadUser` flow change

Query by `external_auth_id` (resolved from JWT) instead of by `id`. ~3 line change in the resolver.

### `AuthService.verifyAccessToken()` normalization contract (codified in standards.md §8)

```ts
{
  externalAuthId: string,
  email: string,
  emailVerified: boolean,
  currentOrgId: string | null
}
```

Middleware reads only these four fields. Never touches raw JWT payload. Never branches on provider type.

### No raw provider SDK imports outside concrete `AuthService` impl

Controllers / models / non-auth modules must not import `@aws-sdk/client-cognito-identity-provider` (or any future provider's SDK) directly. Review-rejected if found. All admin operations live behind `AuthService` methods.

### Swap-day procedure (captured for future reference)

1. Write new provider's `AuthService` impl (e.g. `Auth0AuthService`).
2. Per-user migration script: create in new provider → capture new external ID → copy `current_org_id` to new provider's metadata → `UPDATE users SET external_auth_id = $new WHERE id = $userId`.
3. Reconfigure federation (Google/MS SSO) in new provider's console.
4. Re-template welcome / password-reset emails (or keep SES — it's AWS, separate from Cognito).
5. One DI wiring change: bind `AuthService` to new impl.
6. Deploy. All FKs intact.

### Q13 revision

Q13's `users` row in the per-table format table was updated. Discussion notes annotated with a pointer to RF-16. Reason captured: the original `users.id = Cognito sub` decision would have made any swap a months-long FK rewrite.

### Net code in v2

1 column + 1 UNIQUE index + `loadUser` changes from query-by-id to query-by-external_auth_id. ~3-line schema change, ~3-line resolver change.

---

## Touch-point migration map

Captured in full in v2-decisions.md under RF-16 (12 rows). Key rows: `users.id` (becomes ours), `external_auth_id` (the swap target), `custom:current_org_id` Cognito attribute (stays in provider metadata, AuthService abstracts), JWT claims (all normalized), admin SDK calls (all behind AuthService methods), federation + SES (reconfigured on swap day, not data-risk).

---

## Rapid-fire round status — COMPLETE

**✅ All 16 entries locked (RF-1 through RF-16).** RF-17 (RLS) absorbed by Q3.

**Full rapid-fire timeline (compressed):**
- RF-1 through RF-10 locked across earlier sessions (convo-038 to convo-043).
- RF-11 through RF-16 locked in this session (convo-044 to convo-048, all 16 May 2026).
- Five strategic-doc files now reflect rapid-fire state: `v2-rapid-fire.md`, `v2-decisions.md`, `standards.md`, `upgrades.md`, `deployment.md` (no infra changes from rapid-fire).

---

## What landed where

**Modified:**
- `docs/v2-rapid-fire.md` — RF-16 moved Pending → Decided. New "Rapid-fire round status" section added with COMPLETE marker.
- `docs/v2-decisions.md` — full RF-16 write-up after RF-15. Q13 table row revised. Q13 discussion notes annotated with RF-16 pointer.
- `docs/standards.md` §8 — new "AuthService normalization contract + no-raw-provider-SDK rule" entry added.
- `docs/devlog/convo-048-*.md` — this file.

**Not modified:**
- `docs/upgrades.md` — nothing to park; RF-16 fully lands in v2.
- `docs/deployment.md` — no infra change.

**Memory:** nothing new saved this session. The Cognito → swappable provider abstraction is fully captured in v2-decisions.md + standards.md.

---

## Resume context (next session) — POST-RAPID-FIRE WORK BEGINS

Per the plan locked across earlier sessions, the after-rapid-fire sequence:

1. **v1 functional issue capture.** Walk through v1 in staging — permissions bugs, UX rough edges, broken flows. Triage each into: must-fix-v2 / defer-v3 / won't-fix.
2. **Overall app + infra review + structural cleanup.** Review v1 codebase against v2 decisions; identify what carries over, what gets rewritten, what gets dropped.
3. **Roles / RBAC dedicated pass.** User flagged this multiple times during rapid-fire (RF-12 most explicitly: "alot to dicuss about roles and rbac though we will discuss it after the rapid fire round is done"). Single dedicated conversation to lock the full RBAC matrix.
4. **Phase re-sequencing.** Map all locked v2 decisions onto Phase A/B/C/... build phases. This is the conversation where phase letters re-enter the discussion (per `feedback_no_phase_mentions`, they've been deliberately absent during decision-making).
5. **Build kickoff:** frontend shell → APIs → testing → `/security-review` → staging → prod.

---

## Carried action items (build phase — final, post-rapid-fire totals)

**Backend code modules to create:**
- `backend/lib/retry.ts` with `withCognitoBackoff` (RF-2) + `withDbRetry` (RF-8).
- `backend/lib/error-codes.ts` with reserved codes: `MEMBERSHIP_REVOKED` (403), `INSUFFICIENT_ROLE` (403), `SUBSCRIPTION_EXPIRED` (403), `ORG_DELETED` (403), `ALREADY_MEMBER` (409).
- `backend/modules/auth/cognito-auth.service.ts` — implements `AuthService` interface. Sole holder of `@aws-sdk/client-cognito-identity-provider` imports.
- `backend/modules/auth/membership.resolver.ts` — `MembershipResolver` interface + `DbMembershipResolver` (RF-14).
- Tenant-scoping middleware calls `resolver.resolve(userId, orgId)` instead of inline SQL.
- Invite endpoints: create (pre-flight + supersede), revoke, list pending.
- Switch-org endpoint returns `priorLastAccessedAt` for revert. Companion `/switch-org/revert` endpoint.

**Frontend code modules to create:**
- `frontend/src/lib/error-codes.ts` mirror of backend codes.
- `frontend/src/lib/cognito-retry.ts` — mirror of backend's `withCognitoBackoff`.
- `frontend/src/lib/auth-client.ts` — `AuthClient` interface + `CognitoAuthClient` wrapping `aws-amplify`.
- `frontend/src/components/PermissionBanner.tsx` with four copy variants.
- Axios response interceptor handling all 403 codes + 409 `ALREADY_MEMBER`.
- RF-1 `storage` event listener propagating four events.
- Team page "Pending invites" section.
- Org switcher with claim-verification + retry banner + Contact Support escalation.

**Schema (locked at v2's first migration):**
- `users (id UUID v7 PK, email UNIQUE, external_auth_id UNIQUE, ...)` — RF-16 shape.
- `invites (id, token, org_id, role, invited_email, invited_by, expires_at, used_at, revoked_at, created_at)`.
- Full index list per RF-14.

**Infra:**
- CloudWatch + SNS + email alert pipeline (RF-8). Project memory `project_v2_alert_pipeline.md` flags this. ~1h setup. Blocks production cutover.

**Reserved log event names:**
- `event: "<flow>_rollback_failed"` (RF-8).
- `event: "<flow>_mismatch"` (RF-8).
- `event: "org_switch_revert_failed"` (RF-13).

**Standards locked across rapid-fire:**
- All TanStack Query keys for tenant-scoped data start with `['org', orgId, ...]` (RF-6, in `standards.md` §3).
- Indexes on hot paths locked at first migration (RF-14, in §2).
- `MembershipResolver` follows the swap-ready abstraction pattern (RF-14, in §8).
- `AuthService.verifyAccessToken()` normalization contract + no-raw-provider-SDK rule (RF-16, in §8).
- `users.id` decoupled from external auth ID per RF-16 (Q13 revision).
