// Manually fire ONE billing notification to a single org's owner+admins — for
// testing the in-app + email (+ push) delivery without waiting on the cron or
// touching any other org's state. Sends only; changes no DB rows.
//
// Usage:
//   npm run billing:test-notify -- <org-slug> started
//   npm run billing:test-notify -- <org-slug> expiring7
//   npm run billing:test-notify -- <org-slug> expiring1
//   npm run billing:test-notify -- <org-slug> expired
//
// Email needs SES configured (SES_FROM_EMAIL) and the recipient verified if SES
// is still in sandbox. In-app always lands in the bell.

import pool from '../config/db';
import logger from '../config/logger';
import { notifyMany } from '../modules/notifications/notifications.service';
import { getOrgAdminUserIds } from '../modules/billing/billing.model';
import type { NotificationType } from '../modules/notifications/templates';

const ROUTE = 'billing-test-notify';

function fmt(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

async function run(): Promise<void> {
  const slug = process.argv[2];
  const kind = process.argv[3] as 'started' | 'expiring7' | 'expiring1' | 'expired' | undefined;
  if (!slug || !kind || !['started', 'expiring7', 'expiring1', 'expired'].includes(kind)) {
    console.error('\nUsage: npm run billing:test-notify -- <org-slug> <started|expiring7|expiring1|expired>\n');
    process.exit(1);
  }

  const orgRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM organizations WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  const org = orgRes.rows[0];
  if (!org) { console.error(`\nNo active org with slug "${slug}".\n`); process.exit(1); }

  const admins = await getOrgAdminUserIds(org.id);
  if (!admins.length) { console.error(`\nOrg "${slug}" has no owner/admin to notify.\n`); process.exit(1); }

  let type: NotificationType;
  let data: Record<string, unknown>;
  switch (kind) {
    case 'started':   type = 'trial_started';        data = { orgName: org.name, trialDays: 30, trialEndsOn: fmt(30) }; break;
    case 'expiring7': type = 'trial_expiring';        data = { orgName: org.name, daysLeft: 7, trialEndsOn: fmt(7) };  break;
    case 'expiring1': type = 'trial_expiring';        data = { orgName: org.name, daysLeft: 1, trialEndsOn: fmt(1) };  break;
    case 'expired':   type = 'subscription_expired';  data = { orgName: org.name };                                    break;
  }

  await notifyMany(admins, { type, orgId: org.id, link: '/settings/billing', data });
  logger.info({ route: ROUTE, slug, type, recipients: admins.length }, 'Test billing notification fired');
  console.log(`\n  Fired "${type}" to ${admins.length} owner/admin(s) of "${org.name}" (@${slug}).\n  Check the bell + their email inbox.\n`);
}

run()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => {
    logger.error({ route: ROUTE, error: (err as Error).message }, 'billing-test-notify failed');
    await pool.end().catch(() => { /* best effort */ });
    process.exit(1);
  });
