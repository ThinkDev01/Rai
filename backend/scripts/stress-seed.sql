-- ============================================================================
-- Rai v2 — UI stress-test seed
-- ============================================================================
-- Purpose: load Umbrella Corp + Diptanshu's account with realistic-volume
-- data so the UI can be validated under load before staging deploy.
--
-- Loads (per user request 2026-05-28):
--   50 synthetic members in Umbrella Corp (mix of roles)
--   25 active projects in Umbrella Corp (incl. one called "testing1 (stress)")
--   50 archived projects in Umbrella Corp
--   All 50 members joined to the "testing1 (stress)" project
--   25 sprints in "testing1 (stress)" — 1 active, rest mixed completed/planned
--   100 tickets in the ACTIVE sprint — random status / type / priority
--   50 of those 100 assigned to Diptanshu
--   25 lorem-ipsum comments on the first stress ticket
--   15 additional orgs for Diptanshu (mix of owner/admin/PM/user roles)
--
-- Markers for cleanup (stress-cleanup.sql wipes them in one shot):
--   user emails       : seed_*@umbrella.test
--   org slugs         : seed-org-*
--   project keys      : SEED%, STRESS, SARC%
--
-- Everything is in a single BEGIN/COMMIT — any failure rolls back fully.
-- ============================================================================

BEGIN;

DO $seed$
DECLARE
  diptanshu_id      UUID;
  umbrella_id       UUID;
  testing1_id       BIGINT;
  active_sprint_id  BIGINT;
  swarm_ticket_id   BIGINT;
  v_member_ids      UUID[] := ARRAY[]::UUID[];
  v_uid             UUID;
  v_org_id          UUID;
  v_owner_id        UUID;
  v_project_id      BIGINT;
  v_sprint_id       BIGINT;
  v_ticket_id       BIGINT;
  v_idx             INTEGER;
  v_status          TEXT;
  v_type            TEXT;
  v_priority        TEXT;
  v_role            TEXT;
  v_assignee        UUID;
  v_sprint_status   TEXT;
  v_sprint_archived BOOLEAN;
  v_archived_pjt    INTEGER;
  -- name pools so seeded data reads like real members
  v_first_names     TEXT[] := ARRAY['Aaron','Bella','Carlos','Diana','Ethan','Fiona','Gabe','Hana','Ivan','Julia',
                                    'Kai','Lia','Marco','Nina','Omar','Priya','Quinn','Rita','Sam','Tara',
                                    'Uma','Vince','Wren','Xena','Yusuf','Zara','Aiden','Brooke','Caleb','Dana',
                                    'Eli','Faye','Gus','Hugo','Iris','Jade','Kira','Leo','Maya','Noah',
                                    'Otis','Pia','Reed','Skye','Theo','Una','Vera','Wade','Yara','Zane'];
  v_last_names      TEXT[] := ARRAY['Adler','Bishop','Carter','Diaz','Ellis','Fox','Greer','Hale','Iyer','Jain',
                                    'Khan','Lopez','Mehta','Novak','Owens','Patel','Quinn','Rao','Singh','Tan',
                                    'Usman','Voss','Wong','Xu','Young','Zhao','Ahmed','Brown','Chen','Dixon',
                                    'Evans','Frye','Gomez','Hassan','Ito','Jung','Kim','Lin','Mori','Nash',
                                    'Ortiz','Park','Reyes','Shah','Tata','Ueda','Vega','Wells','Yan','Zee'];
  v_ticket_titles   TEXT[] := ARRAY[
    'Fix login button alignment on mobile','Add dark mode toggle persistence',
    'Investigate timeout on /me endpoint','Refactor sprint completion flow',
    'Improve dashboard load time','Wire up notification badge counter',
    'Audit role assignment edge cases','Migrate legacy avatar uploader',
    'Document the org switch flow','Fix race condition in token refresh',
    'Add empty-state for archived sprints','Polish ticket panel transitions',
    'Validate parent ticket selection','Patch CORS for new staging origin',
    'Tighten sprint name validation','Standardize all toast messages',
    'Speed up project switch queries','Trace memory leak in board view',
    'Review board column drag-drop','Reword onboarding helper text',
    'Stabilize webhook retry policy','Expand ticket-search indexing',
    'Inventory unused frontend imports','Tune Postgres pool size',
    'Profile slow ticket listing query','Add fallback for missing icons',
    'Tweak typography scale on mobile','Add @-mention notification path',
    'Repair sprint reports timestamp','Sweep stale invite tokens',
    'Strengthen invite-expiry tests','Wire status-history retention job'];
  v_lorem_sentences TEXT[] := ARRAY[
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
    'Curabitur pretium tincidunt lacus, nulla gravida orci a odio.',
    'Vestibulum ante ipsum primis in faucibus orci luctus et ultrices.',
    'Mauris ac felis vel velit tristique imperdiet, etiam ut purus.',
    'Pellentesque dapibus suscipit ligula, donec posuere augue in quam.',
    'Sapien faucibus et molestie ac feugiat sed lectus vestibulum.'];
  v_full_name       TEXT;
  v_initials        TEXT;
  v_comment_text    TEXT;
  v_n_sentences     INTEGER;
  v_sent_idx        INTEGER;
  -- Threaded-comments seed state. Tracks the most-recently-inserted ROOT
  -- comment so we can wire subsequent comments as replies to it without an
  -- extra round-trip per row.
  v_new_comment_id  BIGINT;
  v_last_root_id    BIGINT;
  -- Parent/child stress test (STRESS-101..STRESS-109).
  v_parent_ticket_id  BIGINT;
  v_central_ticket_id BIGINT;
  v_long_role_user_id UUID;
  v_long_role_org_id  UUID;
BEGIN
  -- ── Lookups ──────────────────────────────────────────────────────────────
  -- "Novetum Diptanshu" is the user; emails seen in this DB are
  -- diptanshu@novetum.com (primary) / diptanshugoswami@proton.me /
  -- goswamidiptanshu@gmail.com. Match on name OR any of those.
  SELECT id INTO diptanshu_id
  FROM users
  WHERE name = 'Novetum Diptanshu'
     OR email = 'diptanshu@novetum.com'
  ORDER BY (CASE WHEN email = 'diptanshu@novetum.com' THEN 0 ELSE 1 END)
  LIMIT 1;
  IF diptanshu_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Novetum Diptanshu user - sign in once first to provision the row.';
  END IF;

  SELECT id INTO umbrella_id
  FROM organizations
  WHERE slug = 'umbrella-corp'
     OR name ILIKE 'umbrella%'
  LIMIT 1;
  IF umbrella_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Umbrella Corp org. Check organizations table for matching name/slug.';
  END IF;

  RAISE NOTICE 'Seeding into org % for user %', umbrella_id, diptanshu_id;

  -- ── 50 seed members in Umbrella Corp ─────────────────────────────────────
  -- Role mix: 5 admin, 10 PM, 35 user. No owner (Diptanshu keeps that).
  FOR v_idx IN 1..50 LOOP
    v_uid := gen_random_uuid();
    v_full_name := v_first_names[((v_idx - 1) % 50) + 1] || ' ' || v_last_names[((v_idx * 7 + 3) % 50) + 1];

    INSERT INTO users (id, external_auth_id, email, name, email_verified, created_at, updated_at)
    VALUES (
      v_uid,
      'seed-cognito-sub-' || lpad(v_idx::TEXT, 3, '0'),
      'seed_user_' || lpad(v_idx::TEXT, 3, '0') || '@umbrella.test',
      v_full_name,
      TRUE,
      NOW() - (v_idx || ' hours')::INTERVAL,
      NOW() - (v_idx || ' hours')::INTERVAL
    );

    v_role := CASE
      WHEN v_idx <= 5  THEN 'admin'
      WHEN v_idx <= 15 THEN 'project_manager'
      ELSE 'user'
    END;

    INSERT INTO user_orgs (user_id, org_id, role, role_label, joined_at)
    VALUES (v_uid, umbrella_id, v_role, NULL, NOW() - (v_idx || ' hours')::INTERVAL);

    v_member_ids := array_append(v_member_ids, v_uid);
  END LOOP;
  RAISE NOTICE 'Inserted 50 seed members';

  -- ── 25 active projects (SEED01..SEED24 + the testing1 stress project) ────
  -- testing1 stress is project #1 so we capture its id early.
  INSERT INTO projects (org_id, name, key, description, visibility, archived, created_by)
  VALUES (umbrella_id, 'testing1 (stress)', 'STRESS', 'Heavy-volume stress test project — 25 sprints, 100 tickets in the active sprint, 50 members.', 'public', FALSE, diptanshu_id)
  RETURNING id INTO testing1_id;

  FOR v_idx IN 1..24 LOOP
    INSERT INTO projects (org_id, name, key, description, visibility, archived, created_by)
    VALUES (
      umbrella_id,
      'Stress Project ' || lpad(v_idx::TEXT, 2, '0'),
      'SEED' || lpad(v_idx::TEXT, 2, '0'),
      v_lorem_sentences[((v_idx - 1) % 10) + 1],
      CASE WHEN v_idx % 3 = 0 THEN 'public' ELSE 'private' END,
      FALSE,
      diptanshu_id
    );
  END LOOP;
  RAISE NOTICE 'Inserted 25 active projects (1 STRESS + 24 SEED__)';

  -- ── 50 archived projects ─────────────────────────────────────────────────
  FOR v_idx IN 1..50 LOOP
    INSERT INTO projects (org_id, name, key, description, visibility, archived, archived_at, created_by, created_at, updated_at)
    VALUES (
      umbrella_id,
      'Archived Stress ' || lpad(v_idx::TEXT, 2, '0'),
      'SARC' || lpad(v_idx::TEXT, 2, '0'),
      v_lorem_sentences[((v_idx - 1) % 10) + 1],
      'private',
      TRUE,
      NOW() - ((v_idx * 3) || ' days')::INTERVAL,
      diptanshu_id,
      NOW() - ((v_idx * 10) || ' days')::INTERVAL,
      NOW() - ((v_idx * 3) || ' days')::INTERVAL
    );
  END LOOP;
  RAISE NOTICE 'Inserted 50 archived projects';

  -- ── Join all 50 members to the testing1 stress project ───────────────────
  -- Diptanshu is auto-considered a member as org owner; explicit row added
  -- too so the project_members table reflects intent.
  INSERT INTO project_members (project_id, user_id) VALUES (testing1_id, diptanshu_id);
  FOREACH v_uid IN ARRAY v_member_ids LOOP
    INSERT INTO project_members (project_id, user_id) VALUES (testing1_id, v_uid);
  END LOOP;
  RAISE NOTICE 'Joined 50 members + Diptanshu to testing1 stress';

  -- ── 25 sprints in testing1 stress ────────────────────────────────────────
  -- Layout: sprint 13 is ACTIVE (so it sits comfortably in the middle of the
  -- list). Others mix completed (some archived) + planned. Names are
  -- "Stress Sprint NN".
  FOR v_idx IN 1..25 LOOP
    IF v_idx = 13 THEN
      v_sprint_status := 'active';
      v_sprint_archived := FALSE;
    ELSIF v_idx < 13 THEN
      -- Older sprints (1-12): completed; ~half archived
      v_sprint_status := 'completed';
      v_sprint_archived := (v_idx <= 6);  -- first 6 are archived
    ELSE
      -- Future sprints (14-25): planned
      v_sprint_status := 'planned';
      v_sprint_archived := FALSE;
    END IF;

    INSERT INTO sprints (org_id, project_id, name, goal, status, start_date, end_date, archived_at, created_by, created_at, updated_at)
    VALUES (
      umbrella_id,
      testing1_id,
      'Stress Sprint ' || lpad(v_idx::TEXT, 2, '0'),
      v_lorem_sentences[((v_idx - 1) % 10) + 1],
      v_sprint_status,
      (CURRENT_DATE - ((25 - v_idx) * 14))::DATE,
      (CURRENT_DATE - ((25 - v_idx) * 14) + 13)::DATE,
      CASE WHEN v_sprint_archived THEN NOW() - ((25 - v_idx) || ' days')::INTERVAL ELSE NULL END,
      diptanshu_id,
      NOW() - ((25 - v_idx) || ' days')::INTERVAL,
      NOW() - ((25 - v_idx) || ' days')::INTERVAL
    )
    RETURNING id INTO v_sprint_id;

    IF v_idx = 13 THEN
      active_sprint_id := v_sprint_id;
    END IF;
  END LOOP;
  RAISE NOTICE 'Inserted 25 sprints (active sprint id = %)', active_sprint_id;

  -- ── 100 tickets in the ACTIVE sprint ─────────────────────────────────────
  -- Random status / type / priority. 50 assigned to Diptanshu, rest to a
  -- random member (or unassigned for ~10%). Reporter rotates across all 51
  -- people. Ticket keys are STRESS-1..STRESS-100. First ticket captured for
  -- the comment swarm.
  FOR v_idx IN 1..100 LOOP
    -- Status distribution: 40% todo, 25% in_progress, 15% in_review, 20% done
    v_status := CASE
      WHEN v_idx % 20 < 8  THEN 'todo'
      WHEN v_idx % 20 < 13 THEN 'in_progress'
      WHEN v_idx % 20 < 16 THEN 'in_review'
      ELSE 'done'
    END;
    v_type := CASE (v_idx % 4)
      WHEN 0 THEN 'task'
      WHEN 1 THEN 'bug'
      WHEN 2 THEN 'story'
      ELSE 'epic'
    END;
    v_priority := CASE (v_idx % 5)
      WHEN 0 THEN 'lowest'
      WHEN 1 THEN 'low'
      WHEN 2 THEN 'medium'
      WHEN 3 THEN 'high'
      ELSE 'critical'
    END;
    -- First 50 → Diptanshu. Next 40 → random seed member. Last 10 → unassigned.
    v_assignee := CASE
      WHEN v_idx <= 50 THEN diptanshu_id
      WHEN v_idx <= 90 THEN v_member_ids[((v_idx * 7) % 50) + 1]
      ELSE NULL
    END;

    INSERT INTO tickets (org_id, project_id, sprint_id, key, title, description, type, status, priority, assignee_id, reporter_id, created_at, updated_at)
    VALUES (
      umbrella_id,
      testing1_id,
      active_sprint_id,
      'STRESS-' || v_idx::TEXT,
      v_ticket_titles[((v_idx - 1) % array_length(v_ticket_titles, 1)) + 1] || ' #' || v_idx::TEXT,
      v_lorem_sentences[((v_idx - 1) % 10) + 1] || ' ' || v_lorem_sentences[(v_idx % 10) + 1],
      v_type, v_status, v_priority,
      v_assignee,
      CASE WHEN v_idx % 3 = 0 THEN diptanshu_id ELSE v_member_ids[((v_idx * 11) % 50) + 1] END,
      NOW() - ((100 - v_idx) || ' hours')::INTERVAL,
      NOW() - (((100 - v_idx) / 2) || ' hours')::INTERVAL
    )
    RETURNING id INTO v_ticket_id;

    IF v_idx = 1 THEN
      swarm_ticket_id := v_ticket_id;
    END IF;
  END LOOP;
  RAISE NOTICE 'Inserted 100 tickets in active sprint (50 assigned to Diptanshu)';

  -- ── 25 threaded comments on ticket STRESS-1 ─────────────────────────────
  -- Authors cycle through Diptanshu + first 24 seed members. Lengths vary
  -- so the activity feed renders with realistic visual variety.
  --
  -- Threading: every 4th comment (v_idx 1, 5, 9, 13, 17, 21, 25) is a root.
  -- The 18 comments in between are replies to the most-recent root. Result:
  -- 7 root threads with 0..3 replies each — exercises both quiet roots and
  -- busy threads in the same view.
  v_last_root_id := NULL;
  FOR v_idx IN 1..25 LOOP
    v_n_sentences := 1 + (v_idx % 4);  -- 1..4 sentences per comment
    v_comment_text := '';
    FOR v_sent_idx IN 1..v_n_sentences LOOP
      v_comment_text := v_comment_text
        || CASE WHEN v_sent_idx > 1 THEN ' ' ELSE '' END
        || v_lorem_sentences[((v_idx + v_sent_idx) % 10) + 1];
    END LOOP;

    INSERT INTO comments (org_id, ticket_id, user_id, content, parent_comment_id, created_at, updated_at)
    VALUES (
      umbrella_id,
      swarm_ticket_id,
      CASE WHEN v_idx % 5 = 0 THEN diptanshu_id ELSE v_member_ids[((v_idx * 3) % 50) + 1] END,
      v_comment_text,
      CASE WHEN v_idx % 4 = 1 THEN NULL ELSE v_last_root_id END,
      NOW() - ((25 - v_idx) || ' minutes')::INTERVAL,
      NOW() - ((25 - v_idx) || ' minutes')::INTERVAL
    )
    RETURNING id INTO v_new_comment_id;

    IF v_idx % 4 = 1 THEN
      v_last_root_id := v_new_comment_id;
    END IF;
  END LOOP;
  RAISE NOTICE 'Inserted 25 threaded comments on ticket STRESS-1 (7 roots, 18 replies)';

  -- ── STRESS-101..109: parent/child family for sub-ticket UI testing ───────
  -- Layout:
  --   STRESS-101  →  root parent (no parent)
  --   STRESS-102  →  central node (parent = STRESS-101) — visit this in the UI
  --   STRESS-103..109  →  children (parent = STRESS-102)
  -- Visiting STRESS-102 exercises BOTH the "this ticket has a parent"
  -- banner AND the long sub-ticket list on a single page.
  INSERT INTO tickets (org_id, project_id, sprint_id, key, title, description, type, status, priority, assignee_id, reporter_id, created_at, updated_at)
  VALUES (
    umbrella_id, testing1_id, active_sprint_id,
    'STRESS-101', 'Family-tree epic — top of the chain',
    v_lorem_sentences[1] || ' ' || v_lorem_sentences[2],
    'epic', 'in_progress', 'high',
    diptanshu_id, diptanshu_id,
    NOW() - INTERVAL '6 hours', NOW() - INTERVAL '4 hours'
  )
  RETURNING id INTO v_parent_ticket_id;

  INSERT INTO tickets (org_id, project_id, sprint_id, parent_id, key, title, description, type, status, priority, assignee_id, reporter_id, created_at, updated_at)
  VALUES (
    umbrella_id, testing1_id, active_sprint_id, v_parent_ticket_id,
    'STRESS-102', 'Family-tree central — open me to see parent + children',
    v_lorem_sentences[3] || ' ' || v_lorem_sentences[4] || ' ' || v_lorem_sentences[5],
    'story', 'in_progress', 'high',
    diptanshu_id, diptanshu_id,
    NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours'
  )
  RETURNING id INTO v_central_ticket_id;

  FOR v_idx IN 1..7 LOOP
    INSERT INTO tickets (org_id, project_id, sprint_id, parent_id, key, title, description, type, status, priority, assignee_id, reporter_id, created_at, updated_at)
    VALUES (
      umbrella_id, testing1_id, active_sprint_id, v_central_ticket_id,
      'STRESS-' || (102 + v_idx)::TEXT,
      'Family-tree child #' || v_idx::TEXT || ' — ' || v_ticket_titles[(v_idx % 32) + 1],
      v_lorem_sentences[(v_idx % 10) + 1],
      (ARRAY['task','bug','task','story','task','bug','task'])[v_idx],
      (ARRAY['todo','in_progress','done','in_review','todo','done','in_progress'])[v_idx],
      (ARRAY['high','medium','low','critical','medium','low','high'])[v_idx],
      v_member_ids[((v_idx * 7) % 50) + 1],
      diptanshu_id,
      NOW() - ((4 - (v_idx / 2)) || ' hours')::INTERVAL,
      NOW() - ((3 - (v_idx / 3)) || ' hours')::INTERVAL
    );
  END LOOP;
  RAISE NOTICE 'Inserted STRESS-101..109 parent/child family (1 grandparent, 1 central, 7 children)';

  -- ── 15 additional orgs for Diptanshu, mixed roles ────────────────────────
  -- Role mix: 3 owner, 3 admin, 4 PM, 5 user. For orgs where Diptanshu isn't
  -- owner, create one synthetic seed owner user per org (so the one-owner-
  -- per-org invariant holds without overloading existing accounts).
  FOR v_idx IN 1..15 LOOP
    v_role := CASE
      WHEN v_idx <= 3  THEN 'owner'
      WHEN v_idx <= 6  THEN 'admin'
      WHEN v_idx <= 10 THEN 'project_manager'
      ELSE 'user'
    END;

    -- created_by always Diptanshu (column requires a real user; doesn't
    -- imply ownership in user_orgs).
    v_org_id := gen_random_uuid();
    INSERT INTO organizations (id, name, slug, subscription_status, created_by, created_at, updated_at)
    VALUES (
      v_org_id,
      '[seed] Stress Org ' || lpad(v_idx::TEXT, 2, '0'),
      'seed-org-' || lpad(v_idx::TEXT, 2, '0'),
      CASE WHEN v_idx % 4 = 0 THEN 'active' ELSE 'trial' END,
      diptanshu_id,
      NOW() - (v_idx || ' days')::INTERVAL,
      NOW() - (v_idx || ' days')::INTERVAL
    );

    IF v_role = 'owner' THEN
      -- Diptanshu IS the owner; no synthetic owner needed.
      INSERT INTO user_orgs (user_id, org_id, role, joined_at)
      VALUES (diptanshu_id, v_org_id, 'owner', NOW() - (v_idx || ' days')::INTERVAL);
    ELSE
      -- Need a synthetic owner so the org has one. Diptanshu joins with the
      -- target lower role. Owner emails: seed_orgowner_NN@umbrella.test.
      v_owner_id := gen_random_uuid();
      INSERT INTO users (id, external_auth_id, email, name, email_verified, created_at, updated_at)
      VALUES (
        v_owner_id,
        'seed-cognito-owner-' || lpad(v_idx::TEXT, 2, '0'),
        'seed_orgowner_' || lpad(v_idx::TEXT, 2, '0') || '@umbrella.test',
        'Owner ' || v_first_names[((v_idx - 1) % 50) + 1],
        TRUE,
        NOW() - (v_idx || ' days')::INTERVAL,
        NOW() - (v_idx || ' days')::INTERVAL
      );

      INSERT INTO user_orgs (user_id, org_id, role, joined_at) VALUES
        (v_owner_id, v_org_id, 'owner', NOW() - (v_idx || ' days')::INTERVAL),
        (diptanshu_id, v_org_id, v_role, NOW() - (v_idx || ' days')::INTERVAL);
    END IF;
  END LOOP;
  RAISE NOTICE 'Inserted 15 stress orgs (mixed Diptanshu role) + 12 synthetic owners';

  -- ── Stress Org 10: 20-char role label PM (UI overflow test) ──────────────
  -- Stress Org 10 (slug: seed-org-10) is the last of Diptanshu's PM-tier
  -- orgs. We add ONE extra synthetic member whose role_label is exactly the
  -- 20-char ceiling enforced by backend ROLE_LABEL_MAX so the team page,
  -- org switcher dropdown, and member chip can all be eyeball-tested at
  -- the worst-case input. We assign them project_manager so the UI also
  -- exercises the longest base-role string ("project_manager") next to a
  -- maxed-out custom label — both lines render full-width.
  SELECT id INTO v_long_role_org_id
  FROM organizations
  WHERE slug = 'seed-org-10';

  IF v_long_role_org_id IS NOT NULL THEN
    v_long_role_user_id := gen_random_uuid();
    INSERT INTO users (id, external_auth_id, email, name, email_verified, created_at, updated_at)
    VALUES (
      v_long_role_user_id,
      'seed-cognito-longrole-10',
      'seed_longrole_10@umbrella.test',
      'Long Role Tester',
      TRUE,
      NOW() - INTERVAL '10 days',
      NOW() - INTERVAL '10 days'
    );

    -- 'ChiefArchitectLead20' is exactly 20 chars — at the ROLE_LABEL_MAX
    -- ceiling. If this row inserts cleanly, the UI test can confirm the
    -- worst case fits without overflow on every surface that renders the
    -- label (team page, org switcher row, member chips).
    INSERT INTO user_orgs (user_id, org_id, role, role_label, joined_at)
    VALUES (
      v_long_role_user_id,
      v_long_role_org_id,
      'project_manager',
      'ChiefArchitectLead20',
      NOW() - INTERVAL '10 days'
    );

    -- ALSO stamp Diptanshu's OWN membership in seed-org-10 with the same
    -- 20-char label so the org-switcher modal renders the worst case on
    -- that row when he's signed in. The synthetic member above lets the
    -- Team page show a teammate with the long label; this UPDATE lets the
    -- top-right org switcher exercise the layout with HIS row. Diptanshu
    -- is already a PM in seed-org-10 (set by the 15-orgs loop above), so
    -- this is just an in-place label set.
    UPDATE user_orgs
       SET role_label = 'ChiefArchitectLead20'
     WHERE user_id = diptanshu_id
       AND org_id  = v_long_role_org_id;

    RAISE NOTICE 'Inserted 20-char role-label PM in seed-org-10 (synthetic teammate + Diptanshu own row)';
  ELSE
    RAISE NOTICE 'seed-org-10 not found — skipping long-role-label PM seed';
  END IF;

  RAISE NOTICE '✓ Stress seed complete. Reload the dashboard to see it.';
END
$seed$;

COMMIT;
