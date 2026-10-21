# Convo 033 — v2 Decisions Q10 + Q11 Locked (Billing Policy)

**Date:** 13 May 2026

---

## What happened

Resumed the deferred-batch arc paused in convo-032. Locked **Q10 (free trial card)** and **Q11 (subscription expiry behavior)**, plus all the v2 billing-adjacent architecture they touch (pricing unit, payment provider abstraction, internal admin panel scope, schema shape, owner-leaves policy). Everything v3-specific parked in `upgrades.md` for the focused v3 billing conversation later.

---

## Q10 — Free trial: card on file

**Locked: A (no card, 30-day free trial).** v2 customer base is internal teams + initial customers — friction-free signup beats fraud protection at this stage. Advertised as "sign up, no card, 1 month free."

Companion locks under Q10:

- **Email verification required pre-org-creation.** Cognito-managed (free toggle). Persistent banner on app pages until verified. Unverified Cognito users can exist but cannot call `orgs.create`.
- **Trial duration:** 30 days (not "1 month" — calendar months drift).
- **Trial extension:** no self-serve. Internal admin panel handles via audit-logged button.
- **v2 → v3 migration:** mid-trial v2 users grandfathered to end of current trial. Card prompt happens at conversion to paid, same flow as a fresh v3 signup.
- **`payment_methods` table:** skipped in v2 entirely. Adding it in v3 is additive — no schema migration on `subscriptions`, just nullable `*_customer_id` / `*_subscription_id` columns staged from v2.

## Q11 — Subscription expiry behavior

**Locked: A modified — indefinite read-only on expiry.** No grace-then-hard-lock cliff in v2. Read-only persists until either (a) the org pays, or (b) v3 retention policy kicks in (Q14 will close that loop).

Companion locks under Q11:

- **Pre-expiry comms:** email at T-7d, T-1d, T-1h. No SMS (Cognito SMS MFA is the only SMS surface we use).
- **What's blocked under read-only:** create/edit/delete tasks, create/edit/close sprints, change task status, assign tasks, invite members, change org settings.
- **What still works:** login, view dashboards / tasks / sprints / members, export data, renew/add payment, cancel subscription, change own profile.
- **Reactivation:** instant on payment. No ops intervention.
- **Cancellation:** end-of-period. Pay on 1st, cancel on 15th → full access through end of billing period. Standard B2B SaaS.
- **Long-term retention after indefinite read-only:** deferred to Q14.

---

## Pricing structure (locked baseline)

| Aspect | Decision |
|---|---|
| Pricing unit | **Per-seat per member.** |
| Seat definition | Active members only (`org_members.status = 'active'`). Pending invites don't count. Removed users don't count. Removed + re-added = 1 seat. |
| Plan tiers | **Single plan, fully unlocked.** No Free/Pro/Enterprise tiers in v2. |
| Billing interval | Monthly only (annual deferred to v3). |
| Currency | INR only (multi-currency deferred to v3). |
| Mid-cycle seat add | v2: irrelevant (no money). **v3 recommendation: proration** via provider's native subscription-quantity API. |
| Minimum seats | 1 (the owner). Logic guarantee. |
| Billing target | **Org pays one combined invoice** (`active_seats × price_per_seat`). Individual members never see a bill or have a payment method. Per-seat is pricing math, not invoicing structure. |

**Key clarification reached in this session:** access is **org-level**, not per-user. Adding a new member mid-cycle does not change anyone's access state; expiry puts the **whole org** into read-only, not individual members.

---

## Payment provider — adapter pattern

**Locked: `BillingProvider` interface with pluggable implementations.**

```
BillingProvider (interface)
├── NoOpBillingProvider          ← v2: writes to local DB, no real billing
├── RazorpayBillingProvider      ← v3 likely default (India + INR + UPI + GST)
└── StripeBillingProvider        ← v3 alternative if expansion beyond India
```

Interface methods (initial shape):

```
createCustomer(org) → customerId
createSubscription(orgId, planId, seatCount) → subscriptionId
updateSeatCount(subscriptionId, newCount)
cancelSubscription(subscriptionId, atPeriodEnd: bool)
handleWebhook(payload, signature) → SubscriptionEvent
```

App talks to the interface, not the provider. v2 ships only `NoOpBillingProvider`. v3 swap = one DI line + webhook endpoint.

**Provider choice deferred to v3.** Strong lean toward **Razorpay** for India: ~2% fees (vs Stripe ~3%), native UPI/netbanking/wallets, GST invoicing built in, no Stripe India merchant-onboarding restrictions.

---

## Internal admin panel (new commitment in v2 scope)

Built alongside v2 — not a separate workstream. **Minimal scope:**

- Single `internal_admin` role login (no admin-vs-user role split inside the panel — flat permission model).
- **2FA mandatory from day one. TOTP only** (not SMS — SIM-swap risk + per-message cost). Use Cognito's MFA toggle on a separate `internal_admin` group / pool.
- Three screens:
  1. **Org list** — search by name / owner email; columns: name, status, `trial_ends_at`, member count.
  2. **Org detail** — members, subscription state, full subscription history.
  3. **Actions** — "Extend trial by N days" + "Set subscription status" buttons. Both audit-logged with actor, timestamp, and a required free-text "why".
- **No revenue dashboard.** Razorpay's own dashboard covers this in v3.
- **No ticketing system.** `support@…` shared inbox until volume justifies Zendesk/Intercom.

Beats direct-DB updates because: (1) audit trail, (2) no fat-finger UPDATE risk, (3) first CS hire can use it without an engineer.

---

## Schema additions for v2

```sql
-- orgs already exists from Q1 (multi-tenant core)
orgs (
  id, name, slug, owner_user_id,
  status,                  -- active | trialing | past_due | canceled | read_only
  created_at, updated_at
)

-- org_members IS the seat table
org_members (
  id, org_id, user_id,
  role,                    -- owner | admin | member
  status,                  -- active | invited | removed
  invited_at, joined_at, removed_at,
  created_at
)

-- one active subscription per org
subscriptions (
  id, org_id,
  status,                  -- trialing | active | past_due | canceled
  plan_id,
  trial_started_at, trial_ends_at,
  current_period_start, current_period_end,
  canceled_at,             -- set on user-initiated cancel; access continues until current_period_end
  billing_email,           -- nullable; defaults to owner.email
  razorpay_customer_id,    -- nullable, v3
  razorpay_subscription_id, -- nullable, v3
  stripe_customer_id,      -- nullable, v3 alt
  stripe_subscription_id,  -- nullable, v3 alt
  created_at, updated_at
)

plans (
  id, name,                -- v2: single plan, e.g. 'Standard'
  price_per_seat_cents,
  currency,                -- v2: 'INR' only
  billing_interval,        -- 'monthly' | 'annual'  (v2: only 'monthly' active)
  is_active,
  created_at
)
```

**Notes:**

- **No `seat_count` column on `subscriptions`.** Derived live from `COUNT(org_members WHERE org_id = ? AND status = 'active')`. Storing it creates a sync bug. v3 will snapshot seat count into an `invoices` table at billing time.
- **UNIQUE constraint:** at most one row per `org_id` with `status IN ('trialing','active','past_due')`. Historical canceled rows allowed.
- **`billing_profiles` table** (GSTIN, billing state, billing address) deferred to v3 — needed for GST invoicing.
- Both `razorpay_*` and `stripe_*` columns staged from v2; only one set populated based on v3 provider choice.

---

## Owner-leaves policy (companion lock)

- **Last owner cannot leave** without ownership transfer.
- **Owner transfer** is an explicit action — current owner picks the new owner from existing members. Role changes from `owner` → `member` on the outgoing one.
- **Stuck cases** (owner fired, ghosted, lost access): `internal_admin` can force-reassign via the admin panel.
- **Billing contact** defaults to owner's email. Can be overridden via `subscriptions.billing_email` (CFO / accounts email) for invoice receipts.

---

## Resume context — deferred batch remaining

| Status | Question |
|---|---|
| ✅ Locked this session | Q10, Q11 |
| 🔜 Still deferred | Q12 (service layer decomposition), Q13 ID format (mixed vs all-UUID), Q14 (org deletion — hard vs soft + retention) |

**Recommended pick-up order:**

1. **Q14 next** — closes the "indefinite read-only" loop from Q11. What eventually happens to a 6-month-stale read-only org? Retention policy, soft vs hard delete, GDPR.
2. **Q12** — service layer (BillingService now or later?). The schema above makes this much easier to answer.
3. **Q13 ID format** — smallest, independent. UUID vs mixed.

---

## Doc updates this session

- `docs/v2-decisions.md` — Q10 + Q11 moved to LOCKED with full discussion notes. Status table updated.
- `docs/v2-plans.md` — Subscription Model section rewritten with locked details (per-seat, INR, monthly, no card, indefinite read-only, BillingProvider adapter pattern, internal admin panel commitment).
- `docs/upgrades.md` — new "v3 Billing Follow-ups" section under Upcoming Features, capturing all parked items (GST/Razorpay specifics, dunning policy, refund policy, chargebacks, annual interval, multi-currency, discount codes, billing_profiles table, subscription pause, mid-cycle proration choice, reactivation-after-cancel window).
- `docs/devlog/convo-033-*.md` — this file.

## Memory state at end of session

No new memory entries needed — all decisions are doc-captured. `project_v2_multitenant.md` still accurate.
