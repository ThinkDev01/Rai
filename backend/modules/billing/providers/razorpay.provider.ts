// Razorpay billing provider — the real implementation (v2 default in prod).
//
// Activated automatically when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set
// (see billing.factory). All Razorpay SDK access is confined to THIS file —
// the rest of the app only sees the BillingProvider interface (dev-standards §8,
// no-raw-SDK rule).
//
// Recurring path  → Razorpay Subscriptions API (plan priced per seat in the
//                   dashboard; `quantity` = seat count; UPI-autopay/card mandate).
// One-time path   → Razorpay Orders API (amount = seats × price for one period).
// Webhooks        → HMAC-verified, distilled into BillingWebhookEvent.

import crypto from 'crypto';
import Razorpay from 'razorpay';
import logger from '../../../config/logger';
import type {
  BillingProvider,
  CreateCustomerArgs,
  CreateRecurringArgs,
  CreateRecurringResult,
  CreateOrderArgs,
  CreateOrderResult,
  VerifyOrderPaymentArgs,
  BillingWebhookEvent,
} from '../billing.provider';

const ROUTE = 'billing.razorpay';

/** Constant-time string compare — avoids timing leaks on signature checks. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Normalize an org name into a value Razorpay accepts as a customer name.
 * Razorpay validates this field: roughly letters/digits/spaces + a little
 * punctuation, AND rejects very short names (e.g. "fg" → "name format is
 * invalid"). The org name is only a billing label here, so we sanitize the
 * charset, collapse whitespace, pad to ≥3 chars, and cap at 50 — guaranteeing
 * ANY org name is billable without changing org-side behavior.
 */
function rzpCustomerName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9 .'_-]/g, '') // drop chars Razorpay rejects
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Organization';
  const padded = cleaned.length >= 3 ? cleaned : `${cleaned} Org`;
  return padded.slice(0, 50);
}

/** Razorpay sends period boundaries as epoch SECONDS; we store ISO. */
function epochToIso(sec: unknown): string | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

/**
 * Razorpay SDK errors are NOT standard `Error`s — the human-readable reason
 * lives in `err.error.description` (+ a `code`/`statusCode`), so logging
 * `(err as Error).message` yields an empty/undefined message and hides the real
 * cause. Re-throw as a normal Error carrying the description so the controller
 * log and the API response show WHAT actually went wrong (e.g. "Subscriptions
 * are not enabled", "plan_id is invalid").
 */
function rzpError(err: unknown, op: string): Error {
  const e = err as { statusCode?: number; error?: { code?: string; description?: string; reason?: string } };
  const desc = e?.error?.description ?? (err instanceof Error ? err.message : '') ?? '';
  const code = e?.error?.code ? ` [${e.error.code}]` : '';
  const status = e?.statusCode ? ` (HTTP ${e.statusCode})` : '';
  const reason = e?.error?.reason && e.error.reason !== 'NA' ? ` reason=${e.error.reason}` : '';
  return new Error(`Razorpay ${op} failed${status}${code}: ${desc || 'unknown error'}${reason}`);
}

export class RazorpayBillingProvider implements BillingProvider {
  readonly name = 'razorpay';
  readonly isLive = true;
  readonly publicKeyId: string;

  private readonly client: Razorpay;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor() {
    const keyId = (process.env['RAZORPAY_KEY_ID'] ?? '').trim();
    const keySecret = (process.env['RAZORPAY_KEY_SECRET'] ?? '').trim();
    this.webhookSecret = (process.env['RAZORPAY_WEBHOOK_SECRET'] ?? '').trim();
    if (!keyId || !keySecret) {
      // Should never happen — the factory only constructs this when both exist.
      throw new Error('RazorpayBillingProvider requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }
    this.publicKeyId = keyId;
    this.keySecret = keySecret;
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    logger.info({ route: ROUTE }, 'Razorpay provider initialized (live billing)');
  }

  async createCustomer(args: CreateCustomerArgs): Promise<string> {
    // fail_existing: 0 → if a customer with this email exists, reuse it instead
    // of erroring (idempotent across re-subscribes).
    // fail_existing '0' (string) = return existing customer for this email.
    // The SDK type expects 0|1|boolean but Razorpay's API only honours the string.
    let customer: { id: string };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer = await (this.client.customers.create as any)({
        name: rzpCustomerName(args.orgName),
        email: args.email,
        fail_existing: '0',
        notes: { orgId: args.orgId },
      }) as { id: string };
    } catch (err) {
      const wrapped = rzpError(err, 'customer create');
      logger.error({ route: ROUTE, orgId: args.orgId, error: wrapped.message }, 'Razorpay customer create failed');
      throw wrapped;
    }
    logger.info({ route: ROUTE, orgId: args.orgId, customerId: customer.id }, 'Razorpay customer created');
    return customer.id;
  }

  async createRecurringSubscription(args: CreateRecurringArgs): Promise<CreateRecurringResult> {
    // Razorpay subscriptions don't take a customer_id at creation — the customer
    // + autopay mandate are established during the checkout authorization. We
    // pass notify_info so Razorpay can send its own payment links/receipts.
    const payload: Record<string, unknown> = {
      plan_id: args.planId,
      quantity: args.seats,
      total_count: args.totalCount,
      customer_notify: 0,  // we open the checkout widget ourselves; Razorpay must not send a parallel payment-link email
      notify_info: { notify_email: args.notifyEmail },  // still used for post-payment invoice emails
      notes: { customerId: args.customerId },
    };
    // start_at delays the first charge — used when the org already paid for the
    // current period via one_time and is switching to recurring mid-period.
    if (args.startAt) payload['start_at'] = args.startAt;
    let sub;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sub = await this.client.subscriptions.create(payload as any);
    } catch (err) {
      const wrapped = rzpError(err, 'subscription create');
      logger.error({ route: ROUTE, planId: args.planId, seats: args.seats, error: wrapped.message }, 'Razorpay subscription create failed');
      throw wrapped;
    }
    const shortUrl = (sub as { short_url?: string }).short_url ?? null;
    logger.info(
      { route: ROUTE, subscriptionId: sub.id, seats: args.seats },
      'Razorpay recurring subscription created',
    );
    return { subscriptionId: sub.id, shortUrl };
  }

  async createOneTimeOrder(args: CreateOrderArgs): Promise<CreateOrderResult> {
    const order = await this.client.orders.create({
      amount: args.amountCents,
      currency: args.currency,
      receipt: args.receipt,
      notes: { orgId: args.orgId },
    });
    logger.info({ route: ROUTE, orderId: order.id, amountCents: args.amountCents }, 'Razorpay order created');
    return {
      orderId: order.id,
      amountCents: Number(order.amount),
      currency: order.currency,
    };
  }

  verifyOrderPayment(args: VerifyOrderPaymentArgs): boolean {
    // Razorpay rule: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${args.orderId}|${args.paymentId}`)
      .digest('hex');
    const ok = safeEqualHex(expected, args.signature);
    if (!ok) logger.warn({ route: ROUTE, orderId: args.orderId }, 'Razorpay order payment signature mismatch');
    return ok;
  }

  verifySubscriptionPayment(args: { subscriptionId: string; paymentId: string; signature: string }): boolean {
    // Razorpay rule for subscriptions: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret).
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${args.paymentId}|${args.subscriptionId}`)
      .digest('hex');
    const ok = safeEqualHex(expected, args.signature);
    if (!ok) logger.warn({ route: ROUTE, subscriptionId: args.subscriptionId }, 'Razorpay subscription payment signature mismatch');
    return ok;
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    try {
      await this.client.subscriptions.cancel(providerSubscriptionId, atPeriodEnd);
    } catch (err) {
      // Same as the create paths: Razorpay SDK errors carry their reason in
      // err.error.description, NOT err.message. Without this wrap the controller
      // logs an empty error AND the service's cycle-not-complete guard (which
      // matches on the message) can never fire — every cancel becomes a 500.
      const wrapped = rzpError(err, 'subscription cancel');
      logger.error({ route: ROUTE, providerSubscriptionId, atPeriodEnd, error: wrapped.message }, 'Razorpay subscription cancel failed');
      throw wrapped;
    }
    logger.info({ route: ROUTE, providerSubscriptionId, atPeriodEnd }, 'Razorpay subscription cancel requested');
  }

  async listPaymentsByOrder(orderId: string): Promise<import('../billing.provider').InvoiceItem[]> {
    const res = await this.client.orders.fetchPayments(orderId);
    return (res.items as unknown as Record<string, unknown>[])
      .filter((p) => p['status'] === 'captured')
      .map((p) => ({
        id:          String(p['id'] ?? ''),
        date:        epochToIso(p['created_at'] as unknown),
        amountCents: Number(p['amount'] ?? 0),
        currency:    String(p['currency'] ?? 'INR'),
        status:      'paid',
        downloadUrl: null,
        type:        'order' as const,
      }));
  }

  async listInvoices(subId: string): Promise<import('../billing.provider').InvoiceItem[]> {
    // Razorpay auto-generates one invoice per subscription charge; each carries a
    // hosted, downloadable PDF (short_url). No extra setup beyond the keys/plan.
    const res = await this.client.invoices.all({ subscription_id: subId, count: 24 });
    return res.items.map((inv) => ({
      id: inv.id,
      date: epochToIso(inv.paid_at ?? inv.issued_at ?? inv.date ?? null),
      amountCents: Number(inv.amount ?? 0),
      currency: inv.currency ?? 'INR',
      status: inv.status ?? 'issued',
      downloadUrl: (inv.short_url as string | null | undefined) ?? null,
      type: 'subscription' as const,
    }));
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.error({ route: ROUTE }, 'RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook');
      return false;
    }
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const ok = safeEqualHex(expected, signature);
    if (!ok) logger.warn({ route: ROUTE }, 'Razorpay webhook signature mismatch — dropping');
    return ok;
  }

  parseWebhookEvent(payload: unknown): BillingWebhookEvent {
    const p = (payload ?? {}) as {
      event?: string;
      payload?: { subscription?: { entity?: { id?: string; current_end?: number } } };
    };
    const event = p.event ?? 'unknown';
    const entity = p.payload?.subscription?.entity;
    const subId = entity?.id ?? null;
    const periodEnd = epochToIso(entity?.current_end);

    // Map Razorpay's event vocabulary to ours.
    let type: BillingWebhookEvent['type'] = 'ignored';
    switch (event) {
      case 'subscription.activated':
      case 'subscription.resumed':
        type = 'activated';
        break;
      case 'subscription.charged':
        type = 'charged';
        break;
      case 'subscription.halted':
      case 'subscription.pending':
        type = 'past_due';
        break;
      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.expired':
        type = 'canceled';
        break;
      default:
        type = 'ignored';
    }
    return { type, providerSubscriptionId: subId, currentPeriodEnd: periodEnd, rawEvent: event };
  }
}
