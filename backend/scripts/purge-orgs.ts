// Purge job for soft-deleted orgs past their recovery window.
//
// Org delete is a soft-delete (migration 012): the row gets a `deleted_at`
// stamp and stays recoverable for ORG_RESTORE_WINDOW_DAYS via the restore
// endpoint. This job is the second half - it hard-deletes the rows whose window
// has lapsed, which cascades through every dependent table (user_orgs /
// projects / sprints / tickets / comments / invites / ticket_history) via the
// existing ON DELETE CASCADE foreign keys, and frees the slug.
//
// Runs as a standalone, idempotent script - safe to run any number of times;
// it only ever touches rows already past the window. Triggered daily by
// EventBridge; also runnable manually with `npm run purge:orgs`.

import pool from '../config/db';
import logger from '../config/logger';
import { ORG_RESTORE_WINDOW_DAYS } from '../modules/orgs/orgs.model';

export async function purgeExpiredOrgs(): Promise<number> {
  logger.info(
    { userId: 'system', route: 'purge-orgs', windowDays: ORG_RESTORE_WINDOW_DAYS },
    'Purge expired soft-deleted orgs - start',
  );

  // SUBSCRIPTION HOOK (wire in Phase 4 / Billing, see upgrades.md § Go-to-market
  // batch): before the hard delete below, cancel each org's Razorpay
  // subscription for good (the deleted window has lapsed; there's no coming
  // back). No-op today - v2 ships NoOpBillingProvider, nothing to cancel.

  const res = await pool.query<{ id: string; slug: string; name: string }>(
    `DELETE FROM organizations
      WHERE deleted_at IS NOT NULL
        AND deleted_at <= NOW() - make_interval(days => $1::int)
      RETURNING id, slug, name`,
    [ORG_RESTORE_WINDOW_DAYS],
  );

  const purged = res.rowCount ?? 0;
  if (purged > 0) {
    // Log the slugs freed - useful for "where did org X go" support questions.
    logger.info(
      { userId: 'system', route: 'purge-orgs', purged, slugs: res.rows.map(r => r.slug) },
      'Purge expired soft-deleted orgs - done (cascade complete, slugs freed)',
    );
  } else {
    logger.info(
      { userId: 'system', route: 'purge-orgs', purged: 0 },
      'Purge expired soft-deleted orgs - nothing past the window',
    );
  }
  return purged;
}

// Run directly when called as a script: npm run purge:orgs
if (require.main === module) {
  purgeExpiredOrgs()
    .then(async (n) => {
      await pool.end();
      logger.info({ userId: 'system', route: 'purge-orgs', purged: n }, 'Purge script finished');
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(
        { userId: 'system', route: 'purge-orgs', error: (err as Error).message, stack: (err as Error).stack },
        'Purge script failed',
      );
      await pool.end().catch(() => { /* already failing - best effort */ });
      process.exit(1);
    });
}
