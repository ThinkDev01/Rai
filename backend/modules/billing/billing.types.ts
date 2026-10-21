// Billing module — shared types. Mirrors the `plans` + `subscriptions` tables
// (migration 019) and the BillingProvider contract.

import type { SubscriptionStatus } from '../../types/common.types';

/** Detailed subscription state (richer than the org-level gate's 4 values). */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

/** Recurring (auto-renew) vs one-time (pay-per-period, manual re-pay). */
export type BillingMode = 'recurring' | 'one_time';

/** Trial length — 30 calendar days, no card (v2-decisions Q10). */
export const TRIAL_DAYS = 30;

/** Days in a billing cycle, used for proration math (monthly). */
export const CYCLE_DAYS = 30;

export interface PlanRow {
  id: string;
  name: string;
  /** Whole Indian rupees (e.g. 50 = ₹50). Converted to paise only at the Razorpay call. */
  price_per_seat_inr: number;
  currency: string;
  billing_interval: 'monthly' | 'annual';
  razorpay_plan_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan_id: string | null;
  status: SubStatus;
  billing_mode: BillingMode;
  auto_renew: boolean;
  seats: number | null;
  peak_seats: number;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  billing_email: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_order_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What the billing page renders. Combines the live subscription, the plan,
 * the live seat count, and the computed amount due so the frontend never does
 * pricing math (single source = backend).
 */
export interface BillingSummary {
  status: SubStatus;
  /** The org-level gate state (drives read-only). */
  gate_status: SubscriptionStatus;
  billing_mode: BillingMode;
  auto_renew: boolean;
  plan_name: string;
  /** Whole rupees (₹). */
  price_per_seat_inr: number;
  currency: string;
  /** Live active-member count = seats we'd bill for right now. */
  active_seats: number;
  /** Highest seats reached this cycle (Maximum Quantity Billing). */
  peak_seats: number;
  /** active_seats × price_per_seat_inr (the recurring amount, in ₹). */
  amount_due_inr: number;
  /** Trial window start (= org creation). Null if never trialed. */
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  /** Whether real Razorpay is wired (vs the NoOp/dev provider). */
  provider_live: boolean;
  /** Razorpay public key id for the checkout widget (null on NoOp). */
  razorpay_key_id: string | null;
}
