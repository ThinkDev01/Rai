-- ============================================================================
-- Rai v2 — UI stress-test cleanup
-- ============================================================================
-- Wipes everything stress-seed.sql created. Single transaction; safe to re-run.
--
-- Deletion order matters because:
--   - projects.created_by → users(id) has NO ON DELETE clause, so the seed
--     projects must die BEFORE the seed users that created them
--   - tickets.reporter_id → users(id) is NOT NULL with no ON DELETE, so
--     tickets must die (via project cascade) before seed users
--   - user_orgs / project_members / sprints / tickets / comments / status
--     history all CASCADE off org or project deletes
-- ============================================================================

BEGIN;

-- 1. Drop the 15 stress orgs entirely (cascades user_orgs + any orgs that
--    happened to get projects via this seed)
DELETE FROM organizations WHERE slug LIKE 'seed-org-%';

-- 2. Drop the stress projects in Umbrella Corp (cascades sprints, tickets,
--    comments, project_members, ticket_status_history)
DELETE FROM projects
WHERE key = 'STRESS'
   OR key LIKE 'SEED%'
   OR key LIKE 'SARC%';

-- 3. Now safe to delete the seed users (their tickets/projects are gone; the
--    only thing left is user_orgs rows + assignee_id refs which all cascade
--    or SET NULL automatically).
DELETE FROM users
WHERE email LIKE 'seed_user_%@umbrella.test'
   OR email LIKE 'seed_orgowner_%@umbrella.test'
   OR email LIKE 'seed_longrole_%@umbrella.test';

COMMIT;
