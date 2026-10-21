// Test helper — flip an EXISTING org into "trial ended / read-only" (or back),
// so you can walk the expiry flow with your own logged-in account.
//
// Why an existing org (not a fresh fake user): login goes through Cognito, so a
// seeded fake user can't actually sign in. Instead we take an org you already
// own/belong to and push its subscription past expiry — then log in normally and
// you'll see the read-only banner + blocked writes.
//
// Usage:
//   npm run seed:trial-ended -- <org-slug>          → expire it (read-only)
//   npm run seed:trial-ended -- <org-slug> reset    → back to a fresh 30-day trial
//   npm run seed:trial-ended -- <org-slug> active   → simulate a PAID active sub
//
// It ensures a subscription row exists first (covers orgs created before billing).

import pool from '../config/db';
import logger from '../config/logger';
import { getActivePlan, ensureTrialSubscription, getLiveSubscription, setOrgGateStatus } from '../modules/billing/billing.model';

const ROUTE = 'seed-trial-ended';

async function run(): Promise<void> {
  const slug = process.argv[2];
  const arg3 = process.argv[3];
  const mode: 'expire' | 'reset' | 'active' =
    arg3 === 'reset' ? 'reset' : arg3 === 'active' ? 'active' : 'expire';
  if (!slug) {
    console.error('\nUsage: npm run seed:trial-ended -- <org-slug> [reset|active]\n');
    process.exit(1);
  }

  const orgRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM organizations WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  const org = orgRes.rows[0];
  if (!org) {
    console.error(`\nNo active org with slug "${slug}".\n`);
    process.exit(1);
  }

  // Make sure a subscription row exists (idempotent).
  const plan = await getActivePlan();
  await ensureTrialSubscription(org.id, plan?.id ?? null);
  const sub = await getLiveSubscription(org.id);
  if (!sub) {
    console.error(`\nCould not ensure a subscription for "${slug}".\n`);
    process.exit(1);
  }

  if (mode === 'reset') {
    await pool.query(
      `UPDATE subscriptions
          SET status = 'trialing', trial_started_at = NOW(),
              trial_ends_at = NOW() + make_interval(days => 30),
              canceled_at = NULL, current_period_end = NULL, updated_at = NOW()
        WHERE id = $1`,
      [sub.id],
    );
    await setOrgGateStatus(org.id, 'trial');
    logger.info({ route: ROUTE, slug, orgId: org.id }, 'Reset to a fresh 30-day trial');
  } else if (mode === 'active') {
    // Simulate a paid, auto-renewing subscription with a current period.
    await pool.query(
      `UPDATE subscriptions
          SET status = 'active', billing_mode = 'recurring', auto_renew = TRUE,
              current_period_start = NOW(),
              current_period_end = NOW() + make_interval(days => 30),
              canceled_at = NULL, updated_at = NOW()
        WHERE id = $1`,
      [sub.id],
    );
    await setOrgGateStatus(org.id, 'active');
    logger.info({ route: ROUTE, slug, orgId: org.id }, 'Set to active paid subscription');
  } else {
    // Trial ended yesterday → past_due + org read-only.
    await pool.query(
      `UPDATE subscriptions
          SET status = 'past_due',
              trial_ends_at = NOW() - make_interval(days => 1), updated_at = NOW()
        WHERE id = $1`,
      [sub.id],
    );
    await setOrgGateStatus(org.id, 'suspended');
    logger.info({ route: ROUTE, slug, orgId: org.id }, 'Expired trial → org is now read-only');
  }

  // Show who can log in to test (owner/admin act; others see "contact admin").
  const members = await pool.query<{ email: string; role: string }>(
    `SELECT u.email, uo.role
       FROM user_orgs uo JOIN users u ON u.id = uo.user_id
      WHERE uo.org_id = $1
      ORDER BY CASE uo.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END`,
    [org.id],
  );

  const label = mode === 'reset' ? 'TRIAL (30 days)' : mode === 'active' ? 'ACTIVE (paid subscription)' : 'READ-ONLY (trial ended)';
  console.log(`\n  Org "${org.name}" (@${slug}) → ${label}`);
  console.log('  Log in with one of these to test:');
  for (const m of members.rows) console.log(`    - ${m.email}  [${m.role}]`);
  console.log('');
}

run()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => {
    logger.error({ route: ROUTE, error: (err as Error).message }, 'seed-trial-ended failed');
    await pool.end().catch(() => { /* best effort */ });
    process.exit(1);
  });
