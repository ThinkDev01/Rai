# convo-071 — Billing Hardening: Access-Truth Gate + Edge-Case Sweep

**TL;DR**
- Live-testing the convo-070 Netflix billing flow surfaced a cascade of bugs; fixed them all in one pass.
- **Headline fix:** the read-only gate is now derived from **our own trial/paid-period dates**, not Razorpay's status label — so a cancellation webhook can never wrongly read-only an org that still has time owed. Validated 6/6 against the real staging DB.
- Also fixed: wrong-OTP logout (401→403), ₹129 charged on mid-trial resubscribe, double-billing orphan mandate, "Could not load subscription" on reactivate, phantom trials, invoices for cancelled orgs.
- Both ends typecheck clean; new gate unit test for CI; docs updated.
- **Next:** re-test the full loop tomorrow, then push to backend + frontend **dev branch**.

---

## Context — the testing cascade

Testing convo-070's subscribe→cancel→resubscribe loop against **staging RDS with a local backend** exposed that **Razorpay webhooks hit the DEPLOYED staging backend (old code)**, which writes `canceled`/`suspended` into the shared DB. That, plus several genuine logic gaps, produced a string of bad states (stuck banner, logout, wrong charges). Root-caused each via direct DB probes (`node + pg` one-off scripts).

---

## Fixes

### 1. Access-truth read-only gate ⭐ (headline)
**Problem:** the banner + write-gate read the stored `organizations.subscription_status` column, which a `subscription.cancelled` webhook (or stale state) sets to `suspended` — even when the org still has trial/paid time left.
**Fix:** derive the gate from **our** dates at read time.
- `billing.model.gateForSubscription(status, trialEndsAt, currentPeriodEnd)` — future trial/period ⇒ `trial`/`active`; only when no time remains does status decide (`suspended`).
- SQL mirror `EFFECTIVE_GATE_SQL` + `LATEST_SUB_JOIN` in `auth.model`, applied to **both** `getMembershipsForUser` (/me → banner) and `getMembership` (auth middleware → write-gate). Hard-`cancelled` orgs preserved.
- `getSummary` self-heals the stored column to the access-truth gate; returns it as `gate_status`.
- **Frontend billing page** drives `isTrial/isActive/isReadOnly` off `gate_status` (not raw `status`) — cancelled-with-time-left shows "access until X + reactivate", never a false read-only.
- **Validated 6/6** against staging DB (incl. the exact webhook-corrupt case: stored=`suspended`, sub=`canceled`, period future → resolves to `active`).
- **Robust even pre-deploy:** /me ignores the corrupt column and recomputes from dates.

### 2. Wrong OTP logged the user out
OTP-gate rejections returned **401**, and the axios interceptor treats any 401 as session-expired → forced logout. Changed OTP reject (wrong/expired/exhausted) to **403** in `otp.service` (semantically correct: authenticated, action-verification failed). Frontend OTP handlers only surface the message, so no client change needed.

### 3. ₹129 charged on mid-trial resubscribe
After cancel, the resurrected row is `past_due`, so the deferral (which checked `status === 'trialing'`) didn't fire → charged immediately. **Fix:** deferral is now **status-independent** — defers to whichever future boundary (trial end OR period end) the org still has.

### 4. Double-billing — orphan mandate (money bug)
`subscribe()` overwrote `razorpay_subscription_id` with a new mandate without cancelling the old one → the old mandate kept charging. **Fix:** cancel any existing mandate (best-effort) before creating the new one.

### 5. "Could not load subscription" on reactivate
A fully-cancelled org had no live row to attach to (after Fix #6 stopped phantom trials). **Fix:** `resurrectForReactivation` resets the latest row to a live `past_due` state so `subscribe`/`confirm` work.

### 6. Phantom trials + gate drift (from earlier in the cascade)
`ensureTrialSubscription` regenerated a fresh trial once all subs were `canceled` (trial farming). **Fix:** block a new trial if the org **ever** had any subscription; `getSummary` falls back to the latest sub + self-heals the gate.

### 7. Webhook `canceled` with future period (from earlier)
The webhook handler now keeps the org active (just marks not-renewing) when `current_period_end` is in the future; only suspends when no period remains.

### 8. Invoices for cancelled orgs
`getInvoices` used live-only sub → cancelled orgs lost their receipts. **Fix:** use `getLatestSubscription`.

### 9. Manage section detail line
Added "Renews on \<date\> · ₹X/month, auto-charged" above Cancel; banner auto-refreshes after pay/cancel via `refreshMemberships()`.

---

## Files touched
**Backend:** `billing.service.ts`, `billing.model.ts` (`gateForSubscription`, `getLatestSubscription`, `resurrectForReactivation`, ensureTrial guard), `auth.model.ts` (`EFFECTIVE_GATE_SQL` in both membership queries), `otp.service.ts` (403), `providers/razorpay.provider.ts` (cancel error-wrap, from convo-070), `tests/v2-api.test.ts` (gate unit test).
**Frontend:** `billing/page.tsx` (gate-driven UI, refreshMemberships, detail line), `hooks/useBilling.ts`, `content/billing.ts`.
**Docs:** `guide-billing.md` (access-truth read-only), `dev-standards.md` (§8 "derive state from our facts, not webhook labels").

---

## Environment note (not a code bug)
Razorpay webhooks call the **deployed** staging backend; local code can't intercept them. The access-truth gate makes the **banner + write-gate robust regardless**, but the underlying `subscriptions.status` will keep being set by the deployed handler until this branch is deployed. To test the raw cancel flow purely locally: temporarily disable the Razorpay test webhook, or tunnel it to local.

---

## Test status
- **Gate logic:** 6/6 PASS against staging DB (one-off script).
- **Full vitest suite:** can't run locally (no local PG; RDS safety guard) — runs in CI/pipeline. Added a pure-function gate test (`Billing gate (access-truth)`) for regression coverage.
- `tsc --noEmit` clean both repos.

---

## Next
1. Re-test the full loop tomorrow: subscribe-in-trial (₹0, charge deferred), cancel (₹0, access retained, no banner), resubscribe (defers to trial end), genuinely-expired → read-only.
2. **Push to backend + frontend `dev` branch.**
3. Deploy so the webhook handler + all fixes are live where Razorpay calls.
4. Carry-overs from convo-069/070: EventBridge+ALB config, `INTERNAL_JOB_SECRET`, Razorpay dashboard plan ₹5 → ₹129.
