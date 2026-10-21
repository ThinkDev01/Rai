// Subscription expiry sweep.
//
// Trials end and non-renewing periods lapse on a date; nothing flips them to
// read-only on its own. This job does it: any trialing sub past trial_ends_at,
// or any active+auto_renew=false sub past current_period_end, is moved to
// 'past_due' and the org gate (organizations.subscription_status) is set to
// 'suspended' (read-only, per v2-decisions Q11). Recurring auto-renew subs are
// left alone — Razorpay charges them and the webhook keeps state current.
//
// Standalone + idempotent — safe to run repeatedly; only touches rows already
// past their date. Triggered daily by EventBridge; also runnable manually
// with `npm run billing:sweep`.

import pool from '../config/db';
import logger from '../config/logger';
import { sweepExpired, sweepTrialWarnings } from '../modules/billing/billing.service';

if (require.main === module) {
  // Run daily. Warnings first (7-day / 1-day pre-expiry), then the expiry sweep
  // (flips lapsed trials/periods to read-only + sends the "expired" notice once).
  Promise.resolve()
    .then(async () => {
      const warned = await sweepTrialWarnings();
      const swept = await sweepExpired();
      return { warned, swept };
    })
    .then(async ({ warned, swept }) => {
      await pool.end();
      logger.info({ userId: 'system', route: 'billing-sweep', warned, swept }, 'Billing sweep finished');
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(
        { userId: 'system', route: 'billing-sweep', error: (err as Error).message, stack: (err as Error).stack },
        'Billing sweep failed',
      );
      await pool.end().catch(() => { /* already failing - best effort */ });
      process.exit(1);
    });
}
