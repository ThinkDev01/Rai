// Invite expiry cleanup job (RF-12).
//
// Org invites have a 7-day TTL. Once past expires_at and never accepted they're
// dead weight: they no longer appear on the Team page (the pending query filters
// expires_at > NOW()), but the row lingers and a never-revoked expired invite
// still occupies the at-most-one-live-invite-per-(org,email) unique slot. This
// job hard-deletes those lapsed-unaccepted invites so the table stays lean and
// re-inviting the same address never collides.
//
// Silent housekeeping — no notification (nobody needs to hear an unused invite
// was tidied up). Idempotent. Triggered daily by EventBridge; also runnable
// standalone: npm run jobs:invite-cleanup

import pool from '../config/db';
import logger from '../config/logger';
import { deleteExpiredInvites } from '../modules/invites/invites.model';

const ROUTE = 'jobs.invite-cleanup';

/** Delete expired unaccepted invites. Returns how many rows were removed. */
export async function runInviteCleanup(): Promise<number> {
  logger.info({ userId: 'system', route: ROUTE }, 'Invite cleanup - sweep begin');
  const deleted = await deleteExpiredInvites();
  logger.info({ userId: 'system', route: ROUTE, deleted }, 'Invite cleanup - sweep done');
  return deleted;
}

// Standalone run for manual testing: `npm run jobs:invite-cleanup`.
if (require.main === module) {
  runInviteCleanup()
    .then(async (n) => {
      await pool.end();
      logger.info({ userId: 'system', route: ROUTE, deleted: n }, 'Invite cleanup script finished');
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(
        { userId: 'system', route: ROUTE, error: (err as Error).message, stack: (err as Error).stack },
        'Invite cleanup script failed',
      );
      await pool.end().catch(() => { /* already failing - best effort */ });
      process.exit(1);
    });
}
