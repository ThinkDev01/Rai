# Rai v2 — Billing & Subscription Guide

Plain-language "how does paying for Rai work." Written for everyone — support, sales, and the build team. Full reasoning lives in `v2-decisions.md` (Q10 free trial, Q11 expiry behavior) and `devlog/convo-033-v2-decisions-q10-q11-billing.md`.

Locked May 2026. This is the **what & why** — the technical schema/endpoints live in `../backend/guide - db.md` and `../backend/guide - backend.md`.

---

## The model in one line

**One organization, one subscription, one combined bill** — priced per active member, charged monthly in INR, after a 30-day free trial.

Billing is an **org-level** thing, never a per-person thing. Individual members never see a bill, never enter a card. The org pays once for everyone.

---

## The plan

Rai v2 has a **single plan, fully unlocked** — no Free / Pro / Enterprise tiers. Everyone gets every feature.

| Aspect | Decision |
|---|---|
| Tiers | One plan only. No feature gating. |
| Pricing unit | **Per seat** (per active member). |
| Seat = | An **active** member of the org. Pending invites don't count. Removed members don't count. |
| Price | Set in config (env / `plans` table) — e.g. ₹50 / seat / month. Changeable without a code change. |
| Currency | INR only (multi-currency is a later upgrade). |
| Interval | Monthly only (annual is a later upgrade). |
| Minimum | 1 seat (the owner). |

**Example:** 10 active members × ₹50 = **₹500 / month**, billed to the org as one invoice.

---

## The lifecycle

A new org walks through these states. The chip in the app header + Settings shows the current one.

| State | What it means | Can they use Rai? |
|---|---|---|
| **Trial** | First 30 days, no card needed. | ✅ Full access |
| **Active** | Paid & current. | ✅ Full access |
| **Suspended** | Trial ended without payment, or a renewal failed. | ⚠ **Read-only** |
| **Cancelled** | Reserved / manual end state. | ⚠ Read-only |

### 1. Trial — "sign up, no card, 1 month free"

- Starts automatically the moment the org is created. Lasts **30 days** (calendar-safe — exactly 30 days, not "a month").
- **No card required** to start. Friction-free onboarding.
- On creation, the owner gets a **welcome notification** (in-app + email) confirming the trial and its end date.
- A live **"X days left in your trial"** banner shows on **Settings** throughout the trial.
- We email the org owner before it ends: **7 days, 1 day, and 1 hour** before expiry. (Email only — no SMS.)

### 2. Paying — turns Trial → Active

- The owner/admin goes to **Settings → Billing** and subscribes.
- Payment is handled by **Razorpay**, **monthly auto-renew (recurring), card only** — a card mandate is set up so renewals charge automatically each month.
- ⚠ **One-time ("pay once") is retired.** The UI offers only recurring; no new one-time subscription can be created. **Legacy one-time orgs are handled gracefully:** they keep access until their paid period ends, the Manage panel shows a *"one-time payments are no longer offered — reactivate to switch to monthly auto-renew"* note, and reactivating moves them onto a normal recurring plan. The backend still verifies/serves their historical one-time invoices.
- **Subscribing during the trial doesn't charge you yet** (Netflix-style): the card mandate is saved now, but the **first charge is deferred to the trial-end date** — so you keep the rest of your free trial, and money is taken only when it ends. Cancel before then = ₹0 (see Cancelling). The billing page shows "first charge scheduled for \<date\>".
- Once paid, the org is **Active** and stays full-access.
- **Receipts:** every monthly charge generates a downloadable invoice (PDF) — listed under **Settings → Billing → Invoices & receipts**. *(GST tax-invoices with GSTIN come later; v2 gives the standard payment receipt.)*

### 3. Expiry → read-only (not deleted)

If the trial ends with no payment, or a renewal fails, the org goes **read-only** ("Suspended"). This is **indefinite** — we don't wipe data after X days in v2.

> **Read-only is decided by OUR access truth, not the payment provider's label.** The gate is computed from the org's own **trial / paid-period end dates** — so an org that still has trial or paid time owed keeps **full access** even if its Razorpay subscription was already cancelled (you cancelled but the month you paid for isn't over). Only when **no time is left** (trial ended *and* period ended) does it flip to read-only. This means a stray/early provider cancellation webhook can never wrongly read-only an org with time remaining. (Backend: `gateForSubscription` + the `EFFECTIVE_GATE_SQL` mirror in auth queries.)

| Under read-only — still works | Under read-only — blocked |
|---|---|
| Log in | Create / edit / delete tasks |
| View dashboards, tasks, sprints, members | Create / edit / close sprints |
| **Export your data** | Change task status, assign tasks |
| **Pay / reactivate** | Invite members |
| Cancel the subscription | Change org settings |
| Edit your own profile | |

The whole org flips together — a member added during read-only has the same access as everyone else (read-only). It's never per-person.

> **What the user sees:** a banner across the top — *"Your subscription expired. The organization is now in read-only mode."* Admins get a **Reactivate** button; non-admins are told *"contact your admin to renew."* If you're mid-edit when it lapses, the save fails with a clear *"Cannot save — subscription expired"* message and your unsaved text stays on screen.

### 4. Reactivating

- Admin clicks **Reactivate** → pays → the org flips back to **Active instantly**. No support ticket, no waiting.
- **Reactivating mid-trial** (cancelled while trial time remained, then came back): the org **stays on its existing trial** — same `trial_ends_at`, same days left, deferred first charge unchanged. It is **never** dropped to read-only `past_due` just because the cancel flipped the underlying status. Abandoning the re-subscribe checkout leaves the trial intact (no charge, no lockout). The status pill reflects the **access-truth gate** (trial/active), not the raw provider status.

---

## How the bill changes when the team changes

We follow the **same model as Jira / Atlassian Cloud** — *Maximum Quantity Billing with proration on adds*. Three rules cover every case:

| Change | What happens to the bill |
|---|---|
| **Add a member mid-cycle** | The new seat is **prorated** for the days left in the current cycle and added to your **next** invoice. From the next full cycle, it's a normal full seat. |
| **Remove a member mid-cycle** | **No refund, no credit.** You still pay for that seat for the rest of the cycle. The seat drops off only from the **next** cycle's base count. |
| **Net effect** | You're billed for the **highest seat count you reached during the cycle** (the "peak"). Removing then re-adding never lowers a cycle's bill. |

**Why this way:** it's the industry-standard SaaS model (Jira, Confluence) — adds are paid fairly pro-rata, removals don't let you game the bill down mid-cycle, and the math is predictable: *peak seats × price*.

> **Tip we surface to admins:** remove inactive members *before* adding new ones — that keeps your peak lower for the cycle.

### The numbers (₹50 / seat / month, 30-day cycle)

| Scenario | This cycle's bill | Next cycle's base |
|---|---|---|
| Start with 5 seats, no changes | 5 × ₹50 = **₹250** | ₹250 (5 seats) |
| Start 5, **add 1 on day 16** (14 days left) | ₹250 **+** prorated 1 × (14/30) × ₹50 ≈ **₹273** | ₹300 (6 seats) |
| Start 5, **add 1 on day 28** (2 days left) | ₹250 **+** 1 × (2/30) × ₹50 ≈ **₹253** | ₹300 (6 seats) |
| Start 5, **remove 1 on day 10** | **₹250** (no credit) | ₹200 (4 seats) |
| Start 5, **add 2 then remove 2** same cycle | billed for **peak 7** = ₹250 + prorated 2 | ₹250 (back to 5) |

So a person added 2 days before renewal *is* charged — but only for those 2 days, pro-rata (≈₹3 in the example), not a full month.

---

## Cancelling

- **One off-switch:** a single **Cancel subscription** button from **Settings → Billing** (OTP-confirmed). There's no separate "auto-renew toggle" — cancel *is* "stop renewing." (A cancelled Razorpay mandate can't be revived, so a toggle-back-on would be a lie; coming back is always a fresh paid subscribe.)
- **Netflix-style timing** — what you're charged on cancel depends on whether the first payment has been taken:
  - **Still in free trial / first charge not taken** → cancel takes **₹0**. The scheduled charge is killed and the org **reverts to a "Free trial"** state (pill shows *Free trial*, the **Subscribe** button returns) — you ride out the remaining trial days, then read-only at trial end. The Subscribe panel shows a *"No charge taken — you cancelled before the first charge; trial runs until \<date\>"* note (driven by the retained `canceled_at` marker; re-subscribing clears it), so it isn't mistaken for a never-subscribed first-time setup.
  - **Already on a paid month** → that **month stands** (no refund); you keep full access through `current_period_end`, then read-only.
- The user never sees an error for this — the backend picks the right cancel mode automatically.
- Once canceled, the billing page shows a **"Subscription canceled — access until <date>"** notice with a **Reactivate** button. Reactivate opens a **fresh checkout** (new mandate + payment); the new charge is scheduled at the current period end, so there's no gap or double-bill.
- After the period ends, the org goes read-only (same as expiry) — data is kept, reactivate any time.

> **Deleted orgs (recycle bin):** billing keeps ticking while an org is soft-deleted (v2 doesn't pause it), so the **"Recently deleted"** list shows each org's remaining **trial / subscription days left** alongside the "X days left to restore" — so the owner knows what they're restoring into.

### Access truth — never trust the provider's label over our dates

The read-only decision is **always** derived from *our* `trial_ends_at` / `current_period_end`, never from the status word Razorpay sends. One guard, `hasFutureAccess()` (trial **or** paid period still in the future), backs every path that could lock an org out:

- **Webhook `subscription.cancelled` / `halted` / `past_due`** — while any promised time remains, we only record intent (`auto_renew=false`); we **never** flip the org read-only. A cancel webhook fires on *every* mandate teardown — including the orphan-mandate cleanup when a user re-clicks Subscribe — so trusting it blindly would read-only a still-trialing org.
- **Reactivation mid-trial** — restores the matching **live** status and keeps the period boundary; a still-valid trial is never downgraded to `past_due` (see §Reactivating).
- **Cancel intent clears only on confirmed payment** — `subscribe` just opens checkout, so it leaves `canceled_at` in place; only `activate` (verified payment / webhook) voids a prior cancel. So if a user re-subscribes but **abandons** the checkout, the "cancelled before charge" note / scheduled-cancel view correctly **remains** — the cancel still stands until they actually pay.
- **Status self-heal** — on every billing-page load, a `past_due`/`canceled` row that still has a **future trial** is healed back to `trialing` (you can't be past-due during a free trial — nothing was charged). Genuine paid-period dunning is left alone.
- **Only the daily sweep** flips an org read-only, and only once `trial_ends_at` / `current_period_end` is actually in the **past**.

**Graceful settle (UI):** Razorpay's final state arrives via an async webhook a beat after the action returns, so the billing page refetches **twice** — immediately and again after ~2.5s — so the post-webhook truth reflects on its own with no manual refresh and no stale "read-only"/"pending" flash.

---

## Who can manage billing

From `guide-rbac.md` (org-level actions): **only owner + admin** can view or manage billing. PMs and users never see billing controls.

| Action | Owner | Admin | PM | User |
|---|:-:|:-:|:-:|:-:|
| View billing / invoices | ✓ | ✓ | – | – |
| Subscribe / pay | ✓ | ✓ | – | – |
| Cancel subscription | ✓ | ✓ | – | – |
| Reactivate | ✓ | ✓ | – | – |

Billing receipts go to the **owner's email** by default; an org can point invoices at a different address (e.g. accounts/CFO) via a billing-email override.

---

## Sensitive billing actions

Cancelling a subscription / changing the billing email reuse the same **email-OTP gate** as delete-org and transfer-ownership (see `guide-rbac.md` → OTP gate). A one-time code is emailed and must be entered to confirm — no accidental one-click cancels.

---

## What's deferred (later upgrades)

Parked in `upgrades.md` → "v3 Billing Follow-ups":

- Card required at signup (v2 = no card).
- GST invoicing, billing address / GSTIN profile.
- Annual billing, multi-currency, discount codes, subscription pause.
- Dunning (failed-payment retry schedule), refunds, chargebacks.
- A revenue dashboard (Razorpay's own dashboard covers this for now).

> **Now in v2 (was deferred):** mid-cycle **proration on adds** + **Maximum Quantity Billing** — adopted to match Jira. See "How the bill changes" above.

---

## Related docs

- `v2-decisions.md` Q10 — free trial (no card, 30 days).
- `v2-decisions.md` Q11 — expiry behavior (indefinite read-only, per-seat INR monthly, provider abstraction).
- `guide-rbac.md` — who can manage billing + the OTP gate.
- `../backend/guide - db.md` — `subscriptions` + `plans` tables.
- `../backend/guide - backend.md` — billing module + the read-only write-gate middleware.
- `upgrades.md` — v3 billing follow-ups.
