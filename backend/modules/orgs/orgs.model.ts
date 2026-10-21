import { uuidv7 } from 'uuidv7';
import pool from '../../config/db';
import type { OrgRow, OrgMemberRow, DeletedOrgRow } from './orgs.types';

/**
 * How long a soft-deleted org stays recoverable before the purge job hard-
 * deletes it. Single source of truth - the controller (restore window check +
 * deleted-list filter) and scripts/purge-orgs.ts (purge cutoff) all import this
 * so the window can never drift between the three places that care about it.
 */
export const ORG_RESTORE_WINDOW_DAYS = 30;

/**
 * Create an organization AND its owner membership atomically in a single
 * transaction. Either both rows land or neither does - guarantees we never
 * end up with a dangling org with no members. Owner role is implicit (the
 * creator is always the first owner; can be transferred later via admin flow).
 */
export async function insertOrgWithOwner(
  name: string,
  slug: string,
  ownerUserId: string,
): Promise<OrgRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgId = uuidv7();
    const orgRes = await client.query<OrgRow>(
      `INSERT INTO organizations (id, name, slug, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, subscription_status, discoverable, created_by, created_at, updated_at`,
      [orgId, name, slug, ownerUserId],
    );

    await client.query(
      `INSERT INTO user_orgs (user_id, org_id, role)
       VALUES ($1, $2, 'owner')`,
      [ownerUserId, orgId],
    );

    await client.query('COMMIT');
    return orgRes.rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Update org display name. Slug is intentionally not changeable in v2
 *  (renaming would break invite links + path-based tenancy URLs). */
export async function updateOrgName(orgId: string, name: string): Promise<OrgRow | null> {
  const res = await pool.query<OrgRow>(
    `UPDATE organizations
        SET name       = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, slug, subscription_status, discoverable, created_by, created_at, updated_at`,
    [name, orgId],
  );
  return res.rows[0] ?? null;
}

/** Toggle the `discoverable` flag. When FALSE, the org is hidden from other
 *  users' domain-peer discovery results (their dashboard banner + Settings
 *  peer list). Owner still sees + can toggle it from their own Settings. */
export async function updateOrgDiscoverable(orgId: string, discoverable: boolean): Promise<OrgRow | null> {
  const res = await pool.query<OrgRow>(
    `UPDATE organizations
        SET discoverable = $1,
            updated_at   = NOW()
      WHERE id = $2
      RETURNING id, name, slug, subscription_status, discoverable, created_by, created_at, updated_at`,
    [discoverable, orgId],
  );
  return res.rows[0] ?? null;
}

/**
 * Update a member's role within an org. Returns the updated row, or null when
 * the (org, user) pair doesn't exist. Callers must enforce the rbac.md guards
 * (only owner/admin can change roles; owner can't be demoted without
 * ownership transfer; self-demotion blocked).
 */
export async function updateMemberRole(
  orgId: string,
  targetUserId: string,
  // Widened to include 'owner' so label-only self-updates from the owner
  // can pass their current role through unchanged (the controller refuses
  // any TYPE change on owner targets - the partial unique index
  // `one_owner_per_org` is the DB-level backstop either way).
  newRole: 'owner' | 'admin' | 'project_manager' | 'user',
  newRoleLabel: string | null,
): Promise<OrgMemberRow | null> {
  const res = await pool.query<OrgMemberRow>(
    `UPDATE user_orgs
        SET role       = $1,
            role_label = $2
      WHERE org_id  = $3
        AND user_id = $4
      RETURNING
        user_id,
        (SELECT email FROM users u WHERE u.id = user_id)         AS email,
        (SELECT name  FROM users u WHERE u.id = user_id)         AS name,
        role,
        role_label,
        joined_at`,
    [newRole, newRoleLabel, orgId, targetUserId],
  );
  return res.rows[0] ?? null;
}

/**
 * Remove a member from an org. Returns true if a row was deleted. Caller
 * enforces rbac.md guards (owner cannot be removed; only owner/admin can
 * remove other members; self-removal goes through a separate "leave org"
 * flow not exposed here).
 */
export async function removeMember(orgId: string, targetUserId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM user_orgs WHERE org_id = $1 AND user_id = $2 RETURNING user_id`,
    [orgId, targetUserId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Find orgs whose OWNER has an email matching the given domain. Used for the
 * "an org with your email domain already exists" soft warning at signup +
 * dashboard.
 *
 * Caller filters out public-email domains BEFORE calling this. Capped at 10
 * results to prevent enumeration of huge orgs (the warning UX shows the
 * first few names; an admin probing for "every org in my domain" via this
 * endpoint isn't an attack we need to worry about, but the cap is cheap
 * insurance).
 *
 * Only includes orgs whose owner has a VERIFIED email - prevents
 * spoofed-email-domain attacks (someone signing up with `random@stripe.com`
 * without verification shouldn't make Stripe's name leak to anyone else).
 */
/**
 * Discover orgs sharing the caller's email domain. Visibility rules:
 *   - `discoverable = TRUE`         → always returned to anyone in the domain
 *   - `discoverable = FALSE` AND    → returned to the caller because they
 *      caller is a member             can manage their own org's visibility
 *   - `discoverable = FALSE` AND    → NOT returned (privacy)
 *      caller is NOT a member
 *
 * Returns the `discoverable` flag so the UI knows which state to render the
 * owner-only Eye/EyeOff toggle in.
 */
export async function findOrgsByOwnerEmailDomain(
  domain: string,
  callerUserId: string,
): Promise<{ id: string; name: string; discoverable: boolean }[]> {
  const res = await pool.query<{ id: string; name: string; discoverable: boolean }>(
    `SELECT DISTINCT o.id, o.name, o.discoverable
       FROM organizations o
       JOIN user_orgs uo ON uo.org_id = o.id AND uo.role = 'owner'
       JOIN users     u  ON u.id = uo.user_id
      WHERE LOWER(SPLIT_PART(u.email, '@', 2)) = $1
        AND u.email_verified = TRUE
        AND o.deleted_at IS NULL
        AND (
          o.discoverable = TRUE
          OR EXISTS (SELECT 1 FROM user_orgs my WHERE my.user_id = $2 AND my.org_id = o.id)
        )
      ORDER BY o.name ASC
      LIMIT 10`,
    [domain, callerUserId],
  );
  return res.rows;
}

/**
 * Soft-delete an organization (recycle bin). Stamps `deleted_at` + `deleted_by`
 * instead of removing the row, so the org and all its data (projects / sprints /
 * tickets / comments / members / invites) stay intact and recoverable for
 * ORG_RESTORE_WINDOW_DAYS. The org vanishes from the app immediately because
 * every membership query filters `deleted_at IS NULL` (auth.model).
 *
 * Idempotent guard: the `deleted_at IS NULL` predicate means a second delete on
 * an already-deleted org touches nothing (returns false) - we never overwrite
 * the original deletion timestamp and silently extend someone's recovery window.
 *
 * Caller MUST verify the actor is the org's owner. The real wipe happens later
 * in scripts/purge-orgs.ts once the window lapses.
 *
 * SUBSCRIPTION HOOK (wire in Phase 4 / Billing, see upgrades.md § Go-to-market
 * batch): on soft-delete, stop billing the org for the deleted window. No code
 * here today - v2 ships NoOpBillingProvider, so there's nothing to pause yet.
 */
export async function softDeleteOrg(orgId: string, deletedBy: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE organizations
        SET deleted_at = NOW(),
            deleted_by = $2,
            updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id`,
    [orgId, deletedBy],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Restore a soft-deleted org, but only while it's still inside the recovery
 * window. Clears `deleted_at` / `deleted_by` so the org reappears everywhere.
 *
 * Returns:
 *   - the restored OrgRow            → success
 *   - 'not_deleted'                  → org doesn't exist or isn't soft-deleted
 *   - 'window_expired'              → soft-deleted but past the window (the
 *                                      purge job just hasn't swept it yet)
 *
 * The window check lives in SQL so there's no race between "is it restorable?"
 * and the actual UPDATE.
 *
 * SUBSCRIPTION HOOK (Phase 4 / Billing): on restore, resume the subscription
 * exactly where it left off. No-op today (NoOpBillingProvider).
 */
export async function restoreOrg(orgId: string): Promise<OrgRow | 'not_deleted' | 'window_expired'> {
  const res = await pool.query<OrgRow>(
    `UPDATE organizations
        SET deleted_at = NULL,
            deleted_by = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NOT NULL
        AND deleted_at > NOW() - make_interval(days => $2::int)
      RETURNING id, name, slug, subscription_status, discoverable, created_by, created_at, updated_at`,
    [orgId, ORG_RESTORE_WINDOW_DAYS],
  );
  if (res.rows[0]) return res.rows[0];

  // No row updated - distinguish "not deleted / gone" from "deleted but expired"
  // so the controller can return the right status (404 vs 410).
  const probe = await pool.query<{ expired: boolean }>(
    `SELECT (deleted_at <= NOW() - make_interval(days => $2::int)) AS expired
       FROM organizations
      WHERE id = $1 AND deleted_at IS NOT NULL`,
    [orgId, ORG_RESTORE_WINDOW_DAYS],
  );
  return probe.rows[0]?.expired ? 'window_expired' : 'not_deleted';
}

/**
 * Orgs the given user OWNS that are currently soft-deleted and still within the
 * recovery window - i.e. the caller's restorable "recently deleted" list shown
 * on the create-org / welcome page. Only the OWNER sees an org here (the role
 * filter); other former members just see it disappear.
 *
 * `restore_until` is deleted_at + window so the UI can render a "X days left"
 * countdown without re-deriving the window client-side.
 */
export async function listDeletedOrgsForOwner(userId: string): Promise<DeletedOrgRow[]> {
  const res = await pool.query<DeletedOrgRow>(
    `SELECT o.id,
            o.name,
            o.slug,
            o.deleted_at,
            o.deleted_at + make_interval(days => $2::int) AS restore_until,
            s.status             AS subscription_status,
            s.trial_ends_at,
            s.current_period_end
       FROM organizations o
       JOIN user_orgs uo ON uo.org_id = o.id AND uo.user_id = $1 AND uo.role = 'owner'
       LEFT JOIN subscriptions s
         ON s.org_id = o.id AND s.status IN ('trialing','active','past_due')
      WHERE o.deleted_at IS NOT NULL
        AND o.deleted_at > NOW() - make_interval(days => $2::int)
      ORDER BY o.deleted_at DESC`,
    [userId, ORG_RESTORE_WINDOW_DAYS],
  );
  return res.rows;
}

/**
 * Atomic ownership transfer. In ONE transaction:
 *   1. demote current owner → 'admin'
 *   2. promote recipient    → 'owner'
 * The partial UNIQUE index `one_owner_per_org` enforces that only one owner
 * can exist per org at any moment - by demoting first we briefly have zero
 * owners, but inside the same transaction we promote the recipient, so the
 * index sees a single-owner state at commit time and never trips.
 *
 * Caller MUST have already validated:
 *   - caller is the current owner of orgId
 *   - recipient exists in user_orgs for the same orgId
 *   - recipient is not already the owner
 */
export async function transferOwnership(
  orgId: string,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Defensive re-check inside the txn - protects against a race where the
    // caller's owner role changed between authorization check and write.
    const callerRes = await client.query<{ role: string }>(
      'SELECT role FROM user_orgs WHERE org_id = $1 AND user_id = $2 FOR UPDATE',
      [orgId, fromUserId],
    );
    if (callerRes.rows[0]?.role !== 'owner') {
      throw new Error('caller is no longer owner');
    }

    const targetRes = await client.query<{ role: string }>(
      'SELECT role FROM user_orgs WHERE org_id = $1 AND user_id = $2 FOR UPDATE',
      [orgId, toUserId],
    );
    if (!targetRes.rows[0]) {
      throw new Error('recipient is not a member of this org');
    }
    if (targetRes.rows[0].role === 'owner') {
      throw new Error('recipient is already the owner');
    }

    // Demote first, then promote - staying within the same txn so the
    // one-owner-per-org partial unique index sees a consistent state on commit.
    await client.query(
      `UPDATE user_orgs SET role = 'admin' WHERE org_id = $1 AND user_id = $2`,
      [orgId, fromUserId],
    );
    await client.query(
      `UPDATE user_orgs SET role = 'owner' WHERE org_id = $1 AND user_id = $2`,
      [orgId, toUserId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Read just the role for an arbitrary (org, user) pair - used by RBAC guards. */
export async function getMemberRole(orgId: string, userId: string): Promise<string | null> {
  const res = await pool.query<{ role: string }>(
    'SELECT role FROM user_orgs WHERE org_id = $1 AND user_id = $2',
    [orgId, userId],
  );
  return res.rows[0]?.role ?? null;
}

/**
 * All members of an org. Ordered: owner first, then admin, PM, user; within
 * each role tier by join date (newest last). Used by the Team page.
 */
export async function listMembersForOrg(orgId: string): Promise<OrgMemberRow[]> {
  const res = await pool.query<OrgMemberRow>(
    `SELECT
       u.id        AS user_id,
       u.email,
       u.name,
       uo.role,
       uo.role_label,
       uo.joined_at
     FROM user_orgs uo
     JOIN users u ON u.id = uo.user_id
     WHERE uo.org_id = $1
     ORDER BY
       CASE uo.role
         WHEN 'owner'           THEN 1
         WHEN 'admin'           THEN 2
         WHEN 'project_manager' THEN 3
         WHEN 'user'            THEN 4
         ELSE 5
       END,
       uo.joined_at ASC`,
    [orgId],
  );
  return res.rows;
}
