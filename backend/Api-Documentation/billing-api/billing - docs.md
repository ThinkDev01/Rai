# Billing API

Per-seat subscriptions for an org. **Owner/admin only** (except the webhook).
Product rules → `Guide/guide-billing.md`. All routes are under `/api/v1/billing`
and need `Authorization` + `X-Org-Id` (except the webhook, which is public + signed).

These routes use `attachOrgContext` (NOT the read-only write-gate) on purpose —
paying, reactivating, and cancelling must work while the org is read-only.

Our prices/amounts are **whole rupees** (`price_per_seat_inr`, `amount_due_inr`). Razorpay-sourced amounts (invoices, checkout `amount`) are in **paise** (×100) — that conversion happens at the Razorpay boundary only.

---

## GET /api/v1/billing

Billing summary for the current org. Lazily creates the trial row if missing.

**200**
```json
{
  "success": true,
  "data": {
    "billing": {
      "status": "trialing",
      "gate_status": "trial",
      "billing_mode": "recurring",
      "auto_renew": true,
      "plan_name": "Standard",
      "price_per_seat_inr": 50,
      "currency": "INR",
      "active_seats": 5,
      "peak_seats": 5,
      "amount_due_inr": 250,
      "trial_started_at": "2026-06-09T00:00:00.000Z",
      "trial_ends_at": "2026-07-09T00:00:00.000Z",
      "current_period_end": null,
      "canceled_at": null,
      "provider_live": false,
      "razorpay_key_id": null
    }
  },
  "error": ""
}
```
- `status` — detailed: `trialing` | `active` | `past_due` | `canceled`.
- `gate_status` — org read-only gate: `trial` | `active` | `suspended` | `cancelled`.
- `trial_started_at` / `trial_ends_at` — trial window bounds (start = org creation; 30-day span). Null if never trialed. UI renders the range + days-left and, for a subscribe-during-trial, the deferred first-charge date.
- `provider_live` — `false` ⇒ NoOp (test) provider; subscribing activates instantly.

**403** — caller isn't owner/admin. **500** — `Could not load billing`.

---

## GET /api/v1/billing/invoices

Past invoices/receipts for the org's recurring subscription, newest first. Each
carries a hosted, downloadable PDF link (`downloadUrl`). Empty array when there's
no live recurring subscription or the provider has none (NoOp/dev, or one-time
orders — Razorpay only auto-generates invoices for subscriptions).

**200**
```json
{
  "success": true,
  "data": {
    "invoices": [
      {
        "id": "inv_Xxx",
        "date": "2026-07-01T00:00:00.000Z",
        "amountCents": 25000,
        "currency": "INR",
        "status": "paid",
        "downloadUrl": "https://rzp.io/i/xxxx"
      }
    ]
  },
  "error": ""
}
```
**403** — not owner/admin. **500** — `Could not load invoices`.

---

## POST /api/v1/billing/subscribe

Start a paid subscription (or reactivate a read-only org).

Body: `{ "mode": "recurring" | "one_time" }`

**200** — returns what's needed to open Razorpay checkout. On the NoOp provider
`activated` is `true` (no checkout needed).
```json
{
  "success": true,
  "data": {
    "checkout": {
      "mode": "recurring",
      "activated": false,
      "razorpayKeyId": "rzp_test_xxx",
      "subscriptionId": "sub_Xxx",
      "orderId": null,
      "amountCents": 25000,
      "currency": "INR"
    }
  },
  "error": ""
}
```
- `recurring` → open checkout with `subscription_id`.
- `one_time`  → open checkout with `order_id` + `amount`.

**400** — `mode must be 'recurring' or 'one_time'`. **502** — provider/config error.

---

## POST /api/v1/billing/confirm

Confirm a completed checkout (or reactivate). The frontend calls this from the
Razorpay success handler.

Body (one-time): `{ "orderId", "paymentId", "signature" }`
Body (recurring): `{ "subscriptionId", "paymentId", "signature" }`

For `one_time` the order-payment signature is HMAC-verified before activation.
**200** — returns the updated `billing` summary. **400** — `Payment could not be verified`.

---

## POST /api/v1/billing/cancel

Cancel the subscription. **OTP-gated** — first call `POST /api/v1/otp/request`
with `{ "action": "cancel_subscription", "targetId": "<org id>" }`, then pass the
emailed code here. End-of-period by default (full access through
`current_period_end`, then read-only); `"immediate": true` flips to read-only now.

> **Single off-switch.** There is no separate "auto-renew toggle" / "resume" —
> cancel is the only way to stop, and coming back is a fresh `POST /billing/subscribe`
> (a cancelled Razorpay mandate can't be revived; the new charge is scheduled at
> the current period end, so no gap or double-bill).

**Netflix-style charge handling** (transparent to the caller — always a clean 200):
- **First charge already taken** (live billing cycle) → Razorpay cancel-at-period-end. The current paid month stands (no refund); access runs to `current_period_end`.
- **First charge NOT taken yet** (still on free trial, or charge deferred to period end) → the mandate is cancelled **immediately** on Razorpay so the scheduled charge never fires (**₹0 billed**), while local access is retained until `current_period_end`. The trial/period sweep flips the org read-only at the boundary.

Body: `{ "code": "123456", "immediate": false }`
**200** — updated `billing` summary (both cases above).
**400/401** — OTP missing / wrong / expired (codes from the OTP gate).
**502** — `Could not cancel with the payment provider: <reason>` — the provider refused the cancel; the real reason is included.

---

## POST /api/v1/billing/webhook

**Public**, provider-to-server. Mounted before `express.json` with a raw body so
the `x-razorpay-signature` HMAC (keyed by `RAZORPAY_WEBHOOK_SECRET`) can be
verified. Drives `subscription.activated/charged/halted/cancelled` → state sync.

**200** on any verified event (even ignored ones, so the provider doesn't retry).
**400** — missing raw body / signature / bad JSON. **401** — invalid signature.
