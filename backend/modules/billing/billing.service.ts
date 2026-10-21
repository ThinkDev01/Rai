// Billing module — public API. The ONLY surface other modules import from
// (orgs.controller calls ensureTrial here; never reaches into the model).
// Orchestrates: provider calls + DB writes + org-gate sync, in one place.

import logger from '../../config/logger';
import { notifyMany } from '../notifications/notifications.service';
import { getBillingProvider } from './billing.factory';
import * as model from './billing.model';
import { mapSubToGate } from './billing.model';
import type { BillingSummary, BillingMode, SubscriptionRow } from './billing.types';
import type { BillingWebhookEvent } from './billing.provider';

const ROUTE = 'billing.service';

// Authorize ~10 years of monthly cycles up front (Razorpay requires a finite
// total_count on a subscription). Effectively "until canceled".
const RECURRING_TOTAL_COUNT = 120;

/** Create the org's trial subscription if missing. Best-effort, idempotent.
 *  Returns the live subscription row (existing or just-created) so the caller
 *  can read trial_ends_at for the welcome notification. */
export async function ensureTrialForOrg(orgId: string): Promise<SubscriptionRow | null> {
  const plan = await model.getActivePlan();
  return model.ensureTrialSubscription(orgId, plan?.id ?? null);
}

/**
 * Build the billing page payload. Guarantees a trial row exists (covers orgs
 * created before billing shipped), recomputes the live seat count, and keeps
 * the cycle peak up to date.
 */
export async function getSummary(orgId: string): Promise<BillingSummary> {
  const provider = getBillingProvider();
  const plan = await model.getActivePlan();
  let sub = await model.getLiveSubscription(orgId);
  if (!sub) {
    // No live (trialing/active/past_due) sub. ensureTrial backfills ONLY for an
    // org that never had any subscription (legacy/new). A fully-cancelled org
    // gets null back here → fall through to its latest (canceled) row so the page
    // shows the real read-only state instead of a phantom fresh trial.
    sub = await model.ensureTrialSubscription(orgId, plan?.id ?? null);
    if (!sub) sub = await model.getLatestSubscription(orgId);
  }

  // Heal a drifted status BEFORE deriving the gate: an org can never legitimately
  // be past_due/canceled while a free trial is still running — no charge has been
  // taken yet. A stray provider cancel/charge webhook may have mislabeled it, so
  // restore 'trialing' to keep every internal read (getLiveSubscription, cancel,
  // the pill) consistent with the truth. Narrow on purpose: a genuinely lapsed
  // paid period (no trial future) is left as past_due — that's real dunning.
  if (sub && (sub.status === 'past_due' || sub.status === 'canceled') && model.isFuture(sub.trial_ends_at)) {
    const healed = await model.updateSubscription(sub.id, { status: 'trialing' });
    if (healed) {
      logger.info({ route: ROUTE, orgId, from: sub.status, to: 'trialing', trialEndsAt: sub.trial_ends_at }, 'Healed drifted subscription status to trialing (free trial still active)');
      sub = healed;
    }
  }

  // Self-heal the stored org gate to OUR access truth (trial/period dates), not
  // just the provider status. The gate (organizations.subscription_status) is what
  // the read-only banner + auth middleware read; webhooks/sweeps can leave it
  // drifted (e.g. a Razorpay cancel marking an org suspended while it still has
  // paid time). Correcting it on every billing load keeps the banner honest.
  const gate = sub ? model.gateForSubscription(sub.status, sub.trial_ends_at, sub.current_period_end) : null;
  if (sub && gate) {
    const currentGate = await model.getOrgGateStatus(orgId);
    if (currentGate !== gate && currentGate !== 'cancelled') {
      await model.setOrgGateStatus(orgId, gate);
      logger.info({ route: ROUTE, orgId, from: currentGate, to: gate, subStatus: sub.status }, 'Synced org gate to access-truth gate');
    }
  }

  const activeSeats = await model.countActiveSeats(orgId);
  // Keep the cycle high-water mark current (Maximum Quantity Billing).
  await model.raisePeakSeats(orgId, activeSeats);

  const pricePerSeat = plan?.price_per_seat_inr ?? 0;
  const peakSeats = Math.max(sub?.peak_seats ?? 1, activeSeats);

  return {
    status: sub?.status ?? 'trialing',
    gate_status: gate ?? mapSubToGate('trialing'),
    billing_mode: sub?.billing_mode ?? 'recurring',
    auto_renew: sub?.auto_renew ?? true,
    plan_name: plan?.name ?? 'Standard',
    price_per_seat_inr: pricePerSeat,
    currency: plan?.currency ?? 'INR',
    active_seats: activeSeats,
    peak_seats: peakSeats,
    amount_due_inr: activeSeats * pricePerSeat,
    trial_started_at: sub?.trial_started_at ?? null,
    trial_ends_at: sub?.trial_ends_at ?? null,
    current_period_end: sub?.current_period_end ?? null,
    canceled_at: sub?.canceled_at ?? null,
    provider_live: provider.isLive,
    razorpay_key_id: provider.publicKeyId,
  };
}

/** Past invoices/receipts for the org — full payment history, newest first.
 *  Combines subscription invoices (recurring) + order payments (one_time) so
 *  orgs that switched modes see every charge in one list. */
export async function getInvoices(orgId: string): Promise<import('./billing.provider').InvoiceItem[]> {
  const provider = getBillingProvider();
  // Latest (not live-only) so a cancelled/read-only org can still pull its
  // past receipts — invoices are history and shouldn't vanish on cancel.
  const sub = await model.getLatestSubscription(orgId);
  if (!sub) return [];
  try {
    const results: import('./billing.provider').InvoiceItem[] = [];
    if (sub.razorpay_subscription_id) {
      results.push(...await provider.listInvoices(sub.razorpay_subscription_id));
    }
    if (sub.razorpay_order_id) {
      results.push(...await provider.listPaymentsByOrder(sub.razorpay_order_id));
    }
    // Sort newest first across both sources
    return results.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
  } catch (err) {
    logger.warn({ route: ROUTE, orgId, error: (err as Error).message }, 'Fetch invoices failed - returning empty');
    return [];
  }
}

export interface SubscribeResult {
  mode: BillingMode;
  /** True when the NoOp provider activated instantly (no checkout needed). */
  activated: boolean;
  razorpayKeyId: string | null;
  /** Recurring: open Razorpay checkout with this subscription id. */
  subscriptionId: string | null;
  /** One-time: open Razorpay checkout with this order id + amount. */
  orderId: string | null;
  amountCents: number | null;
  currency: string | null;
}

/**
 * Start a paid subscription. mode='recurring' → auto-renewing Razorpay
 * subscription; mode='one_time' → a single-period order. Returns what the
 * frontend needs to open Razorpay checkout. On the NoOp provider it activates
 * immediately (activated=true) so dev/local needs no checkout.
 */
export async function subscribe(orgId: string, mode: BillingMode): Promise<SubscribeResult> {
  const provider = getBillingProvider();
  const plan = await model.getActivePlan();
  if (!plan) throw new Error('No active plan configured');

  // Find the row to attach the new subscription to: the live one, else a trial
  // backfill (only if the org NEVER had a sub), else resurrect a fully-cancelled
  // org's latest row into a live read-only state so reactivation works. Without
  // the last fallback a cancelled org throws "Could not load subscription".
  let sub = await model.getLiveSubscription(orgId);
  if (!sub) sub = await model.ensureTrialSubscription(orgId, plan.id);
  if (!sub) sub = await model.resurrectForReactivation(orgId);
  if (!sub) throw new Error('Could not load subscription');

  const seats = await model.countActiveSeats(orgId);
  // Razorpay's API takes the smallest unit (paise), so convert rupees → paise
  // here at the boundary. The DB/app stay in whole rupees.
  const amountCents = seats * plan.price_per_seat_inr * 100;
  logger.info(
    { route: ROUTE, orgId, mode, seats, pricePerSeatInr: plan.price_per_seat_inr, amountInr: seats * plan.price_per_seat_inr, subStatus: sub.status },
    'Subscribe - computed plan + seats',
  );

  // Backstop: the factory builds Razorpay or the boot guard aborts, so a
  // non-live provider should be impossible in a real deploy. Guard anyway —
  // never silently activate; always require a real Razorpay checkout.
  if (!provider.isLive) {
    logger.error(
      { route: ROUTE, orgId, mode },
      'Payment provider not configured — RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in the server environment',
    );
    throw new Error('Payment provider not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.');
  }

  const contact = await model.getOrgBillingContact(orgId);
  const notifyEmail = sub.billing_email ?? contact?.owner_email ?? '';

  // Org-level customer: one Razorpay customer per org, stored on organizations.
  // Persists across subscription cancellations/recreations so re-subscribing the
  // same org always reuses the same customer (and real owner email → invoices
  // reach the owner). Multi-org owners get separate customers because each org
  // has its own row — no fail_existing dedup needed.
  let customerId = await model.getOrgRazorpayCustomerId(orgId);
  if (!customerId) {
    logger.info({ route: ROUTE, orgId }, 'No Razorpay customer yet — creating one for the org');
    customerId = await provider.createCustomer({ orgId, orgName: contact?.org_name ?? 'Organization', email: notifyEmail });
    await model.setOrgRazorpayCustomerId(orgId, customerId);
    await model.updateSubscription(sub.id, { billing_email: notifyEmail });
    logger.info({ route: ROUTE, orgId, customerId }, 'Razorpay customer created + saved');
  } else {
    logger.info({ route: ROUTE, orgId, customerId }, 'Reusing existing Razorpay customer for the org');
  }

  if (mode === 'recurring') {
    // Plan id is env-first (RAZORPAY_PLAN_ID) so wiring billing is purely .env +
    // restart — no DB edit. Falls back to plans.razorpay_plan_id if you'd rather
    // store it in the table.
    const planRzpId = (process.env['RAZORPAY_PLAN_ID'] ?? '').trim() || plan.razorpay_plan_id;
    if (!planRzpId) throw new Error('Razorpay plan id not set (RAZORPAY_PLAN_ID env or plans.razorpay_plan_id)');

    // Defer the FIRST recurring charge to the end of whatever free/paid period the
    // org already has, so we never charge while they still have time they didn't
    // pay for and never double-bill a paid month:
    //   • on a free TRIAL  → first charge fires at trial_ends_at (Netflix-style:
    //     card saved now, money taken when the trial ends; cancel before then = ₹0).
    //   • on a PAID period → first charge fires at current_period_end (switching
    //     from one_time, or re-subscribing) — no gap, no double-bill.
    // Read-only/lapsed orgs have no period left to honour → charge immediately.
    // Defer the first charge to whatever access the org STILL has — its trial end
    // OR its paid-period end, whichever is further out. STATUS-INDEPENDENT on
    // purpose: re-subscribing mid-trial (after a cancel, when status is past_due/
    // canceled) must still defer to the trial end, not charge immediately.
    const now = Date.now();
    const trialEndMs  = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    const periodEndMs = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
    const boundaryMs  = Math.max(trialEndMs > now ? trialEndMs : 0, periodEndMs > now ? periodEndMs : 0);
    let startAt: number | undefined;
    if (boundaryMs > now) {
      startAt = Math.floor(boundaryMs / 1000);
      const deferReason = boundaryMs === trialEndMs ? 'trial' : 'paid-period';
      logger.info({ route: ROUTE, orgId, startAt, deferReason }, 'Deferring first recurring charge to end of current access period (no early/double charge)');
    }

    // Orphan-guard: if a Razorpay mandate is already attached (re-subscribing
    // while a deferred or live one exists), cancel it FIRST. Otherwise we'd
    // overwrite the stored id and leave the OLD mandate live on Razorpay → it
    // keeps charging = silent double-billing. Best-effort: an already-cancelled
    // id just no-ops; never block a fresh subscribe on it.
    if (sub.razorpay_subscription_id) {
      try {
        await provider.cancelSubscription(sub.razorpay_subscription_id, false);
        logger.info({ route: ROUTE, orgId, oldSubId: sub.razorpay_subscription_id }, 'Cancelled prior Razorpay mandate before creating a new one (no orphan double-charge)');
      } catch (err: unknown) {
        logger.warn({ route: ROUTE, orgId, oldSubId: sub.razorpay_subscription_id, error: err instanceof Error ? err.message : String(err) }, 'Could not cancel prior mandate (likely already cancelled) — continuing');
      }
    }

    const result = await provider.createRecurringSubscription({
      customerId,
      planId: planRzpId,
      seats,
      totalCount: RECURRING_TOTAL_COUNT,
      notifyEmail,
      ...(startAt !== undefined ? { startAt } : {}),
    });
    await model.updateSubscription(sub.id, {
      billing_mode: 'recurring',
      razorpay_subscription_id: result.subscriptionId,
      // NOTE: subscribe only OPENS checkout — nothing is paid yet. So we do NOT
      // flip auto_renew=true or clear canceled_at here; otherwise abandoning the
      // checkout would leave the org looking like a live auto-renewing sub
      // ("Renews on… / Cancel"). Both commit ONLY in activate() (confirmed
      // payment). billing_mode is set now because confirm() verifies by mode.
    });
    logger.info({ route: ROUTE, orgId, subscriptionId: result.subscriptionId, planId: planRzpId, seats, deferred: startAt !== undefined }, 'Recurring subscription created — awaiting checkout authorization');
    return {
      mode, activated: false, razorpayKeyId: provider.publicKeyId,
      subscriptionId: result.subscriptionId, orderId: null, amountCents, currency: plan.currency,
    };
  }

  // one_time
  const order = await provider.createOneTimeOrder({
    amountCents, currency: plan.currency, orgId, receipt: `org_${orgId}_${sub.id}`.slice(0, 40),
  });
  // Intent only — like the recurring branch, do NOT commit auto_renew or clear
  // canceled_at here; that happens in activate() on confirmed payment. billing_mode
  // is set so confirm() verifies by the right mode.
  await model.updateSubscription(sub.id, { billing_mode: 'one_time', razorpay_order_id: order.orderId });
  logger.info({ route: ROUTE, orgId, orderId: order.orderId, amountInr: order.amountCents / 100 }, 'One-time order created — awaiting checkout payment');
  return {
    mode, activated: false, razorpayKeyId: provider.publicKeyId,
    subscriptionId: null, orderId: order.orderId, amountCents: order.amountCents, currency: order.currency,
  };
}

/**
 * Confirm a checkout the user just completed in the widget.
 *   - one_time: verify the order payment signature, then activate.
 *   - recurring: Razorpay drives activation via the subscription.activated
 *     webhook, but we optimistically flip to active here too so the UI updates
 *     immediately (the webhook later confirms/extends the period).
 */
export async function confirmPayment(
  orgId: string,
  args: { orderId?: string; paymentId?: string; signature?: string; subscriptionId?: string },
): Promise<BillingSummary> {
  const provider = getBillingProvider();
  const sub = await model.getLiveSubscription(orgId);
  if (!sub) throw new Error('No subscription to confirm');
  logger.info({ route: ROUTE, orgId, mode: sub.billing_mode, paymentId: args.paymentId }, 'Confirm payment - verifying signature');

  if (sub.billing_mode === 'one_time') {
    if (!args.orderId || !args.paymentId || !args.signature) {
      throw new Error('Missing order payment fields');
    }
    const ok = provider.verifyOrderPayment({ orderId: args.orderId, paymentId: args.paymentId, signature: args.signature });
    if (!ok) {
      logger.warn({ route: ROUTE, orgId, orderId: args.orderId, paymentId: args.paymentId }, 'One-time payment signature INVALID — rejecting');
      throw new Error('Payment signature verification failed');
    }
  } else if (provider.isLive) {
    // Recurring: verify the subscription authorization signature so a caller
    // can't mark the org active without a real payment. (NoOp skips — no real
    // payment to sign.) The webhook remains the authoritative backstop.
    if (!args.subscriptionId || !args.paymentId || !args.signature) {
      throw new Error('Missing subscription payment fields');
    }
    const ok = provider.verifySubscriptionPayment({
      subscriptionId: args.subscriptionId, paymentId: args.paymentId, signature: args.signature,
    });
    if (!ok) {
      logger.warn({ route: ROUTE, orgId, subscriptionId: args.subscriptionId, paymentId: args.paymentId }, 'Subscription payment signature INVALID — rejecting');
      throw new Error('Payment signature verification failed');
    }
  }

  await activate(orgId, sub.billing_mode, null);
  logger.info({ route: ROUTE, orgId, mode: sub.billing_mode, paymentId: args.paymentId }, 'Payment confirmed — subscription active');
  return getSummary(orgId);
}

/**
 * Razorpay refuses to cancel a subscription that has not yet completed its first
 * billing cycle (still `created`/`authenticated`, no charge settled). The exact
 * wording varies by API version, so match the known phrasings. Any unmatched
 * provider failure is surfaced verbatim (logged + returned) rather than guessed.
 */
function isCycleNotComplete(msg: string): boolean {
  return /no billing cycle|cannot be cancelled|can(?:no|')t be cancelled|in created state|first billing/i.test(msg);
}

/**
 * Cancel the subscription. End-of-period by default (standard B2B — full access
 * through current_period_end); immediate=true flips to read-only now. Once a
 * Razorpay subscription is cancelled it CANNOT be revived — coming back is a
 * fresh `subscribe` (new mandate, new charge). There is intentionally no
 * "resume / turn auto-renew back on": cancel is the single off-switch.
 */
export async function cancel(orgId: string, immediate: boolean): Promise<BillingSummary> {
  const provider = getBillingProvider();
  const sub = await model.getLiveSubscription(orgId);
  if (!sub) throw new Error('No subscription to cancel');

  logger.info(
    { route: ROUTE, orgId, immediate, subStatus: sub.status, mode: sub.billing_mode, hasMandate: Boolean(sub.razorpay_subscription_id) },
    'Cancel subscription - start',
  );

  if (provider.isLive && sub.razorpay_subscription_id) {
    try {
      logger.info({ route: ROUTE, orgId, subId: sub.razorpay_subscription_id, atPeriodEnd: !immediate }, 'Cancelling Razorpay subscription');
      await provider.cancelSubscription(sub.razorpay_subscription_id, !immediate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Pre-charge cancel: Razorpay rejects cancel-at-period-end while no billing
      // cycle is running yet (still on a free trial, or the first charge is
      // deferred). There's no paid cycle to "end at", so cancel the mandate NOW
      // immediately — that stops the scheduled first charge from ever firing (₹0)
      // — and keep local access until current_period_end. The trial/period sweep
      // flips the org read-only at the boundary. This is the Netflix trial-cancel.
      if (!immediate && isCycleNotComplete(msg)) {
        logger.warn({ route: ROUTE, orgId, subId: sub.razorpay_subscription_id, error: msg }, 'No active billing cycle yet — cancelling mandate immediately so no charge is taken, keeping access until period end');
        try {
          await provider.cancelSubscription(sub.razorpay_subscription_id, false);
        } catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          logger.error({ route: ROUTE, orgId, subId: sub.razorpay_subscription_id, error: msg2 }, 'Provider refused immediate cancel of pre-charge subscription');
          const e = new Error(msg2);
          (e as NodeJS.ErrnoException).code = 'CANCEL_PROVIDER_ERROR';
          throw e;
        }
        if (model.isFuture(sub.trial_ends_at)) {
          // Cancelling before the trial ends, before any charge = the user simply
          // doesn't want to subscribe. Revert to a free-trial state so the page
          // shows "Free trial" again (not "Active"/"canceled") and the Subscribe
          // button returns — they ride out the remaining trial, then the sweep
          // flips read-only at trial end. We KEEP canceled_at as a marker so the
          // billing page can note "no charge — cancelled before the first charge"
          // instead of the bare first-time setup copy (re-subscribe clears it).
          await model.updateSubscription(sub.id, { status: 'trialing', auto_renew: false, canceled_at: nowIso() });
          logger.info({ route: ROUTE, orgId, trialEndsAt: sub.trial_ends_at }, 'Pre-charge cancel inside trial — reverted to free trial (no charge), Subscribe re-enabled');
        } else {
          await model.updateSubscription(sub.id, { auto_renew: false, canceled_at: nowIso() });
          logger.info({ route: ROUTE, orgId, accessUntil: sub.current_period_end ?? sub.trial_ends_at }, 'Pre-charge subscription cancelled — no charge taken, access retained until period end');
        }
        return getSummary(orgId);
      }
      // Unknown provider refusal — surface the real reason (admin-only screen) so
      // the user isn't stuck on a blind 500, and log it in full for debugging.
      logger.error({ route: ROUTE, orgId, subId: sub.razorpay_subscription_id, error: msg }, 'Provider refused cancel');
      const e = new Error(msg);
      (e as NodeJS.ErrnoException).code = 'CANCEL_PROVIDER_ERROR';
      throw e;
    }
  }

  if (immediate) {
    await model.updateSubscription(sub.id, { status: 'canceled', auto_renew: false, canceled_at: nowIso() });
    await model.setOrgGateStatus(orgId, 'suspended');
    logger.info({ route: ROUTE, orgId }, 'Subscription cancelled immediately — org set read-only');
  } else {
    // Keep access until period end; mark intent. The sweep/webhook flips it later.
    await model.updateSubscription(sub.id, { auto_renew: false, canceled_at: nowIso() });
    logger.info({ route: ROUTE, orgId, accessUntil: sub.current_period_end }, 'Subscription set to cancel at period end — access retained until then');
  }
  return getSummary(orgId);
}

/** Apply a verified provider webhook event to our state. */
export async function applyWebhookEvent(event: BillingWebhookEvent): Promise<void> {
  if (event.type === 'ignored' || !event.providerSubscriptionId) {
    logger.info({ route: ROUTE, rawEvent: event.rawEvent }, 'Webhook ignored — no state change');
    return;
  }
  const sub = await model.getSubscriptionByProviderId(event.providerSubscriptionId);
  if (!sub) {
    logger.warn({ route: ROUTE, providerSubId: event.providerSubscriptionId, rawEvent: event.rawEvent }, 'Webhook for unknown subscription');
    return;
  }

  switch (event.type) {
    case 'activated':
    case 'charged':
      await activate(sub.org_id, sub.billing_mode, event.currentPeriodEnd);
      break;
    case 'past_due': {
      // A failed/pending charge must NOT read-only an org that still has trial OR
      // paid time left (e.g. a deferred first-charge retry while the trial hasn't
      // ended). Defer to OUR access truth, never the provider's label: keep the
      // gate while time remains; the sweep suspends once nothing's left.
      if (model.hasFutureAccess(sub.trial_ends_at, sub.current_period_end)) {
        logger.info({ route: ROUTE, orgId: sub.org_id, trialEndsAt: sub.trial_ends_at, periodEnd: sub.current_period_end }, 'Webhook past_due but trial/period still active — keeping access, no read-only');
      } else {
        await model.updateSubscription(sub.id, { status: 'past_due' });
        await model.setOrgGateStatus(sub.org_id, 'suspended');
        logger.info({ route: ROUTE, orgId: sub.org_id }, 'Webhook past_due with no remaining access — org set read-only');
      }
      break;
    }
    case 'canceled': {
      // A cancellation while the org STILL has trial OR paid time left is a
      // *scheduled* cancel — keep full access until that boundary, then the sweep
      // flips it read-only. Only suspend now if NO promised time remains. This is
      // what lets a Netflix trial-cancel (immediate mandate cancel → instant
      // `subscription.cancelled` webhook) — and a re-subscribe that cancels the
      // old mandate — NOT wrongly read-only an org we still owe time. We check
      // BOTH trial_ends_at and current_period_end (was period-only → it suspended
      // mid-trial whenever current_period_end was null).
      if (model.isFuture(sub.trial_ends_at)) {
        // Cancelled while still in the free trial → back to a free trial (no charge
        // taken, mandate gone), keeping canceled_at as the "cancelled before
        // charge" marker. Matches cancel()'s pre-charge revert so a trial-cancel
        // always lands as "Free trial", never "Active"/"canceled".
        await model.updateSubscription(sub.id, { status: 'trialing', auto_renew: false, canceled_at: nowIso() });
        logger.info({ route: ROUTE, orgId: sub.org_id, trialEndsAt: sub.trial_ends_at }, 'Webhook: cancel inside trial — reverted to free trial (no charge)');
      } else if (model.isFuture(sub.current_period_end)) {
        await model.updateSubscription(sub.id, { auto_renew: false, canceled_at: nowIso() });
        logger.info({ route: ROUTE, orgId: sub.org_id, accessUntil: sub.current_period_end }, 'Webhook: subscription cancelled mid-paid-period — access retained until period end (sweep will read-only it later)');
      } else {
        await model.updateSubscription(sub.id, { status: 'canceled', auto_renew: false, canceled_at: nowIso() });
        await model.setOrgGateStatus(sub.org_id, 'suspended');
        logger.info({ route: ROUTE, orgId: sub.org_id }, 'Webhook: subscription cancelled with no remaining access — org set read-only');
      }
      break;
    }
  }
  logger.info({ route: ROUTE, orgId: sub.org_id, applied: event.type, rawEvent: event.rawEvent }, 'Webhook applied');
}

/** Sweep expired trials / lapsed non-renewing periods into read-only, and
 *  notify each org's owner+admins ONCE (the flip is one-way, so it can't repeat). */
export async function sweepExpired(): Promise<number> {
  const orgIds = await model.sweepExpiredToPastDue();
  for (const orgId of orgIds) {
    await model.setOrgGateStatus(orgId, 'suspended');
    const admins = await model.getOrgAdminUserIds(orgId);
    if (admins.length) {
      const contact = await model.getOrgBillingContact(orgId);
      await notifyMany(admins, {
        type: 'subscription_expired',
        orgId,
        link: '/settings/billing',
        data: { orgName: contact?.org_name ?? 'Your organization' },
      });
    }
  }
  if (orgIds.length) logger.info({ route: ROUTE, count: orgIds.length }, 'Swept expired subscriptions to read-only');
  return orgIds.length;
}

/** Fire trial pre-expiry warnings (7-day + 1-day marks) to owner+admins.
 *  Assumes a once-daily job — each org hits a mark on exactly one calendar day,
 *  so this never double-sends without any sent-tracking column. */
export async function sweepTrialWarnings(): Promise<number> {
  const rows = await model.findTrialsHittingWarning();
  for (const r of rows) {
    const admins = await model.getOrgAdminUserIds(r.org_id);
    if (!admins.length) continue;
    const trialEndsOn = new Date(r.trial_ends_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    await notifyMany(admins, {
      type: 'trial_expiring',
      orgId: r.org_id,
      link: '/settings/billing',
      data: { orgName: r.org_name, daysLeft: r.days, trialEndsOn },
    });
  }
  if (rows.length) logger.info({ route: ROUTE, count: rows.length }, 'Sent trial pre-expiry warnings');
  return rows.length;
}

// ── internal ────────────────────────────────────────────────────────────────

/** Flip a subscription to active, snapshot seats, set the period, sync the gate. */
async function activate(orgId: string, mode: BillingMode, periodEndIso: string | null): Promise<SubscriptionRow | null> {
  const sub = await model.getLiveSubscription(orgId);
  if (!sub) return null;
  // Read the gate BEFORE flipping — if the org was read-only (suspended/cancelled),
  // this activation is a REACTIVATION and we send the "you're back" notice. A
  // first-time subscribe from trial, or a normal renewal, is not.
  const priorGate = await model.getOrgGateStatus(orgId);

  const seats = await model.countActiveSeats(orgId);
  const periodStart = nowIso();
  // Period end precedence: an explicit value from the provider webhook wins; else,
  // if the org is still inside its free trial (charge deferred to trial end), run
  // the period to trial_ends_at so "renews/charges on" shows the real first-charge
  // date; else fall back to a 30-day period.
  const trialEndFuture = sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now()
    ? sub.trial_ends_at : null;
  const periodEnd = periodEndIso ?? trialEndFuture ?? thirtyDaysFromNowIso();

  const updated = await model.updateSubscription(sub.id, {
    status: 'active',
    billing_mode: mode,
    // Commit renewal intent ONLY now that payment is confirmed: recurring →
    // auto-renews, one-time → does not. (subscribe() no longer sets this, so an
    // abandoned checkout never leaves a false "auto-renew on".)
    auto_renew: mode === 'recurring',
    seats,
    peak_seats: seats, // new cycle — reset the high-water mark to the current count
    current_period_start: periodStart,
    current_period_end: periodEnd,
    // A fresh activation clears any pending cancel intent.
    canceled_at: null,
  });
  await model.setOrgGateStatus(orgId, 'active');

  const admins = await model.getOrgAdminUserIds(orgId);
  if (admins.length) {
    const contact = await model.getOrgBillingContact(orgId);
    const orgName = contact?.org_name ?? 'Your organization';

    if (priorGate === 'suspended' || priorGate === 'cancelled') {
      // Reactivation after read-only period
      await notifyMany(admins, {
        type: 'subscription_reactivated',
        orgId,
        link: '/settings/billing',
        data: { orgName },
      });
    } else if (priorGate === 'trial') {
      // First successful payment — trial converted to paid
      await notifyMany(admins, {
        type: 'subscription_activated',
        orgId,
        link: '/settings/billing',
        data: { orgName },
      });
    }
    // priorGate === 'active' = normal renewal, no notification needed
  }
  return updated;
}

function nowIso(): string {
  return new Date().toISOString();
}
function thirtyDaysFromNowIso(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}
