// ============================================================================
// Rai v2 — Hydra demo/test seed  (targets RDS via backend/.env)
// ============================================================================
// Loads realistic-volume fake data into the EXISTING `hydra` org so the
// staging UI can be exercised end-to-end. Run with:  npm run seed:hydra
//
// What it creates (per user request 2026-06-03):
//   • Hydra org (existing) gets 60 members total = owner motaw + 59 fake users
//   • 10 projects in Hydra
//   • 10 sprints per project (exactly 1 active, rest planned/completed)
//   • 20–40 tickets per project, spread across its sprints + backlog
//   • 5–40 comments per ticket — flat replies, some leading with an @mention
//     to read as a "reply to a reply" (keeps the depth-1 invariant, mig 010)
//   • each project gets a random 10–60 member subset of the 60 (owner always in)
//   • the test user (motaw) ends up in 5 orgs: hydra + 4 empty placeholder orgs
//
// FAKE-DATA FILTER / CLEANUP (nothing is "kept"; easy to wipe later):
//   • fake users      : email LIKE '%@hydra-seed.test'
//   • empty fake orgs : slug  LIKE 'seed-empty-%'
//   • all Hydra projects + descendants (hydra had 0 real projects)
//   Teardown script:  npm run seed:hydra:clean   (scripts/seed-hydra-cleanup.ts)
//
// Idempotent: re-running first wipes prior seed data, then re-inserts, all
// inside ONE transaction — any failure rolls back fully.
// ============================================================================

import { uuidv7 } from 'uuidv7';
import pool from '../config/db';
import logger from '../config/logger';

// ---- Fixed identities (verified against RDS 2026-06-03) ---------------------
const HYDRA_ORG_ID = '019e8d30-17c3-7096-be31-d509f91a6458';
const OWNER_ID     = '019e8d2e-b5bb-77ae-9781-be0e64f85212'; // motaw23722@bncinema.com
const SEED_DOMAIN  = 'hydra-seed.test';

// ---- Tunables --------------------------------------------------------------
const ORG_MEMBERS_TOTAL = 60;   // owner + 59 fake
const PROJECT_COUNT     = 10;
const SPRINTS_PER_PROJ  = 10;
// Active sprint is loaded heavily so the dashboard's active-sprint board reads
// dense; the remaining sprints + backlog get a lighter spread for the rest of
// the app. (User: each project's active sprint must hold ≥70 tickets.)
const ACTIVE_TICKETS_MIN = 70, ACTIVE_TICKETS_MAX = 90;
const TICKETS_MIN = 20, TICKETS_MAX = 40; // spread across the 9 non-active sprints + backlog
const COMMENTS_MIN = 5, COMMENTS_MAX = 40;
const PMEMBERS_MIN = 10, PMEMBERS_MAX = 60;
const EMPTY_ORGS = 4;

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  logger.info({ userId: 'system', route: 'seed:hydra', ...extra }, msg);

// ---- tiny random helpers (plain script — Math.random is fine here) ---------
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(a: T[]): T => a[rand(0, a.length - 1)]!;
const chance = (p: number) => Math.random() < p;
function sample<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = rand(0, i); [c[i], c[j]] = [c[j]!, c[i]!]; }
  return c.slice(0, Math.min(n, c.length));
}

// ---- name + content pools --------------------------------------------------
const FIRST = ['Aaron','Bella','Carlos','Diana','Ethan','Fiona','Gabe','Hana','Ivan','Julia','Kai','Lia','Marco','Nina','Omar','Priya','Quinn','Rita','Sam','Tara','Uma','Vince','Wren','Xena','Yusuf','Zara','Aiden','Brooke','Caleb','Dana','Eli','Faye','Gus','Hugo','Iris','Jade','Kira','Leo','Maya','Noah','Otis','Pia','Reed','Skye','Theo','Una','Vera','Wade','Yara','Zane','Asha','Boris','Cleo','Dev','Esme','Finn','Gita','Hiro','Isla','Jonas'];
const LAST  = ['Adler','Bishop','Carter','Diaz','Ellis','Fox','Greer','Hale','Iyer','Jain','Khan','Lopez','Mehta','Novak','Owens','Patel','Quill','Rao','Singh','Tan','Usman','Voss','Wong','Xu','Young','Zhao','Ahmed','Brown','Chen','Dixon','Evans','Frye','Gomez','Hassan','Ito','Jung','Kim','Lin','Mori','Nash','Ortiz','Pena','Reyes','Shah','Tran','Vega','Walsh','Yadav','Zaman','Roy'];
const PROJECT_NAMES = ['Apollo Platform','Helios Mobile','Orion Billing','Nimbus Data Pipeline','Atlas Web App','Vega Analytics','Titan Infrastructure','Lyra Design System','Phoenix Migration','Quasar Search'];
const PROJECT_KEYS  = ['APO','HEL','ORN','NIM','ATL','VEG','TTN','LYR','PHX','QSR'];
const EMPTY_ORG_NAMES = ['Northwind Trading','Globex Solutions','Initech Labs','Soylent Systems'];
const TYPES = ['task','bug','story','epic'];
const STATUSES = ['todo','in_progress','in_review','done'];
const PRIORITIES = ['lowest','low','medium','high','critical'];
const TITLE_VERB = ['Fix','Implement','Refactor','Investigate','Add','Remove','Optimize','Document','Migrate','Redesign','Harden','Audit','Wire up','Polish'];
const TITLE_NOUN = ['login flow','dashboard widgets','rate limiter','email templates','search index','board drag-and-drop','sprint burndown','RBAC checks','webhook retries','CSV export','dark mode','pagination','audit log','notification badge','onboarding wizard','API pagination','token refresh','file uploads'];
const COMMENT_BODIES = [
  'Looks good to me, shipping after CI passes.',
  'Can we add a test for the empty-state here?',
  'I hit this earlier too — the repro is flaky on Windows.',
  'Bumping priority, this is blocking the demo.',
  'Left a couple of nits inline, otherwise solid.',
  'Confirmed fixed on staging, thanks.',
  'This overlaps with the ticket in the Atlas project — let’s dedupe.',
  'Do we have metrics on how often this path is hit?',
  'Reassigning to me, I have context from last sprint.',
  'Moved to in-review, please take a look when free.',
  'The edge case with archived sprints still isn’t handled.',
  'Good catch. Pushed a follow-up commit.',
  'Let’s park this for next sprint, scope is creeping.',
  'Works locally but errors on RDS — investigating SSL.',
  'Approved. Nice cleanup on the query.',
];

// ---- main ------------------------------------------------------------------
async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    log('Seed started — connected', { org: HYDRA_ORG_ID });

    // -- 0. wipe any prior seed (idempotent re-run) --------------------------
    log('Clearing any prior seed data');
    await client.query('DELETE FROM projects WHERE org_id = $1', [HYDRA_ORG_ID]);
    await client.query("DELETE FROM organizations WHERE slug LIKE 'seed-empty-%'");
    await client.query(`DELETE FROM users WHERE email LIKE '%@${SEED_DOMAIN}'`);

    // -- 1. 59 fake users ----------------------------------------------------
    const fakeCount = ORG_MEMBERS_TOTAL - 1;
    const userVals: unknown[] = [];
    const userRows: string[] = [];
    const userIds: string[] = [];
    const userNameById = new Map<string, string>();
    for (let i = 0; i < fakeCount; i++) {
      const id = uuidv7();
      const fn = pick(FIRST), ln = pick(LAST);
      const name = `${fn} ${ln}`;
      const email = `${fn}.${ln}.${i + 1}`.toLowerCase() + `@${SEED_DOMAIN}`;
      const ext = `seed-${id}`;
      userIds.push(id);
      userNameById.set(id, name);
      const b = i * 4;
      userRows.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},TRUE)`);
      userVals.push(id, ext, email, name);
    }
    await client.query(
      `INSERT INTO users (id, external_auth_id, email, name, email_verified) VALUES ${userRows.join(',')}`,
      userVals,
    );
    userNameById.set(OWNER_ID, 'Testing Novetum');
    const allMemberIds = [OWNER_ID, ...userIds]; // 60 total
    log('Inserted fake users', { count: fakeCount });

    // -- 2. hydra memberships (owner already exists; assign roles to fakes) ---
    // ~4 admin, ~12 project_manager, rest user. Never assign a 2nd owner.
    const orgRoleVals: unknown[] = [];
    const orgRoleRows: string[] = [];
    userIds.forEach((id, i) => {
      const role = i < 4 ? 'admin' : i < 16 ? 'project_manager' : 'user';
      const b = i * 3;
      orgRoleRows.push(`($${b + 1},$${b + 2},$${b + 3})`);
      orgRoleVals.push(id, HYDRA_ORG_ID, role);
    });
    await client.query(
      `INSERT INTO user_orgs (user_id, org_id, role) VALUES ${orgRoleRows.join(',')}
       ON CONFLICT (user_id, org_id) DO NOTHING`,
      orgRoleVals,
    );
    log('Joined fake users to hydra', { admins: 4, pms: 12, users: fakeCount - 16 });

    // -- 3..7 projects + sprints + tickets + comments ------------------------
    let totalTickets = 0, totalComments = 0;
    for (let p = 0; p < PROJECT_COUNT; p++) {
      const creator = pick(allMemberIds);
      const projRes = await client.query(
        `INSERT INTO projects (org_id, name, key, description, visibility, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [HYDRA_ORG_ID, PROJECT_NAMES[p], PROJECT_KEYS[p],
         `Seed project for ${PROJECT_NAMES[p]} — demo data.`,
         chance(0.5) ? 'public' : 'private', creator],
      );
      const projectId = projRes.rows[0].id as number;

      // project_members: 10–60 subset, owner always included
      const memberSubset = sample(userIds, rand(PMEMBERS_MIN, PMEMBERS_MAX) - 1);
      const projMembers = [OWNER_ID, ...memberSubset];
      const pmVals: unknown[] = []; const pmRows: string[] = [];
      projMembers.forEach((uid, i) => { pmRows.push(`($${i * 2 + 1},$${i * 2 + 2})`); pmVals.push(projectId, uid); });
      await client.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ${pmRows.join(',')} ON CONFLICT DO NOTHING`,
        pmVals,
      );

      // 10 sprints: index 0 = active, others completed (past) or planned (future)
      const sprintIds: number[] = [];
      for (let s = 0; s < SPRINTS_PER_PROJ; s++) {
        let status: string, start: string | null, end: string | null;
        if (s === 0) {
          status = 'active';
          start = `NOW() - INTERVAL '5 days'`; end = `NOW() + INTERVAL '9 days'`;
        } else if (chance(0.6)) {
          status = 'completed';
          const wk = s * 2;
          start = `NOW() - INTERVAL '${wk + 2} weeks'`; end = `NOW() - INTERVAL '${wk} weeks'`;
        } else {
          status = 'planned';
          const wk = s * 2;
          start = `NOW() + INTERVAL '${wk} weeks'`; end = `NOW() + INTERVAL '${wk + 2} weeks'`;
        }
        const sr = await client.query(
          `INSERT INTO sprints (org_id, project_id, name, goal, status, start_date, end_date, created_by)
           VALUES ($1,$2,$3,$4,$5,${start},${end},$6) RETURNING id`,
          [HYDRA_ORG_ID, projectId, `Sprint ${s + 1}`,
           chance(0.6) ? `Deliver ${pick(TITLE_NOUN)} for ${PROJECT_NAMES[p]}` : null,
           status, pick(projMembers)],
        );
        sprintIds.push(sr.rows[0].id as number);
      }

      // Tickets: a dense block in the ACTIVE sprint (sprintIds[0]) so the
      // dashboard board is full, plus a lighter spread across the other
      // sprints + ~20% backlog.
      const activeSprintId = sprintIds[0];
      const otherSprintIds = sprintIds.slice(1);
      const activeCount = rand(ACTIVE_TICKETS_MIN, ACTIVE_TICKETS_MAX);
      const spreadCount = rand(TICKETS_MIN, TICKETS_MAX);
      const ticketCount = activeCount + spreadCount;
      const tkVals: unknown[] = []; const tkRows: string[] = [];
      const tkStatuses: string[] = [];
      let col = 0;
      for (let t = 0; t < ticketCount; t++) {
        const sprintId = t < activeCount
          ? activeSprintId
          : (chance(0.2) ? null : pick(otherSprintIds));
        const status = pick(STATUSES); tkStatuses.push(status);
        const assignee = chance(0.85) ? pick(projMembers) : null;
        const reporter = pick(projMembers);
        const key = `${PROJECT_KEYS[p]}-${t + 1}`;
        const title = `${pick(TITLE_VERB)} ${pick(TITLE_NOUN)}`;
        const params = [HYDRA_ORG_ID, projectId, sprintId, key, title,
          `Auto-generated seed ticket. ${pick(COMMENT_BODIES)}`,
          pick(TYPES), status, pick(PRIORITIES), assignee, reporter];
        tkRows.push(`($${col + 1},$${col + 2},$${col + 3},$${col + 4},$${col + 5},$${col + 6},$${col + 7},$${col + 8},$${col + 9},$${col + 10},$${col + 11})`);
        tkVals.push(...params); col += 11;
      }
      const tkRes = await client.query(
        `INSERT INTO tickets (org_id, project_id, sprint_id, key, title, description, type, status, priority, assignee_id, reporter_id)
         VALUES ${tkRows.join(',')} RETURNING id`,
        tkVals,
      );
      const ticketIds = tkRes.rows.map(r => r.id as number);
      totalTickets += ticketIds.length;

      // light sub-tickets: ~10% point at another ticket in this project
      for (const tid of ticketIds) {
        if (chance(0.1)) {
          const parent = pick(ticketIds);
          if (parent !== tid) await client.query('UPDATE tickets SET parent_id = $1 WHERE id = $2', [parent, tid]);
        }
      }

      // status history: one creation row + a transition for non-todo tickets
      const tshVals: unknown[] = []; const tshRows: string[] = []; let hc = 0;
      ticketIds.forEach((tid, i) => {
        const st = tkStatuses[i]!;
        tshRows.push(`($${hc + 1},$${hc + 2},NULL,$${hc + 3},$${hc + 4})`);
        tshVals.push(HYDRA_ORG_ID, tid, 'todo', pick(projMembers)); hc += 4;
        if (st !== 'todo') {
          tshRows.push(`($${hc + 1},$${hc + 2},$${hc + 3},$${hc + 4},$${hc + 5})`);
          tshVals.push(HYDRA_ORG_ID, tid, 'todo', st, pick(projMembers)); hc += 5;
        }
      });
      await client.query(
        `INSERT INTO ticket_status_history (org_id, ticket_id, old_status, new_status, changed_by) VALUES ${tshRows.join(',')}`,
        tshVals,
      );

      // comments: 5–40 per ticket. ~45% roots, rest replies to a random root.
      // some replies lead with "@Name " to read as a reply-to-a-reply.
      for (const tid of ticketIds) {
        const total = rand(COMMENTS_MIN, COMMENTS_MAX);
        const rootN = Math.max(1, Math.round(total * 0.45));
        const rootVals: unknown[] = []; const rootRows: string[] = [];
        for (let c = 0; c < rootN; c++) {
          const b = c * 4;
          rootRows.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
          rootVals.push(HYDRA_ORG_ID, tid, pick(projMembers), pick(COMMENT_BODIES));
        }
        const rRes = await client.query(
          `INSERT INTO comments (org_id, ticket_id, user_id, content) VALUES ${rootRows.join(',')} RETURNING id`,
          rootVals,
        );
        const rootIds = rRes.rows.map(r => r.id as number);
        totalComments += rootIds.length;

        const replyN = total - rootN;
        if (replyN > 0) {
          const repVals: unknown[] = []; const repRows: string[] = [];
          for (let c = 0; c < replyN; c++) {
            const author = pick(projMembers);
            // ~40% of replies @mention another project member (reply-to-reply)
            const mention = chance(0.4) ? `@${userNameById.get(pick(projMembers))} ` : '';
            const b = c * 5;
            repRows.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
            repVals.push(HYDRA_ORG_ID, tid, author, `${mention}${pick(COMMENT_BODIES)}`, pick(rootIds));
          }
          await client.query(
            `INSERT INTO comments (org_id, ticket_id, user_id, content, parent_comment_id) VALUES ${repRows.join(',')}`,
            repVals,
          );
          totalComments += replyN;
        }
      }
      log(`Project ${p + 1}/${PROJECT_COUNT} done`, { name: PROJECT_NAMES[p], members: projMembers.length, sprints: SPRINTS_PER_PROJ, tickets: ticketCount, activeSprintTickets: activeCount });
    }

    // -- 8. 4 empty placeholder orgs, owned by motaw -> motaw now in 5 orgs --
    for (let e = 0; e < EMPTY_ORGS; e++) {
      const orgId = uuidv7();
      await client.query(
        `INSERT INTO organizations (id, name, slug, created_by) VALUES ($1,$2,$3,$4)`,
        [orgId, EMPTY_ORG_NAMES[e], `seed-empty-${e + 1}`, OWNER_ID],
      );
      await client.query(
        `INSERT INTO user_orgs (user_id, org_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [OWNER_ID, orgId],
      );
    }
    log('Created empty placeholder orgs', { count: EMPTY_ORGS });

    await client.query('COMMIT');
    log('SEED COMPLETE ✓', { members: ORG_MEMBERS_TOTAL, projects: PROJECT_COUNT, tickets: totalTickets, comments: totalComments, emptyOrgs: EMPTY_ORGS });
    console.log(`\n✓ Hydra seed complete: ${ORG_MEMBERS_TOTAL} members, ${PROJECT_COUNT} projects, ${totalTickets} tickets, ${totalComments} comments, ${EMPTY_ORGS} empty orgs.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ userId: 'system', route: 'seed:hydra', error: (err as Error).message }, 'Seed FAILED — rolled back');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async () => { await pool.end().catch(() => {}); process.exit(1); });
