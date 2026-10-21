// The payment-provider abstraction (v2-decisions Q11 — locked).
//
// The app talks ONLY to this interface, never to a provider SDK directly
// (mirrors the AuthService / no-raw-SDK rule, dev-standards §8). Two impls:
//   - RazorpayBillingProvider — real (providers/razorpay.provider.ts)
//   - NoOpBillingProvider     — DB-only, no real charge (providers/noop.provider.ts)
// The factory (billing.factory.ts) picks one by env. Swapping providers is one
// file + zero controller/route changes.

/** Customer = the org as a billable entity in the provider. */
export interface CreateCustomerArgs {
  orgId: string;
  orgName: string;
  email: string;
}

export interface CreateRecurringArgs {
  customerId: string;
  /** The provider's recurring Plan id (Razorpay dashboard plan). */
  planId: string;
  /** Seat quantity = active members at subscribe time. */
  seats: number;
  /** Number of billing cycles to authorize (e.g. 120 = 10 years of monthly). */
  totalCount: number;
  notifyEmail: string;
  /** Unix timestamp to delay the first charge (used when upgrading from one_time mid-period). */
  startAt?: number;
}

export interface CreateRecurringResult {
  subscriptionId: string;
  /** Hosted checkout URL (fallback). Frontend normally opens the widget with subscriptionId. */
  shortUrl: string | null;
}

export interface CreateOrderArgs {
  /** Amount in the smallest currency unit (paise). */
  amountCents: number;
  currency: string;
  orgId: string;
  /** Idempotency / reconciliation tag shown on the order. */
  receipt: string;
}

export interface CreateOrderResult {
  orderId: string;
  amountCents: number;
  currency: string;
}

/** Razorpay handler payload echoed back from the one-time checkout widget. */
export interface VerifyOrderPaymentArgs {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** One past invoice / receipt for the billing page's download list. */
export interface InvoiceItem {
  id: string;
  /** Issue/paid date as ISO, or null. */
  date: string | null;
  /** Amount in the smallest currency unit (paise). */
  amountCents: number;
  currency: string;
  /** Provider status (e.g. 'paid', 'issued'). */
  status: string;
  /** Hosted invoice/receipt URL (downloadable PDF), or null. */
  downloadUrl: string | null;
  /** Payment origin: one-time order vs recurring subscription charge. */
  type: 'order' | 'subscription';
}

/** Normalized lifecycle event distilled from a provider webhook. */
export interface BillingWebhookEvent {
  /** What happened, mapped to our vocabulary. 'ignored' = no state change. */
  type: 'activated' | 'charged' | 'past_due' | 'canceled' | 'ignored';
  /** Provider subscription id this event concerns (null for order-only events). */
  providerSubscriptionId: string | null;
  /** New period end if the provider supplied one (epoch → ISO), else null. */
  currentPeriodEnd: string | null;
  /** Raw event name for logging. */
  rawEvent: string;
}

export interface BillingProvider {
  /** Human label for logs / the billing summary ('razorpay' | 'noop'). */
  readonly name: string;
  /** True when real charges happen (drives provider_live in the summary). */
  readonly isLive: boolean;
  /** Public key id for the frontend checkout widget, or null (NoOp). */
  readonly publicKeyId: string | null;

  createCustomer(args: CreateCustomerArgs): Promise<string>;

  /** Recurring (auto-renew) subscription. */
  createRecurringSubscription(args: CreateRecurringArgs): Promise<CreateRecurringResult>;

  /** One-time order for a single period (the "no auto-renew" path). */
  createOneTimeOrder(args: CreateOrderArgs): Promise<CreateOrderResult>;

  /** Verify the signature the checkout widget returns after a one-time payment. */
  verifyOrderPayment(args: VerifyOrderPaymentArgs): boolean;

  /** Verify the signature returned after a recurring-subscription authorization. */
  verifySubscriptionPayment(args: { subscriptionId: string; paymentId: string; signature: string }): boolean;

  /**
   * Cancel a subscription. atPeriodEnd=true keeps access until the period ends
   * (standard B2B); false cancels immediately.
   */
  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;

  /** Past invoices/receipts for a subscription (newest first). */
  listInvoices(providerSubscriptionId: string): Promise<InvoiceItem[]>;

  /** Captured payments for a one-time order — proof-of-payment for non-recurring orgs. */
  listPaymentsByOrder(orderId: string): Promise<InvoiceItem[]>;

  /** HMAC-verify a raw webhook body against the provider signature header. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;

  /** Distill a verified webhook payload into a normalized event. */
  parseWebhookEvent(payload: unknown): BillingWebhookEvent;
}
