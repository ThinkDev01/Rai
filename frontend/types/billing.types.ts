// Billing API shapes — mirror backend/modules/billing/billing.types.ts.

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingMode = 'recurring' | 'one_time';

export interface BillingSummary {
  status: SubStatus;
  gate_status: 'trial' | 'active' | 'suspended' | 'cancelled';
  billing_mode: BillingMode;
  auto_renew: boolean;
  plan_name: string;
  /** Whole rupees (₹). */
  price_per_seat_inr: number;
  currency: string;
  active_seats: number;
  peak_seats: number;
  /** Whole rupees (₹). */
  amount_due_inr: number;
  /** Trial window start (= org creation). Null if never trialed. */
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  provider_live: boolean;
  razorpay_key_id: string | null;
}

/** One past invoice/receipt (GET /billing/invoices). */
export interface Invoice {
  id: string;
  date: string | null;
  amountCents: number;
  currency: string;
  status: string;
  downloadUrl: string | null;
  /** Payment origin so the UI can label each row. */
  type: 'order' | 'subscription';
}

/** Response of POST /billing/subscribe — what we need to open Razorpay checkout. */
export interface CheckoutResult {
  mode: BillingMode;
  /** Always false — Razorpay always requires a checkout; kept for API shape. */
  activated: boolean;
  razorpayKeyId: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  amountCents: number | null;
  currency: string | null;
}
