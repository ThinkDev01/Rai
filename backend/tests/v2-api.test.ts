/**
 * Rai v2 — critical-path API integration suite.
 *
 * Real Express app + real PostgreSQL test DB; only the identity provider is
 * mocked (tests/mock-auth.ts). This covers the things that actually break
 * production: authentication, multi-tenant isolation, RBAC, the sprint state
 * machine, ticket rules, and project visibility — NOT cosmetic UI behaviour.
 *
 * Run: `npm test`   (needs a local Postgres — see Guide/dev-testing.md §10.)
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import './mock-auth'; // installs the mock AuthService before any request
import { cleanDB, seedUser, addMembership, req, setupOwnerWithOrg } from './helpers';
import { createChallenge, verifyChallenge } from '../modules/otp/otp.model';
import { setBillingProvider } from '../modules/billing/billing.factory';
import type { BillingProvider } from '../modules/billing/billing.provider';
import { gateForSubscription, hasFutureAccess } from '../modules/billing/billing.model';
import pool from '../config/db';

// The read-only gate must come from OUR access truth (trial/period dates), not the
// provider's status label — a Razorpay cancellation can't read-only an org that
// still has time owed. Pure-function guard for billing.model.gateForSubscription.
describe('Billing gate (access-truth)', () => {
  const future = new Date(Date.now() + 20 * 86400_000).toISOString();
  const past   = new Date(Date.now() -  5 * 86400_000).toISOString();

  it('cancelled sub with a FUTURE paid period stays active (not read-only)', () => {
    expect(gateForSubscription('canceled', past, future)).toBe('active');
  });
  it('cancelled mid-trial (trial still running) stays active', () => {
    expect(gateForSubscription('canceled', future, null)).toBe('active');
  });
  it('trialing with trial left → trial', () => {
    expect(gateForSubscription('trialing', future, null)).toBe('trial');
  });
  it('fully expired (trial + period both past) → suspended', () => {
    expect(gateForSubscription('canceled', past, past)).toBe('suspended');
  });
  it('trial genuinely ended → suspended', () => {
    expect(gateForSubscription('trialing', past, null)).toBe('suspended');
  });

  // hasFutureAccess is the single guard every read-only decision (webhook
  // cancel/past_due, reactivation, status heal) defers to. If it ever returns
  // false while time is owed, an org gets wrongly locked out.
  it('hasFutureAccess: future trial alone → true (the mid-trial-cancel case)', () => {
    expect(hasFutureAccess(future, null)).toBe(true);
  });
  it('hasFutureAccess: future paid period alone → true', () => {
    expect(hasFutureAccess(null, future)).toBe(true);
  });
  it('hasFutureAccess: nothing owed (both past/null) → false', () => {
    expect(hasFutureAccess(past, past)).toBe(false);
    expect(hasFutureAccess(null, null)).toBe(false);
  });
});

beforeEach(async () => {
  await cleanDB();
});

// ── Health ───────────────────────────────────────────────────────────────────
describe('Health', () => {
  it('GET /api/health → 200 ok', async () => {
    const res = await req('get', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Authentication ─────────────────────────────────────────────────────────────
describe('Auth / me', () => {
  it('rejects requests with no token (401)', async () => {
    const res = await req('get', '/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown token (401)', async () => {
    const res = await req('get', '/api/v1/me', { token: 'ghost-token' });
    expect(res.status).toBe(401);
  });

  it('returns the user + empty memberships for a fresh user', async () => {
    await seedUser('solo-sub', 'solo@test.com', 'Solo User');
    const res = await req('get', '/api/v1/me', { token: 'solo-sub' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('solo@test.com');
    expect(res.body.data.memberships).toHaveLength(0);
  });
});

// ── Organizations ──────────────────────────────────────────────────────────────
describe('Organizations', () => {
  it('creates an org and makes the creator owner', async () => {
    await seedUser('u1', 'u1@test.com', 'U One');
    const res = await req('post', '/api/v1/orgs', { token: 'u1' }).send({ name: 'Acme Corp', slug: 'acme' });
    expect(res.status).toBe(201);
    expect(res.body.data.org.slug).toBe('acme');

    const me = await req('get', '/api/v1/me', { token: 'u1' });
    expect(me.body.data.memberships).toHaveLength(1);
    expect(me.body.data.memberships[0].role).toBe('owner');
  });

  it('rejects a duplicate slug (409)', async () => {
    const { orgId } = await setupOwnerWithOrg('acme');
    expect(orgId).toBeTruthy();
    await seedUser('u2', 'u2@test.com', 'U Two');
    const res = await req('post', '/api/v1/orgs', { token: 'u2' }).send({ name: 'Other', slug: 'acme' });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid slug (400)', async () => {
    await seedUser('u3', 'u3@test.com', 'U Three');
    const res = await req('post', '/api/v1/orgs', { token: 'u3' }).send({ name: 'Bad', slug: '1nvalid slug!' });
    expect(res.status).toBe(400);
  });

  it('lets any member view the member list', async () => {
    const { orgId } = await setupOwnerWithOrg();
    const memberId = await seedUser('member', 'member@test.com', 'Member');
    await addMembership(memberId, orgId, 'user');
    const res = await req('get', `/api/v1/orgs/${orgId}/members`, { token: 'member', orgId });
    expect(res.status).toBe(200);
    expect(res.body.data.members.length).toBe(2);
  });
});

// ── Multi-tenant isolation (the most important security property) ───────────────
describe('Tenant isolation', () => {
  it('a project in org A is invisible under org B context', async () => {
    // One user owns two orgs.
    const ownerToken = 'multi-owner';
    const ownerId = await seedUser(ownerToken, 'multi@test.com', 'Multi Owner');
    const orgA = (await req('post', '/api/v1/orgs', { token: ownerToken }).send({ name: 'Org A', slug: 'org-a' })).body.data.org.id;
    const orgB = (await req('post', '/api/v1/orgs', { token: ownerToken }).send({ name: 'Org B', slug: 'org-b' })).body.data.org.id;
    expect(ownerId).toBeTruthy();

    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId: orgA })
      .send({ name: 'Secret', key: 'SEC', visibility: 'private' });
    expect(proj.status).toBe(201);
    const projId = proj.body.data.id;

    // Listing under org B must not include org A's project.
    const listB = await req('get', '/api/v1/projects', { token: ownerToken, orgId: orgB });
    expect(listB.status).toBe(200);
    expect(listB.body.data.find((p: { id: string }) => p.id === projId)).toBeUndefined();

    // Fetching it directly under org B must 404.
    const getB = await req('get', `/api/v1/projects/${projId}`, { token: ownerToken, orgId: orgB });
    expect(getB.status).toBe(404);
  });

  it('a non-member cannot act in an org (403 on org context)', async () => {
    const { orgId } = await setupOwnerWithOrg();
    await seedUser('outsider', 'outsider@test.com', 'Outsider');
    const res = await req('get', '/api/v1/projects', { token: 'outsider', orgId });
    expect(res.status).toBe(403);
  });
});

// ── Project RBAC + visibility ───────────────────────────────────────────────────
describe('Projects — RBAC & visibility', () => {
  it('a plain user cannot create a project (403)', async () => {
    const { orgId } = await setupOwnerWithOrg();
    const uid = await seedUser('plain', 'plain@test.com', 'Plain');
    await addMembership(uid, orgId, 'user');
    const res = await req('post', '/api/v1/projects', { token: 'plain', orgId })
      .send({ name: 'Nope', key: 'NOPE', visibility: 'public' });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate project key in the same org (409)', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const first = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'First', key: 'RAI', visibility: 'public' });
    expect(first.status).toBe(201);
    const dup = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Second', key: 'RAI', visibility: 'public' });
    expect(dup.status).toBe(409);
  });

  it('a private project is hidden from a non-member user', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const uid = await seedUser('viewer', 'viewer@test.com', 'Viewer');
    await addMembership(uid, orgId, 'user');
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Private', key: 'PRIV', visibility: 'private' });
    const list = await req('get', '/api/v1/projects', { token: 'viewer', orgId });
    expect(list.body.data.find((p: { id: string }) => p.id === proj.body.data.id)).toBeUndefined();
  });

  it('a public project is visible to any member', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const uid = await seedUser('viewer2', 'viewer2@test.com', 'Viewer2');
    await addMembership(uid, orgId, 'user');
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Public', key: 'PUB', visibility: 'public' });
    const list = await req('get', '/api/v1/projects', { token: 'viewer2', orgId });
    expect(list.body.data.find((p: { id: string }) => p.id === proj.body.data.id)).toBeTruthy();
  });

  it('an archived project is read-only except for unarchive (403)', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Arch', key: 'ARCH', visibility: 'public' });
    const id = proj.body.data.id;
    await req('patch', `/api/v1/projects/${id}`, { token: ownerToken, orgId }).send({ archived: true });
    const edit = await req('patch', `/api/v1/projects/${id}`, { token: ownerToken, orgId }).send({ name: 'Renamed' });
    expect(edit.status).toBe(403);
  });
});

// ── Sprint state machine ───────────────────────────────────────────────────────
describe('Sprints — state machine', () => {
  async function projectFixture() {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Proj', key: 'PRJ', visibility: 'public' });
    return { ownerToken, orgId, projectId: proj.body.data.id };
  }

  it('creates a planned sprint then starts it (planned → active)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const created = await req('post', `/api/v1/projects/${projectId}/sprints`, { token: ownerToken, orgId })
      .send({ name: 'Sprint 1' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('planned');
    const started = await req('patch', `/api/v1/projects/${projectId}/sprints/${created.body.data.id}`, { token: ownerToken, orgId })
      .send({ status: 'active' });
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('active');
  });

  it('rejects a second active sprint in the same project (409)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const s1 = await req('post', `/api/v1/projects/${projectId}/sprints`, { token: ownerToken, orgId }).send({ name: 'S1' });
    await req('patch', `/api/v1/projects/${projectId}/sprints/${s1.body.data.id}`, { token: ownerToken, orgId }).send({ status: 'active' });
    const s2 = await req('post', `/api/v1/projects/${projectId}/sprints`, { token: ownerToken, orgId }).send({ name: 'S2' });
    const start2 = await req('patch', `/api/v1/projects/${projectId}/sprints/${s2.body.data.id}`, { token: ownerToken, orgId }).send({ status: 'active' });
    expect(start2.status).toBe(409);
  });

  it('cannot revert an active sprint to planned', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const s = await req('post', `/api/v1/projects/${projectId}/sprints`, { token: ownerToken, orgId }).send({ name: 'S' });
    await req('patch', `/api/v1/projects/${projectId}/sprints/${s.body.data.id}`, { token: ownerToken, orgId }).send({ status: 'active' });
    const revert = await req('patch', `/api/v1/projects/${projectId}/sprints/${s.body.data.id}`, { token: ownerToken, orgId }).send({ status: 'planned' });
    expect(revert.status).toBe(400); // "Cannot revert a sprint to planned"
  });

  it('cannot delete an active sprint (400)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const s = await req('post', `/api/v1/projects/${projectId}/sprints`, { token: ownerToken, orgId }).send({ name: 'S' });
    await req('patch', `/api/v1/projects/${projectId}/sprints/${s.body.data.id}`, { token: ownerToken, orgId }).send({ status: 'active' });
    const del = await req('delete', `/api/v1/projects/${projectId}/sprints/${s.body.data.id}`, { token: ownerToken, orgId });
    expect(del.status).toBe(400);
  });
});

// ── Tickets ────────────────────────────────────────────────────────────────────
describe('Tickets', () => {
  async function projectFixture() {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Proj', key: 'RAI', visibility: 'public' });
    return { ownerToken, orgId, projectId: proj.body.data.id };
  }

  it('auto-generates sequential keys (RAI-1, RAI-2)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const t1 = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'First', type: 'task', priority: 'medium' });
    const t2 = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'Second', type: 'bug', priority: 'high' });
    expect(t1.body.data.key).toBe('RAI-1');
    expect(t2.body.data.key).toBe('RAI-2');
  });

  it('rejects an assignee who is not an org member (400)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const res = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'X', type: 'task', priority: 'low', assigneeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    expect(res.status).toBe(400);
  });

  it('a plain user can create a ticket but cannot delete one (403)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const uid = await seedUser('tuser', 'tuser@test.com', 'T User');
    await addMembership(uid, orgId, 'user');
    const created = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: 'tuser', orgId })
      .send({ title: 'Mine', type: 'task', priority: 'medium' });
    expect(created.status).toBe(201);
    const del = await req('delete', `/api/v1/projects/${projectId}/tickets/${created.body.data.id}`, { token: 'tuser', orgId });
    expect(del.status).toBe(403);
  });

  it('rejects an invalid ticket type (400)', async () => {
    const { ownerToken, orgId, projectId } = await projectFixture();
    const res = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'Bad', type: 'nonsense', priority: 'medium' });
    expect(res.status).toBe(400);
  });
});

// ── Comments ───────────────────────────────────────────────────────────────────
describe('Comments', () => {
  it('only the author can edit their comment (403 for others)', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'P', key: 'CMT', visibility: 'public' });
    const projectId = proj.body.data.id;
    const ticket = await req('post', `/api/v1/projects/${projectId}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'Ticket Title', type: 'task', priority: 'medium' });
    const ticketId = ticket.body.data.id;

    const other = await seedUser('commenter', 'commenter@test.com', 'Commenter');
    await addMembership(other, orgId, 'user');
    const c = await req('post', `/api/v1/projects/${projectId}/tickets/${ticketId}/comments`, { token: 'commenter', orgId })
      .send({ content: 'hello' });
    expect(c.status).toBe(201);
    // addComment returns the created comment directly (CommentResponse), not a ticket.
    const commentId = c.body.data.id;
    const edit = await req('patch', `/api/v1/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`, { token: ownerToken, orgId })
      .send({ content: 'tampered' });
    expect(edit.status).toBe(403);
  });
});

// ── Search ─────────────────────────────────────────────────────────────────────
describe('Search', () => {
  it('rejects a too-short query (400)', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const res = await req('get', '/api/v1/search?q=a', { token: ownerToken, orgId });
    expect(res.status).toBe(400);
  });

  it('finds a ticket by title within the current org', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const proj = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'P', key: 'SRCH', visibility: 'public' });
    await req('post', `/api/v1/projects/${proj.body.data.id}/tickets`, { token: ownerToken, orgId })
      .send({ title: 'Findable Unicorn', type: 'task', priority: 'medium' });
    const res = await req('get', '/api/v1/search?q=Unicorn', { token: ownerToken, orgId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ── OTP gate (model) ─────────────────────────────────────────────────────────
// The security core behind the sensitive-action email-OTP. Tested at the model
// layer (not the HTTP request endpoint, which needs real SES to send the code).
describe('OTP gate', () => {
  it('verifies a freshly minted code once, then rejects reuse (single-use)', async () => {
    const userId = await seedUser('otp-u1', 'otp1@test.com', 'OTP One');
    const code = await createChallenge(userId, 'delete_org', 'org-1');

    const first = await verifyChallenge(userId, 'delete_org', 'org-1', code);
    expect(first.ok).toBe(true);

    const reuse = await verifyChallenge(userId, 'delete_org', 'org-1', code);
    expect(reuse.ok).toBe(false);
    expect(reuse.reason).toBe('no_challenge');
  });

  it('rejects wrong codes and burns the challenge after the attempt cap', async () => {
    const userId = await seedUser('otp-u2', 'otp2@test.com', 'OTP Two');
    const code = await createChallenge(userId, 'delete_project', '42');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 2; i++) {
      const r = await verifyChallenge(userId, 'delete_project', '42', wrong);
      expect(r).toEqual({ ok: false, reason: 'mismatch' });
    }
    // 3rd wrong guess crosses the cap → challenge is consumed.
    const capped = await verifyChallenge(userId, 'delete_project', '42', wrong);
    expect(capped).toEqual({ ok: false, reason: 'too_many_attempts' });
    // Even the correct code is now dead (had to request a fresh one).
    const correctButDead = await verifyChallenge(userId, 'delete_project', '42', code);
    expect(correctButDead.ok).toBe(false);
  });

  it('binds a code to its (action, target) — wrong target is rejected', async () => {
    const userId = await seedUser('otp-u3', 'otp3@test.com', 'OTP Three');
    const code = await createChallenge(userId, 'delete_org', 'org-A');
    const r = await verifyChallenge(userId, 'delete_org', 'org-B', code);
    expect(r).toEqual({ ok: false, reason: 'no_challenge' });
  });

  it('a resend retires the previous code', async () => {
    const userId = await seedUser('otp-u4', 'otp4@test.com', 'OTP Four');
    const first  = await createChallenge(userId, 'transfer_ownership', 'org-X');
    const second = await createChallenge(userId, 'transfer_ownership', 'org-X');

    const old = await verifyChallenge(userId, 'transfer_ownership', 'org-X', first);
    expect(old.ok).toBe(false);
    const fresh = await verifyChallenge(userId, 'transfer_ownership', 'org-X', second);
    expect(fresh.ok).toBe(true);
  });
});

// ── Billing ──────────────────────────────────────────────────────────────────
// Razorpay is the only provider in real deploys (no NoOp fallback). Tests run
// against the deterministic stub below — injected via setBillingProvider, so the
// factory (real Razorpay) is never built and no network / no secrets are needed.
// It models the real flow: subscribe → checkout (never auto-active); confirm with
// a 'valid' signature = paid → active; any other signature = declined.
describe('Billing', () => {
  // Stub provider with isLive=true so the signature-gated paths run. Signature
  // is "valid" only for the literal 'valid' — lets us assert reject vs accept.
  const stubLive: BillingProvider = {
    name: 'stub', isLive: true, publicKeyId: 'test_key',
    async createCustomer() { return 'cust_test'; },
    async createRecurringSubscription() { return { subscriptionId: 'sub_test', shortUrl: null }; },
    async createOneTimeOrder(a) { return { orderId: 'order_test', amountCents: a.amountCents, currency: a.currency }; },
    verifyOrderPayment(a) { return a.signature === 'valid'; },
    verifySubscriptionPayment(a) { return a.signature === 'valid'; },
    async cancelSubscription() { /* no-op */ },
    async listInvoices() { return []; },
    async listPaymentsByOrder() { return []; },
    verifyWebhookSignature() { return false; },
    parseWebhookEvent() { return { type: 'ignored', providerSubscriptionId: null, currentPeriodEnd: null, rawEvent: 'stub' }; },
  };

  // Pin the stub before every billing test so getBillingProvider() never builds
  // the real Razorpay provider. RAZORPAY_PLAN_ID is required by the recurring
  // path (env-first) — set it here the same way a real deploy would. Reset after
  // the suite so neither the stub nor the env leaks.
  beforeEach(() => {
    setBillingProvider(stubLive);
    process.env['RAZORPAY_PLAN_ID'] = 'plan_test';
  });
  afterAll(() => {
    setBillingProvider(null);
    delete process.env['RAZORPAY_PLAN_ID'];
  });

  it('new org starts on a 30-day trial (₹129/seat)', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    const res = await req('get', '/api/v1/billing', { token: ownerToken, orgId });
    expect(res.status).toBe(200);
    expect(res.body.data.billing.status).toBe('trialing');
    expect(res.body.data.billing.gate_status).toBe('trial');
    expect(res.body.data.billing.price_per_seat_inr).toBe(129);
  });

  it('non-admin cannot view billing', async () => {
    const { orgId } = await setupOwnerWithOrg();
    const uid = await seedUser('m1', 'm1@test.com', 'Member One');
    await addMembership(uid, orgId, 'user');
    const res = await req('get', '/api/v1/billing', { token: 'm1', orgId });
    expect(res.status).toBe(403);
  });

  it('blocks writes when read-only (403 SUBSCRIPTION_EXPIRED), still allows reads', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    // Read-only is derived from ACCESS TRUTH (dates), not just the org column — so
    // we must genuinely expire the trial (what the sweep does in prod). Setting the
    // gate column alone wouldn't suspend an org that still has trial time left.
    await pool.query(
      "UPDATE subscriptions SET status = 'past_due', trial_ends_at = NOW() - INTERVAL '1 day', current_period_end = NULL WHERE org_id = $1",
      [orgId],
    );
    await pool.query("UPDATE organizations SET subscription_status = 'suspended' WHERE id = $1", [orgId]);

    const write = await req('post', '/api/v1/projects', { token: ownerToken, orgId })
      .send({ name: 'Blocked', key: 'BLK', visibility: 'private' });
    expect(write.status).toBe(403);
    expect(write.body.error).toBe('SUBSCRIPTION_EXPIRED');

    const read = await req('get', '/api/v1/projects', { token: ownerToken, orgId });
    expect(read.status).toBe(200);
  });

  it('subscribe opens a Razorpay checkout (never auto-active); decline stays read-only, confirm activates', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();
    await pool.query("UPDATE organizations SET subscription_status = 'suspended' WHERE id = $1", [orgId]);

    // Subscribe returns a checkout to open in Razorpay — it does NOT activate.
    const res = await req('post', '/api/v1/billing/subscribe', { token: ownerToken, orgId }).send({ mode: 'recurring' });
    expect(res.status).toBe(200);
    expect(res.body.data.checkout.activated).toBe(false);
    expect(res.body.data.checkout.subscriptionId).toBe('sub_test');

    // Still read-only until a real payment is confirmed — no free activation.
    const after = await req('get', '/api/v1/billing', { token: ownerToken, orgId });
    expect(after.body.data.billing.status).not.toBe('active');

    // User exits / cancels on the Razorpay screen → confirm with a bad signature
    // is rejected (payment declined) and the org stays read-only.
    const declined = await req('post', '/api/v1/billing/confirm', { token: ownerToken, orgId })
      .send({ subscriptionId: 'sub_test', paymentId: 'pay_1', signature: 'bad' });
    expect(declined.status).toBe(400);

    // Fake-accept on Razorpay → confirm with a valid signature activates.
    const ok = await req('post', '/api/v1/billing/confirm', { token: ownerToken, orgId })
      .send({ subscriptionId: 'sub_test', paymentId: 'pay_1', signature: 'valid' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.billing.status).toBe('active');
    expect(ok.body.data.billing.auto_renew).toBe(true);
  });

  it('cancel needs an OTP; coming back is a fresh subscribe (no resume / no auto-renew toggle)', async () => {
    const { ownerToken, ownerId, orgId } = await setupOwnerWithOrg();
    await req('post', '/api/v1/billing/subscribe', { token: ownerToken, orgId }).send({ mode: 'recurring' });

    // No / bad code → blocked.
    const noCode = await req('post', '/api/v1/billing/cancel', { token: ownerToken, orgId }).send({});
    expect(noCode.status).toBe(400);

    // Real OTP bound to (owner, cancel_subscription, orgId). Cancel = period-end:
    // marks not-renewing + records the cancel intent, access retained for now.
    const code = await createChallenge(ownerId, 'cancel_subscription', orgId);
    const ok = await req('post', '/api/v1/billing/cancel', { token: ownerToken, orgId }).send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.billing.auto_renew).toBe(false);
    expect(ok.body.data.billing.canceled_at).not.toBeNull();

    // The auto-renew toggle is gone — that route no longer exists.
    const flip = await req('patch', '/api/v1/billing/auto-renew', { token: ownerToken, orgId }).send({ auto_renew: true });
    expect(flip.status).toBe(404);

    // Coming back = re-subscribe (fresh checkout) → confirm → active again, cancel
    // intent cleared. A cancelled Razorpay mandate can't be revived, so this is the
    // only path back.
    const resub = await req('post', '/api/v1/billing/subscribe', { token: ownerToken, orgId }).send({ mode: 'recurring' });
    expect(resub.status).toBe(200);
    const re = await req('post', '/api/v1/billing/confirm', { token: ownerToken, orgId })
      .send({ subscriptionId: resub.body.data.checkout.subscriptionId, paymentId: 'pay_2', signature: 'valid' });
    expect(re.status).toBe(200);
    expect(re.body.data.billing.auto_renew).toBe(true);
    expect(re.body.data.billing.canceled_at).toBeNull();
  });

  it('one_time: rejects a bad payment signature, accepts a valid one', async () => {
    const { ownerToken, orgId } = await setupOwnerWithOrg();

    const sub = await req('post', '/api/v1/billing/subscribe', { token: ownerToken, orgId }).send({ mode: 'one_time' });
    expect(sub.status).toBe(200);
    expect(sub.body.data.checkout.activated).toBe(false);

    const bad = await req('post', '/api/v1/billing/confirm', { token: ownerToken, orgId })
      .send({ orderId: 'order_test', paymentId: 'pay_1', signature: 'bad' });
    expect(bad.status).toBe(400);

    const good = await req('post', '/api/v1/billing/confirm', { token: ownerToken, orgId })
      .send({ orderId: 'order_test', paymentId: 'pay_1', signature: 'valid' });
    expect(good.status).toBe(200);
    expect(good.body.data.billing.status).toBe('active');
  });
});
