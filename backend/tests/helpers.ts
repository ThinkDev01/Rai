/**
 * Shared test helpers — DB reset, user/org seeding, and an authenticated
 * request builder. Tests seed prerequisite rows directly (fast, deterministic)
 * and then exercise the real HTTP surface through supertest.
 */
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import app from '../app';
import pool from '../config/db';
import type { OrgRole } from '../types/common.types';
import { mockAuth } from './mock-auth';

/** Wipe every table between tests. CASCADE from users+organizations clears all
 *  dependent rows (memberships, projects, sprints, tickets, comments, invites,
 *  history); RESTART IDENTITY resets BIGSERIAL sequences so ticket keys (RAI-1…)
 *  are deterministic each test. */
export async function cleanDB(): Promise<void> {
  await pool.query('TRUNCATE users, organizations RESTART IDENTITY CASCADE');
  mockAuth.reset();
}

/** Insert a users row and register its token with the mock. Returns the user id.
 *  `token` doubles as the Cognito sub / Authorization bearer value. */
export async function seedUser(
  token: string,
  email: string,
  name: string | null = 'Test User',
): Promise<string> {
  const id = uuidv7();
  await pool.query(
    `INSERT INTO users (id, external_auth_id, email, name, email_verified)
     VALUES ($1, $2, $3, $4, true)`,
    [id, token, email, name],
  );
  mockAuth.register(token, email, name);
  return id;
}

/** Make a user a member of an org with the given role (bypasses the invite/email
 *  flow, which needs SES). */
export async function addMembership(userId: string, orgId: string, role: OrgRole): Promise<void> {
  await pool.query(
    `INSERT INTO user_orgs (user_id, org_id, role) VALUES ($1, $2, $3)`,
    [userId, orgId, role],
  );
}

type ReqOpts = { token?: string; orgId?: string };
type Method = 'get' | 'post' | 'patch' | 'delete';

/** Build a supertest request with auth + org headers pre-set.
 *  Usage: `await req('post', '/api/v1/orgs', { token }).send({ … })`. */
export function req(method: Method, path: string, opts: ReqOpts = {}) {
  let r = request(app)[method](path);
  if (opts.token) r = r.set('Authorization', `Bearer ${opts.token}`);
  if (opts.orgId) r = r.set('X-Org-Id', opts.orgId);
  return r;
}

/** Seed an owner + create their org through the real API. Returns the owner
 *  token, owner user id, and the new org id — the common starting point. */
export async function setupOwnerWithOrg(
  slug = 'acme',
  name = 'Acme Corp',
): Promise<{ ownerToken: string; ownerId: string; orgId: string }> {
  const ownerToken = 'owner-sub';
  const ownerId = await seedUser(ownerToken, 'owner@test.com', 'Owner User');
  const res = await req('post', '/api/v1/orgs', { token: ownerToken }).send({ name, slug });
  if (res.status !== 201) {
    throw new Error(`setupOwnerWithOrg failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { ownerToken, ownerId, orgId: res.body.data.org.id };
}
