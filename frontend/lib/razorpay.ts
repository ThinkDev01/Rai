// Razorpay Checkout loader + opener.
//
// Razorpay's widget is a hosted script (checkout.js) loaded on demand — no npm
// package, no key baked at build time (the backend hands us the public key id in
// the billing summary / subscribe response). This keeps billing config entirely
// server-side: turn on real billing by setting backend env, nothing to rebuild
// on the frontend.

import { logger } from '@/lib/logger';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// Minimal shape of what we use from the global Razorpay constructor.
interface RazorpayOptions {
  key: string;
  name: string;
  description?: string;
  /** Recurring: the subscription id. */
  subscription_id?: string;
  /** One-time: the order id + amount (paise). */
  order_id?: string;
  amount?: number;
  currency?: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  /** Per-method toggles — restricts what the widget offers (account-enabled
   *  methods still apply on top). We use this to enforce the policy below. */
  method?: Record<string, boolean>;
  handler: (resp: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
}
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loadPromise: Promise<boolean> | null = null;

/** Inject checkout.js once. Resolves true when the global is ready. */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      if (window.Razorpay) resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      logger.error('razorpay', 'Failed to load Razorpay checkout.js');
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export interface OpenCheckoutArgs {
  keyId: string;
  orgName: string;
  subscriptionId?: string | null;
  orderId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  email?: string | null;
  onSuccess: (resp: RazorpayPaymentResponse) => void;
  onDismiss: () => void;
}

/** Load + open the Razorpay widget. Returns false if the script can't load. */
export async function openCheckout(args: OpenCheckoutArgs): Promise<boolean> {
  const ready = await loadRazorpay();
  if (!ready || !window.Razorpay) return false;

  // Payment-method policy: CARD + UPI for both recurring and one-time.
  // Razorpay supports UPI Autopay mandates for recurring subscriptions —
  // PhonePe, Google Pay, Paytm, etc. all work the same as card mandates.
  // Other methods are off in both modes.
  const isRecurring = Boolean(args.subscriptionId);
  const method: Record<string, boolean> = {
    card:         true,
    upi:          true,
    netbanking:   false,
    wallet:       false,
    emi:          false,
    paylater:     false,
    cardless_emi: false,
    bank_transfer:false,
  };

  const options: RazorpayOptions = {
    key: args.keyId,
    name: args.orgName,
    description: isRecurring ? 'Rai subscription (auto-renew)' : 'Rai subscription (one month)',
    method,
    handler: args.onSuccess,
    modal: { ondismiss: args.onDismiss },
    theme: { color: '#6366f1' },
    ...(args.email ? { prefill: { email: args.email } } : {}),
    ...(args.subscriptionId ? { subscription_id: args.subscriptionId } : {}),
    // amount + currency only for one-time orders — subscriptions take amount from the plan
    ...(!args.subscriptionId && args.orderId ? { order_id: args.orderId } : {}),
    ...(!args.subscriptionId && args.amountCents != null ? { amount: args.amountCents } : {}),
    ...(!args.subscriptionId && args.currency ? { currency: args.currency } : {}),
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
  return true;
}

/** Format paise → a localized currency string, e.g. 5000 → "₹50.00". Used for
 *  amounts that come from Razorpay (invoices), which are in the smallest unit. */
export function formatCents(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Format whole rupees → "₹50". Used for our own prices/amounts (stored in ₹). */
export function formatInr(rupees: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(rupees);
  } catch {
    return `${currency} ${rupees}`;
  }
}
