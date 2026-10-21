// Billing data access — the `plans` + `subscriptions` tables (migration 019).
// Pure DB; all orchestration (provider calls, gate sync) lives in billing.service.

import { uuidv7 } from 'uuidv7';
import pool from '../../config/db';
import type { SubscriptionStatus } from '../../types/common.types';
import { TRIAL_DAYS } from './billing.types';
import type { PlanRow, SubscriptionRow, SubStatus, BillingMode } from './billing.types';

const SUB_COLS = `
  id, org_id, plan_id, status, billing_mode, auto_renew, seats, peak_seats,
  trial_started_at, trial_ends_at, current_period_start, current_period_end,
  canceled_at, billing_email, razorpay_customer_id, razorpay_subscription_id,
  razorpay_order_id, created_at, updated_at
`;

/**
 * Map the detailed subscription status to the org-level read-only gate state
 * (organizations.subscription_status, read by the auth middleware).
 *   trialing → trial   active → active
 *   past_due → suspended (read-only, keeps context so they can reactivate)
 *   canceled → suspended (same — NOT 'cancelled', which would hide the org)
 */
export function mapSubToGate(status: SubStatus): SubscriptionStatus {
  switch (status) {
    case 'trialing': return 'trial';
    case 'active':   return 'active';
    case 'past_due': return 'suspended';
    case 'canceled': return 'suspended';
  }
}

/**
 * The org-level gate derived from OUR access truth — the trial/paid-period dates —
 * NOT just the provider's status label. An org that still has trial or paid time
 * remaining keeps FULL access (never read-only), even if the Razorpay subscription
 * was cancelled: they paid for / were promised that time. Only once no time is
 * left does the status decide (canceled/past_due → suspended). This is the single
 * source of truth for the read-only banner + write-gate; keep the SQL mirror in
 * auth.model `EFFECTIVE_GATE_SQL` in sync.
 */
export function gateForSubscription(
  status: SubStatus,
  trialEndsAt: string | null,
  currentPeriodEnd: string | null,
): SubscriptionStatus {
  if (status === 'trialing' && isFuture(trialEndsAt)) return 'trial';
  if (hasFutureAccess(trialEndsAt, currentPeriodEnd)) return 'active';
  // No future access left → read-only, regardless of the provider status label.
  // This MUST mirror auth.model `EFFECTIVE_GATE_SQL`'s ELSE branch: we can reach
  // here with status still 'trialing'/'active' (trial/period elapsed but the
  // daily sweep hasn't flipped the row yet) — those are suspended NOW, not on the
  // next sweep. (mapSubToGate would wrongly return 'trial'/'active' for them.)
  return 'suspended';
}

/** A timestamp strictly in the future (null/blank = not). */
export function isFuture(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() > Date.now();
}

/**
 * The org still holds promised time — a free trial OR a paid period that hasn't
 * elapsed — regardless of what label the provider put on the subscription. This
 * is THE guard every read-only decision must defer to (webhook cancel/past_due,
 * reactivation, status heal). We never read-only an org we still owe time, and
 * we never trust a Razorpay "cancelled"/"halted" to override our own dates.
 */
export function hasFutureAccess(trialEndsAt: string | null, currentPeriodEnd: string | null): boolean {
  return isFuture(trialEndsAt) || isFuture(currentPeriodEnd);
}

/** The single active plan. Returns null only if the catalog is empty. */
export async function getActivePlan(): Promise<PlanRow | null> {
  const res = await pool.query<PlanRow>(
    `SELECT id, name, price_per_seat_inr, currency, billing_interval,
            razorpay_plan_id, is_active, created_at
       FROM plans
      WHERE is_active = TRUE
      ORDER BY created_at ASC
      LIMIT 1`,
  );
  return res.rows[0] ?? null;
}

/** Live subscription for an org (trialing/active/past_due). Null if none. */
export async function getLiveSubscription(orgId: string): Promise<SubscriptionRow | null> {
  const res = await pool.query<SubscriptionRow>(
    `SELECT ${SUB_COLS} FROM subscriptions
      WHERE org_id = $1 AND status IN ('trialing','active','past_due')
      ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );
  return res.rows[0] ?? null;
}

/** The org's most recent subscription regardless of status (incl. canceled).
 *  Used by the billing summary so a fully-cancelled org reflects its real
 *  (read-only) state instead of falling back to phantom trial defaults. */
export async function getLatestSubscription(orgId: string): Promise<SubscriptionRow | null> {
  const res = await pool.query<SubscriptionRow>(
    `SELECT ${SUB_COLS} FROM subscriptions WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );
  return res.rows[0] ?? null;
}

/** Resolve a subscription by the provider's subscription id (webhook path). */
export async function getSubscriptionByProviderId(providerSubId: string): Promise<SubscriptionRow | null> {
  const res = await pool.query<SubscriptionRow>(
    `SELECT ${SUB_COLS} FROM subscriptions WHERE razorpay_subscription_id = $1 LIMIT 1`,
    [providerSubId],
  );
  return res.rows[0] ?? null;
}

/**
 * Live count of active members = seats we bill for. Every user_orgs row is an
 * active seat (membership IS the seat; there's no pending/removed status on the
 * row — pending invites live in the invites table, removals delete the row).
 */
export async function countActiveSeats(orgId: string): Promise<number> {
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM user_orgs WHERE org_id = $1`,
    [orgId],
  );
  return Number(res.rows[0]?.n ?? 0) || 1;
}

/**
 * Create the org's trial subscription if it doesn't already have a live one.
 * Idempotent via the WHERE NOT EXISTS guard (and the uq_subscriptions_org_live
 * partial unique index as the backstop). Called eagerly on org create and
 * lazily on first billing-page load (covers orgs created before this migration).
 */
export async function ensureTrialSubscription(orgId: string, planId: string | null): Promise<SubscriptionRow | null> {
  const id = uuidv7();
  // Trial dates derive from the ORG's created_at, not NOW(). So an org created
  // before billing shipped gets a correct trial window (e.g. created 40 days ago
  // ⇒ trial already ended), instead of a fresh 30 days starting at first
  // billing-page load. New orgs (created_at ≈ now) are unaffected.
  await pool.query(
    `INSERT INTO subscriptions
       (id, org_id, plan_id, status, billing_mode, auto_renew, peak_seats,
        trial_started_at, trial_ends_at)
     SELECT $1, o.id, $3, 'trialing', 'recurring', TRUE, 1,
            o.created_at, o.created_at + make_interval(days => $4::int)
       FROM organizations o
      WHERE o.id = $2
        AND NOT EXISTS (
          -- ANY prior subscription (incl. canceled) blocks a new trial. Without
          -- this a fully-cancelled org would silently mint itself a fresh free
          -- trial on the next billing-page load (trial farming + state drift).
          SELECT 1 FROM subscriptions WHERE org_id = $2
        )`,
    [id, orgId, planId, TRIAL_DAYS],
  );
  return getLiveSubscription(orgId);
}

/** Resurrect an org's latest subscription for reactivation so `subscribe` can
 *  attach a fresh Razorpay mandate and `confirm` (which reads getLiveSubscription)
 *  can find it. Returns null if the org never had a subscription at all (caller
 *  falls back to the trial backfill).
 *
 *  CRITICAL: an org can land here while still holding trial or paid time it was
 *  promised — e.g. it cancelled mid-trial (the Razorpay `subscription.cancelled`
 *  webhook flips the row to `canceled`, which getLiveSubscription excludes), then
 *  re-subscribed before the trial ended. Blindly resetting to read-only `past_due`
 *  and nulling current_period_end would falsely lock that org out and wipe the
 *  deferred first-charge boundary. So we restore to the LIVE status the remaining
 *  access maps to, and keep a still-future period; only a genuinely lapsed org
 *  (no time left) resets to past_due with a cleared period. */
export async function resurrectForReactivation(orgId: string): Promise<SubscriptionRow | null> {
  const latest = await getLatestSubscription(orgId);
  if (!latest) return null;
  const trialFuture  = isFuture(latest.trial_ends_at);
  const periodFuture = isFuture(latest.current_period_end);
  const status: SubStatus = trialFuture ? 'trialing' : periodFuture ? 'active' : 'past_due';
  return updateSubscription(latest.id, {
    status,
    auto_renew: false,
    // KEEP canceled_at: resurrect runs at re-subscribe INTENT (checkout not paid
    // yet). Clearing it here would wipe the "cancelled before charge" marker the
    // moment the user clicks Reactivate, so an abandoned checkout would lose the
    // note. Only activate() (confirmed payment) voids a prior cancel.
    razorpay_subscription_id: null,
    razorpay_order_id: null,
    // Preserve a still-future period boundary; clear only a stale (elapsed) one.
    ...(periodFuture ? {} : { current_period_end: null }),
  });
}

/** Patch a subscription row. Only the provided fields are written. */
export async function updateSubscription(
  id: string,
  fields: Partial<{
    status: SubStatus;
    billing_mode: BillingMode;
    auto_renew: boolean;
    seats: number;
    peak_seats: number;
    current_period_start: string | null;
    current_period_end: string | null;
    canceled_at: string | null;
    billing_email: string | null;
    razorpay_customer_id: string | null;
    razorpay_subscription_id: string | null;
    razorpay_order_id: string | null;
  }>,
): Promise<SubscriptionRow | null> {
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    const res = await pool.query<SubscriptionRow>(`SELECT ${SUB_COLS} FROM subscriptions WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
  const res = await pool.query<SubscriptionRow>(
    `UPDATE subscriptions SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${SUB_COLS}`,
    [id, ...values],
  );
  return res.rows[0] ?? null;
}

/**
 * Raise the cycle's peak seat count if the live count is higher (Maximum
 * Quantity Billing). Never lowers it within a cycle — that only resets on
 * renewal. Safe to call on every seat change.
 */
export async function raisePeakSeats(orgId: string, liveSeats: number): Promise<void> {
  await pool.query(
    `UPDATE subscriptions SET peak_seats = GREATEST(peak_seats, $2), updated_at = NOW()
      WHERE org_id = $1 AND status IN ('trialing','active','past_due')`,
    [orgId, liveSeats],
  );
}

/** Sync the org-level read-only gate (organizations.subscription_status). */
export async function setOrgGateStatus(orgId: string, gate: SubscriptionStatus): Promise<void> {
  await pool.query(
    `UPDATE organizations SET subscription_status = $2, updated_at = NOW() WHERE id = $1`,
    [orgId, gate],
  );
}

/** Current org-level gate state (organizations.subscription_status). */
export async function getOrgGateStatus(orgId: string): Promise<SubscriptionStatus | null> {
  const res = await pool.query<{ subscription_status: SubscriptionStatus }>(
    `SELECT subscription_status FROM organizations WHERE id = $1`,
    [orgId],
  );
  return res.rows[0]?.subscription_status ?? null;
}

/** Razorpay customer id stored at the org level — persists across subscription recreations. */
export async function getOrgRazorpayCustomerId(orgId: string): Promise<string | null> {
  const res = await pool.query<{ razorpay_customer_id: string | null }>(
    `SELECT razorpay_customer_id FROM organizations WHERE id = $1`,
    [orgId],
  );
  return res.rows[0]?.razorpay_customer_id ?? null;
}

/** Persist the Razorpay customer id on the org record. */
export async function setOrgRazorpayCustomerId(orgId: string, customerId: string): Promise<void> {
  await pool.query(
    `UPDATE organizations SET razorpay_customer_id = $2, updated_at = NOW() WHERE id = $1`,
    [orgId, customerId],
  );
}

/** Org display name + owner email + owner id — used for the provider customer + invoice default. */
export async function getOrgBillingContact(
  orgId: string,
): Promise<{ org_name: string; owner_email: string; owner_id: string } | null> {
  const res = await pool.query<{ org_name: string; owner_email: string; owner_id: string }>(
    `SELECT o.name AS org_name, u.email AS owner_email, u.id AS owner_id
       FROM organizations o
       JOIN user_orgs uo ON uo.org_id = o.id AND uo.role = 'owner'
       JOIN users u ON u.id = uo.user_id
      WHERE o.id = $1
      LIMIT 1`,
    [orgId],
  );
  return res.rows[0] ?? null;
}

/** Owner + admin user ids for an org — recipients of billing notifications. */
export async function getOrgAdminUserIds(orgId: string): Promise<string[]> {
  const res = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM user_orgs WHERE org_id = $1 AND role IN ('owner','admin')`,
    [orgId],
  );
  return res.rows.map((r) => r.user_id);
}

/**
 * Trials hitting a pre-expiry warning mark TODAY (assumes a once-daily job):
 * trial_ends_at falls on CURRENT_DATE + 7 (the 7-day warning) or + 1 (the
 * 1-day warning). Date-granular so each org matches a mark on exactly one day —
 * natural dedupe without a sent-tracking column.
 */
export async function findTrialsHittingWarning(): Promise<
  { org_id: string; org_name: string; trial_ends_at: string; days: number }[]
> {
  const res = await pool.query<{ org_id: string; org_name: string; trial_ends_at: string; days: number }>(
    `SELECT s.org_id, o.name AS org_name, s.trial_ends_at,
            CASE WHEN s.trial_ends_at::date = CURRENT_DATE + 7 THEN 7
                 WHEN s.trial_ends_at::date = CURRENT_DATE + 1 THEN 1 END AS days
       FROM subscriptions s
       JOIN organizations o ON o.id = s.org_id AND o.deleted_at IS NULL
      WHERE s.status = 'trialing'
        AND s.trial_ends_at::date IN (CURRENT_DATE + 7, CURRENT_DATE + 1)`,
  );
  return res.rows;
}

/**
 * Sweep expired trials and lapsed non-renewing periods into read-only.
 * Returns the org ids that flipped so the caller can sync the gate. Run by a
 * scheduler in prod (scripts/billing-sweep.ts), same pattern as purge-orgs.
 *   - trialing with trial_ends_at in the past  → past_due
 *   - active, auto_renew=false, period elapsed  → past_due
 * Recurring auto-renew subs are left alone — Razorpay charges them and the
 * webhook keeps state current.
 */
export async function sweepExpiredToPastDue(): Promise<string[]> {
  const res = await pool.query<{ org_id: string }>(
    `UPDATE subscriptions
        SET status = 'past_due', updated_at = NOW()
      WHERE status IN ('trialing','active')
        AND (
          (status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW())
          OR (status = 'active' AND auto_renew = FALSE
              AND current_period_end IS NOT NULL AND current_period_end < NOW())
        )
      RETURNING org_id`,
  );
  return res.rows.map((r) => r.org_id);
}
