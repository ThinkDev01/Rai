// ============================================================================
// Rai v2 — Hydra demo/test seed CLEANUP  (targets RDS via backend/.env)
// ============================================================================
// Wipes everything seed-hydra.ts created. One transaction; safe to re-run.
// Run with:  npm run seed:hydra:clean
//
// Deletion order is FK-safe:
//   1. all Hydra projects  -> cascades sprints, tickets, comments,
//      project_members, ticket_status_history (hydra had 0 real projects)
//   2. the 4 empty placeholder orgs (slug seed-empty-%) -> cascades user_orgs
//   3. the 59 fake users (email %@hydra-seed.test) -> cascades their
//      user_orgs / project_members rows; assignee/changed_by refs SET NULL
//
// The hydra org row itself and its owner (motaw) are left intact.
// ============================================================================

import pool from '../config/db';
import logger from '../config/logger';

const HYDRA_ORG_ID = '019e8d30-17c3-7096-be31-d509f91a6458';
const SEED_DOMAIN  = 'hydra-seed.test';
const log = (m: string, x: Record<string, unknown> = {}) => logger.info({ userId: 'system', route: 'seed:clean', ...x }, m);

async function clean(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('DELETE FROM projects WHERE org_id = $1', [HYDRA_ORG_ID]);
    const o = await client.query("DELETE FROM organizations WHERE slug LIKE 'seed-empty-%'");
    const u = await client.query(`DELETE FROM users WHERE email LIKE '%@${SEED_DOMAIN}'`);
    await client.query('COMMIT');
    log('CLEANUP COMPLETE ✓', { projectsDeleted: p.rowCount, emptyOrgsDeleted: o.rowCount, fakeUsersDeleted: u.rowCount });
    console.log(`\n✓ Hydra seed cleaned: ${p.rowCount} projects, ${o.rowCount} empty orgs, ${u.rowCount} fake users removed.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ userId: 'system', route: 'seed:clean', error: (err as Error).message }, 'Cleanup FAILED — rolled back');
    throw err;
  } finally {
    client.release();
  }
}

clean()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async () => { await pool.end().catch(() => {}); process.exit(1); });
