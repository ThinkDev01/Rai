/**
 * Billing — all user-facing copy for the Settings → Billing page, the read-only
 * banner, and the cancel/auto-renew flows. Components import these constants
 * instead of inlining strings (see content/README.md). Plain-language; mirrors
 * Guide/guide-billing.md.
 */

export const BILLING = {
  title: 'Billing & subscription',
  subtitle: 'Manage your plan, seats, and payment for this organization.',

  status: {
    trialing:  'Free trial',
    active:    'Active',
    past_due:  'Payment due — read-only',
    canceled:  'Canceled — read-only',
  },

  // Pill label driven by the access-truth GATE, not the raw provider status — so
  // an org that still has trial/paid time never shows "read-only" just because a
  // cancel webhook flipped the underlying status to past_due/canceled.
  gate: {
    trial:     'Free trial',
    active:    'Active',
    suspended: 'Payment due — read-only',
    cancelled: 'Canceled — read-only',
  },

  trial: {
    /** %d replaced with days left. */
    daysLeft:  (days: number) => `${days} day${days === 1 ? '' : 's'} left in your free trial`,
    endsOn:    (date: string) => `Trial ends ${date}`,
    ended:     'Your free trial has ended',
    /** "Free trial: 17 Jun 2026 – 17 Jul 2026" */
    window:    (from: string, to: string) => `Free trial: ${from} – ${to}`,
    noChargeYet: 'You won\'t be charged until the trial ends — cancel before then and you pay nothing.',
  },

  seats: {
    label:     'Seats (active members)',
    /** seats × price, e.g. "5 members × ₹50". */
    breakdown: (seats: number, price: string) => `${seats} member${seats === 1 ? '' : 's'} × ${price}`,
    note:      'You\'re billed for the highest number of members during each cycle. Seats added mid-cycle are prorated; removals take effect next cycle.',
  },

  amount: {
    perMonth:  (amount: string) => `${amount} / month`,
    dueNow:    'Amount due',
  },

  mode: {
    label:      'Renewal',
    recurring:  'Auto-renew (recurring)',
    autoRenewOn:  'Auto-renew is on — we\'ll charge your saved method each month. Cancel anytime to stop.',
    autoRenewOff: 'Auto-renew is off — access ends at the period end unless you pay again.',
  },

  manage: {
    renewsOn:   (date: string) => `Renews on ${date}`,
    nextCharge: (amount: string) => `${amount}/month, auto-charged to your saved card`,
    /** Shown while still in trial — the deferred first charge lands at trial end. */
    firstCharge: (amount: string, date: string) =>
      `First charge ${amount} on ${date}, then ${amount}/month auto-charged to your saved card.`,
  },

  actions: {
    subscribe:        'Subscribe',
    subscribeRecurring: 'Subscribe with auto-renew',
    reactivate:       'Reactivate subscription',
    cancel:           'Cancel subscription',
    manage:           'Manage subscription',
  },

  choose: {
    title:    'Set up your subscription',
    recurring:'Set up once, renews automatically every month. Cancel anytime.',
    /** Shown when the user subscribed during the trial, then cancelled before the
     *  first charge — reassures them no money was taken and the trial continues. */
    canceledInTrial: (date: string) =>
      `No charge taken — you cancelled before the first charge. Your free trial runs until ${date}; re-subscribe any time before then.`,
  },

  canceled: {
    heading: 'Subscription canceled',
    // Same ending state, but the user didn't cancel — it's a one-time period or
    // auto-renew is simply off. Wording avoids implying a cancellation.
    notRenewing: 'Subscription won\'t renew',
    body:    (date: string) => `You keep full access until ${date}, then the organization switches to read-only. You won't be charged again. Reactivate anytime before then to keep it going.`,
    // Shown for legacy one-time orgs: that mode is retired; reactivating moves
    // them onto the standard monthly auto-renew like everyone else.
    oneTimeRetired: 'One-time payments are no longer offered — all plans are now monthly auto-renew. Reactivate to switch this organization over; it then works like any recurring plan.',
    reactivated: 'Subscription reactivated.',
  },

  cancel: {
    title:     'Cancel subscription',
    explain:   'You keep full access until the end of the current period, then it switches to read-only. You won\'t be charged again — and if you\'re still in your free trial (first payment not taken yet), you won\'t be charged at all. No refunds for the current period. Reactivate anytime — your data is kept.',
    confirm:   'Yes, cancel subscription',
    otpPrompt: 'For your security, enter the code we emailed you to confirm cancellation.',
    success:   'Subscription canceled. You keep full access until the period ends.',
  },

  banner: {
    admin:    'Your subscription has ended. This organization is now read-only.',
    member:   'This organization is read-only. Ask an owner or admin to renew the subscription.',
    cta:      'Go to billing',
    expiredToast: 'Can\'t save — your subscription has ended. Renew to continue editing.',
  },

  invoices: {
    title:    'Invoices & receipts',
    subtitle: 'Download receipts for your past payments.',
    empty:    'No invoices yet — receipts appear here after your first payment.',
    download: 'Download',
    none:     'Receipts become available once you\'re on a paid subscription.',
  },

  dev: {
    noProvider: 'Test mode: no payment provider configured — subscribing activates instantly with no charge.',
  },

  errors: {
    load:      'Could not load billing details.',
    subscribe: 'Could not start the subscription. Please try again.',
    confirm:   'Payment could not be verified. If you were charged, contact support.',
    cancel:    'Could not cancel the subscription.',
    checkoutDismissed: 'Checkout was closed before payment completed.',
  },
} as const;
