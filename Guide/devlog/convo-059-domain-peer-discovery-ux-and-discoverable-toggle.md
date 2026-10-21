# Convo 059 — Domain-peer discovery UX layer + owner-only `discoverable` toggle

**Date:** 27 May 2026

---

> **TL;DR**
> - **Where we are:** Domain-peer discovery is now a full UX layer — dismissible dashboard banner (per-user, per-org-id), a Settings reference card, and an owner-only `discoverable` privacy toggle (new `organizations.discoverable` column, default TRUE). Migration 009 applied locally.
> - **Fixed this convo:** icon-doesn't-flip + whole-settings-page-reload bug — replaced `hydrate()` (flips `isHydrating` → TransientShell flash) and the optimistic local patch with a silent `refreshMemberships()` that re-syncs from the DB without touching the render-gate.
> - **State:** frontend `tsc --noEmit` clean on all touched files (6 pre-existing unrelated errors parked).
> - **What's next:** parked polish — Pin tooltip wording, bulk dismiss/clear-all on Settings, optional audit-log for `discoverable` flips (all add-iff-asked).

---

## Why this convo

Convo-058 follow-ups (item 23) shipped the base domain-peer feature: a yellow info block on /welcome + a dashboard banner for admins/owners saying "another org in your email domain exists." Walkthrough today surfaced three follow-on UX gaps:

1. The dashboard banner shouted forever — no dismiss affordance once acknowledged.
2. Owners had no way to opt OUT of being shown in someone else's peer list — privacy hole.
3. The Settings page didn't surface peer info at all, so a dismissed banner was unrecoverable.

Plus one late-session bug: the `discoverable` toggle's icon didn't flip after click AND the whole settings page transient-shelled on every toggle. Root caused + fixed with a silent `/me` refetch helper.

## Architecture before / after

**Before (end of convo-058):**

| Surface | Behavior |
|---|---|
| `/welcome` create-org form | Yellow info block — peer org names always shown |
| Dashboard | Always-visible banner for admins/owners — peer org names |
| Settings | No peer-list surface |
| `organizations` table | No privacy column — every org visible to every same-domain user |
| `/orgs/discover-by-domain` | Returns every peer org; only privacy filter is the public-email-domain blocklist |

**After (this convo):**

| Surface | Behavior |
|---|---|
| `/welcome` | Same yellow block — but `Waiting for an invite?` bullet conditionally hidden when peer warning visible (less clutter) |
| Dashboard | Dismissible banner per user (localStorage). Dismissed list is per-org-id so dismissing org A doesn't dismiss org B that joins the domain later |
| Settings → Current organization | New **Discoverability** row (owner-only) — Eye/EyeOff toggle, helper text changes with state |
| Settings → Other organizations in your email domain | Always-visible reference card. Per-row: org name + Pin/PinOff (admin+, disabled when caller is owner of that org) + Eye/EyeOff (owner of that org only) |
| `organizations.discoverable` | New BOOLEAN NOT NULL DEFAULT TRUE column. Opt-in privacy (owner has to actively hide) |
| `/orgs/discover-by-domain` | Filters `discoverable = TRUE OR caller is member`. Owner sees their own hidden org; peers don't |
| `PATCH /orgs/:id` | Split gate: `name` requires admin+, `discoverable` requires owner-only |

## Files touched

**New:**

- `backend/config/migrations/009_orgs_discoverable.sql` — `ALTER TABLE organizations ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT TRUE`. Default TRUE so existing orgs stay visible; owner explicitly opts INTO privacy. NOT NULL avoids three-state truth in queries.
- `frontend/hooks/useDismissedDomainPeers.ts` — localStorage-backed list of dismissed org IDs (keyed per user-email). Exposes `dismissed`, `dismiss(ids)`, `undismiss(id)`, `reset()`. Pure browser state — never round-trips to backend (it's per-browser preference, not per-account).

**Modified backend:**

- `backend/modules/orgs/orgs.model.ts`
  - `findOrgsByOwnerEmailDomain(domain, callerUserId)` now joins `user_orgs` on the caller and returns rows where `o.discoverable = TRUE OR uo.user_id = $callerUserId`.
  - New `updateOrgDiscoverable(orgId, discoverable)` mutator. RETURNING clauses across the file extended to include `discoverable`.
- `backend/modules/orgs/orgs.controller.ts`
  - `updateOrg` split into two gates instead of one role check: `name` keeps admin+ requirement, new `discoverable` field requires `role === 'owner'`. 403 with explicit message if non-owner sends `discoverable` in the body.
  - `discoverOrgsByDomain` passes `req.user!.id` into the model.
  - `PUBLIC_EMAIL_DOMAINS` Set unchanged (~20 consumer hosts — gmail, outlook, yahoo, icloud, proton, aol, hotmail, live, msn, ymail, rocketmail, googlemail, gmx, fastmail, hey, duck, pm.me, mail, zoho, yandex, tutanota).
- `backend/modules/auth/auth.model.ts`
  - `MembershipRow` interface extended with `discoverable: boolean`.
  - Both `getMembershipsForUser` and `getMembership` SELECT `o.discoverable`.

**Modified frontend:**

- `frontend/types/auth.types.ts` — `Membership.discoverable: boolean`. Comment explains owner-only toggle.
- `frontend/store/auth.store.ts` — new `refreshMemberships(): Promise<void>` action. Silent re-fetch of `/me` that updates ONLY `memberships`. Critically does NOT flip `isHydrating: true` — so the org layout's render-gate doesn't swap to TransientShell, and Settings doesn't flash a "loading" state for a one-bit change. Best-effort: on error leaves existing memberships in place.
- `frontend/hooks/useDomainPeers.ts`
  - `useDomainPeers(emailOverride?)` — already accepted override after convo-058 for /welcome's pre-hydrate render. Unchanged.
  - New `useToggleOrgDiscoverable()` mutation. PATCH `/orgs/:id` with `{ discoverable }`, then `qc.invalidateQueries(['domain-peers'])` + `useAuthStore.getState().refreshMemberships()` in onSuccess. Toast confirms the new state.
- `frontend/app/welcome/page.tsx` — "Waiting for an invite?" bullet wrapped in `{!hasPeerWarning && (...)}` so the two-info blocks don't stack.
- `frontend/app/orgs/[slug]/dashboard/page.tsx`
  - Banner filters peers through `useDismissedDomainPeers().dismissed` and only renders if any remain.
  - `[Dismiss]` button on the banner calls `dismiss(peerIds)`.
- `frontend/app/orgs/[slug]/settings/page.tsx`
  - New `DiscoverabilityRow` component inside the **Current organization** section. Owner-only render gate (`role === 'owner'`). Reads `discoverable` from the current membership; calls `useToggleOrgDiscoverable` on click. Helper text changes: "Other users with your email domain can see <orgName>..." vs "<orgName> is hidden from other users in your email domain."
  - New `DomainPeersSection` component below Current organization. Always visible if peers exist (never dismissed here — this IS the reference surface). Per-row controls:
    - **Pin** (toggle): admin+ only; rebuilds dashboard banner visibility by removing the row from the dismissed-list. Disabled with tooltip when caller is the OWNER of that peer org (no point — owners don't get banner-shouted at their own org).
    - **Eye/EyeOff** (Discoverability): owner-only render. Same mutation as the Current-org row. Per-row helper text in tooltip.

**Migration applied to local DB + recorded in `schema_migrations`.**

## The icon-doesn't-flip + page-reload bug

User reported after the Discoverability row landed: "still showing hidden with eye close in yellow only if clicked twice too its the same alos now whole settings page is again loading its bad ux man really bad."

Root cause was a layered mistake:

1. `useToggleOrgDiscoverable.onSuccess` was calling `await useAuthStore.getState().hydrate()` to refresh the membership row.
2. `hydrate()` sets `isHydrating: true` at the top of its work.
3. The org layout's render-gate watches `isHydrating` and renders `<TransientShell />` (logo + spinner + footer) while it's true.
4. So every toggle showed the spinner-shell for the full `/me` round-trip — the "whole page is reloading" symptom.
5. Worse — the user's first attempt (before this convo) used a local-only `patchMembership(orgId, { discoverable })` action that *optimistically* flipped the zustand row. That avoided the shell but was a guess at server state instead of reading from the DB. User correctly flagged: "use api nah since its db thing not just anything else."

Both wrong for the same underlying reason: there should be one trustworthy source of truth (the DB), and the UI should sync from it without flipping the layout-level render-gate.

Fix shipped:

- Added `refreshMemberships()` action on the auth store. Hits `/me`, updates ONLY `memberships`. Never touches `isHydrating`. Best-effort on error.
- `useToggleOrgDiscoverable.onSuccess` calls `refreshMemberships()` instead of `hydrate()`.

Result: PATCH → silent /me → memberships in zustand reflect actual DB. Icon flips in the next render (no shell flash), tooltip helper text updates, dashboard banner updates downstream via the same row. Authoritative + smooth.

## Tradeoffs

- **Default discoverability = TRUE**, not FALSE. Reason: opt-IN to privacy matches user expectations from every B2B SaaS competitor; opt-OUT would mean newly-created orgs surprise their owners by being invisible. Privacy-conscious orgs flip it; everyone else stays peer-discoverable, which is the higher-utility default for the duplicate-org-prevention use case the feature exists for.
- **No new audit log entry.** A toggle of `discoverable` is owner-only by gate and trivially reversible — there's no destructive consequence to audit. If this ever influences billing or invite limits in v3, revisit.
- **`PATCH /orgs/:id` is still one endpoint.** Could have split it into `/orgs/:id` (name) + `/orgs/:id/discoverable` for cleaner gate separation, but adding a second endpoint for a single boolean field is overkill — controller-level gate split is sufficient and keeps the surface area minimal.
- **Pin is admin+, Eye is owner-only.** Admin can keep banner visible team-wide (their org might want to keep the warning live as a heads-up); only the owner can flip discoverability since that affects how OTHER orgs perceive theirs. Pin disabled (not hidden) for owners on their own row — visible affordance + tooltip is better UX than vanishing controls.

## Surfaced + parked

- **Pin tooltip wording polish** — currently "Pin to dashboard banner" / "Unpin from dashboard banner". Could be clearer; not urgent.
- **Bulk dismiss/clear-all on Settings** — if a user accumulates dismissed peers and wants to start over, no batch button. Per-row Pin works. Add iff users ask.
- **Audit log for `discoverable` flips** — see tradeoffs.

## Files reference

```
backend/config/migrations/009_orgs_discoverable.sql        NEW
backend/modules/orgs/orgs.model.ts                          discoverable column reads + writes
backend/modules/orgs/orgs.controller.ts                     split gate; caller-filter on discover
backend/modules/auth/auth.model.ts                          MembershipRow + SELECTs

frontend/hooks/useDismissedDomainPeers.ts                   NEW (localStorage)
frontend/hooks/useDomainPeers.ts                            useToggleOrgDiscoverable + final fix
frontend/store/auth.store.ts                                refreshMemberships() action
frontend/types/auth.types.ts                                Membership.discoverable

frontend/app/welcome/page.tsx                               conditional two-paths text
frontend/app/orgs/[slug]/dashboard/page.tsx                 dismissible banner
frontend/app/orgs/[slug]/settings/page.tsx                  DiscoverabilityRow + DomainPeersSection
```

## Frontend typecheck

`tsc --noEmit` — clean on every file touched. 6 pre-existing `'project' is possibly undefined` errors in `app/orgs/[slug]/projects/[id]/settings/page.tsx` are unchanged from before this session (parked for separate cleanup).
