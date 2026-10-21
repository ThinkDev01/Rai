// NoOp billing provider — writes to our DB, performs NO real charge.
//
// Used automatically when Razorpay env vars are absent (local dev, CI, any
// deploy where billing keys aren't set). Lets the entire billing UX + flow run
// end-to-end without money: "subscribing" instantly returns a synthetic id and
// the service marks the org active. This is what makes "just add the env later"
// work — the code path is identical, only the provider swaps.

import { uuidv7 } from 'uuidv7';
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

const ROUTE = 'billing.noop';

export class NoOpBillingProvider implements BillingProvider {
  readonly name = 'noop';
  readonly isLive = false;
  readonly publicKeyId = null;

  async createCustomer(args: CreateCustomerArgs): Promise<string> {
    const id = `noop_cust_${uuidv7()}`;
    logger.info({ route: ROUTE, orgId: args.orgId, customerId: id }, 'NoOp createCustomer — no real provider');
    return id;
  }

  async createRecurringSubscription(args: CreateRecurringArgs): Promise<CreateRecurringResult> {
    const id = `noop_sub_${uuidv7()}`;
    logger.info(
      { route: ROUTE, customerId: args.customerId, seats: args.seats },
      'NoOp createRecurringSubscription — marking active without charge',
    );
    return { subscriptionId: id, shortUrl: null };
  }

  async createOneTimeOrder(args: CreateOrderArgs): Promise<CreateOrderResult> {
    const id = `noop_order_${uuidv7()}`;
    logger.info(
      { route: ROUTE, orgId: args.orgId, amountCents: args.amountCents },
      'NoOp createOneTimeOrder — no real charge',
    );
    return { orderId: id, amountCents: args.amountCents, currency: args.currency };
  }

  // No signature on a NoOp order/subscription — accept so the confirm flow
  // completes in dev (there was no real payment to sign).
  verifyOrderPayment(_args: VerifyOrderPaymentArgs): boolean {
    return true;
  }

  verifySubscriptionPayment(_args: { subscriptionId: string; paymentId: string; signature: string }): boolean {
    return true;
  }

  async listInvoices(_subId: string): Promise<import('../billing.provider').InvoiceItem[]> {
    return [];
  }

  async listPaymentsByOrder(_orderId: string): Promise<import('../billing.provider').InvoiceItem[]> {
    return [];
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    logger.info({ route: ROUTE, providerSubscriptionId, atPeriodEnd }, 'NoOp cancelSubscription — DB-only');
  }

  // NoOp has no webhooks; if one somehow arrives, reject the signature.
  verifyWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    return false;
  }

  parseWebhookEvent(_payload: unknown): BillingWebhookEvent {
    return { type: 'ignored', providerSubscriptionId: null, currentPeriodEnd: null, rawEvent: 'noop' };
  }
}
