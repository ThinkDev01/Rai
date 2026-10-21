# convo-070 — Billing Cancel Fix + Netflix-style Trial/Cancel Model

**TL;DR**
- Fixed the cancel 500 (`error: ""`): Razorpay's `cancelSubscription` wasn't wrapping its SDK error, so the real reason was lost and the cycle-guard never matched.
- Collapsed billing to **one off-switch**: removed the auto-renew toggle (UI + `PATCH /billing/auto-renew` + service/controller). Cancel is the only stop; coming back is a fresh subscribe.
- Adopted the **Netflix model**: subscribe-during-trial defers the first charge to trial-end (₹0 now); cancel auto-picks immediate-vs-period-end so the user **never** hits "no billing cycle."
- Both ends typecheck clean. **Next:** user to test (cancel-during-trial = ₹0 path), then commit + push.

---

## 1. The bug — cancel 500 with empty `error: ""`

- **Cause:** `razorpay.provider.ts → cancelSubscription` was the only provider method **not** wrapping the Razorpay SDK error. Razorpay errors carry their reason in `err.error.description`, not `err.message` → logged empty, and the service's `/no billing cycle/` guard matched against an empty string → fell through to a generic **500**.
- **Fix:** wrapped the cancel call in `try/catch` + `rzpError(...)` (same as `createCustomer`/`createSubscription`).
- **Confirmed real message:** `"Subscription cannot be cancelled since no billing cycle is going on"` — the regex guess was correct; the wrap was the whole problem.

---

## 2. Decision — one Cancel button, no auto-renew toggle

- Auto-renew-off and cancel(non-immediate) did the **same** Razorpay action → redundant + confusing.
- **Removed entirely:** `setAutoRenew` (service + controller), `PATCH /billing/auto-renew` route, `useSetAutoRenew` hook, the toggle UI, toggle copy.
- **Model:** Cancel = stop renewing (single off-switch). Coming back = fresh `POST /billing/subscribe` (a cancelled Razorpay mandate can't be revived; new charge scheduled at current period end → no gap/double-bill).

---

## 3. Netflix-style trial + cancel

| Situation | Subscribe | Cancel |
|---|---|---|
| **Free trial** | Card saved, **first charge deferred to trial-end** (₹0 now); page shows "first charge scheduled for \<date\>" | Mandate cancelled **immediately** → **₹0 ever**; access retained till period end, then read-only |
| **Paid month** | Charges, renews monthly | Cancel **at period end** — month stands (no refund), access till period end, then stops |

- User **never** sees an error — backend auto-picks immediate vs at-period-end.

### Backend `billing.service.ts`
- `subscribe()` — defers first charge: `startAt = trial_ends_at` (trial) or `current_period_end` (paid period); read-only/lapsed orgs charge immediately.
- `activate()` — period-end precedence: webhook value → else `trial_ends_at` (if future) → else 30 days. So a mid-trial subscribe runs its period to the real first-charge date.
- `cancel()` — on `isCycleNotComplete` **and** not immediate: cancel the mandate immediately on Razorpay (kills scheduled charge, ₹0), keep local access until period end, return clean 200. Unknown provider refusal → `CANCEL_PROVIDER_ERROR` → **502** with the real reason (no blind 500). `CYCLE_NOT_COMPLETE` 422 is gone (handled gracefully now).
- **Logging beefed up** across `subscribe` / `confirmPayment` / `cancel` (entry, branch, provider call, success/error) — structured, IST, auto-reqId.

### Frontend
- Removed the clutter "Auto-renew is on…" line and the dead 422 inline-note path (`cancelNote` state + `axios` import gone).
- Cancel copy now states: trial = ₹0, paid month stands, no refund.

---

## 4. Files touched

**Backend** — `providers/razorpay.provider.ts`, `billing.service.ts`, `billing.controller.ts`, `billing.routes.ts`, `tests/v2-api.test.ts` (auto-renew route now asserts 404), `.env.example` (unrelated `INTERNAL_JOB_SECRET` from convo-069 still pending), `Api-Documentation/billing-api/{docs,curl}.md`, `Api-Documentation/README.md` (7→6 billing, 69→68 total).

**Frontend** — `app/orgs/[slug]/settings/billing/page.tsx`, `app/orgs/[slug]/settings/page.tsx`, `hooks/useBilling.ts`, `content/billing.ts`, `types` untouched.

**Guide** — `guide-billing.md` (trial deferral + Netflix cancel timing).

---

## ⚠ Honest caveats for testing

- `current_period_end` is **optimistic** at confirm (= trial-end for a mid-trial subscribe); the real charge/period reconciles via the **Razorpay webhook** when the deferred charge fires at trial-end. So the deferred-charge → active transition depends on the webhook firing in test mode.
- The **cancel-during-trial = ₹0** path (the original blocker) works regardless of the webhook.
- We deliberately do **not** auto-fall-back to immediate cancel on a *paid* month — a slow first charge shouldn't suspend a real customer prematurely.

---

## Next
1. User tests: subscribe-during-trial (deferred charge note), cancel-during-trial (₹0, access retained), reactivate (fresh checkout).
2. Commit + push backend; pull into monorepo dev.
3. Carry-over from convo-069: EventBridge + ALB config per env, set `INTERNAL_JOB_SECRET`, Razorpay dashboard plan ₹5 → ₹129, update `upgrades.md` TODO (SSM → HTTP-endpoint).
