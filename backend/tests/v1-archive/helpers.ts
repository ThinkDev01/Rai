import supertest from 'supertest';
import app from '../app';
import pool from '../config/db';

export const request = supertest(app);

// ── DB cleanup ───────────────────────────────────────────────────────────────

const DATA_TABLES = [
  'ticket_status_history',
  'comments',
  'tickets',
  'sprints',
  'project_members',
  'projects',
  'users',
];

export async function cleanDB(): Promise<void> {
  for (const table of DATA_TABLES) {
    await pool.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
  }
}

// ── User helpers ─────────────────────────────────────────────────────────────

interface SeedResult {
  token: string;
  user: { id: string; name: string; email: string; role_type: string; role_name: string };
}

export async function registerUser(
  name: string,
  email: string,
  password: string = 'password123'
): Promise<SeedResult> {
  const res = await request
    .post('/api/v1/auth/register')
    .send({ name, email, password });
  return res.body.data as SeedResult;
}

export async function loginUser(email: string, password: string = 'password123'): Promise<SeedResult> {
  const res = await request
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data as SeedResult;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Force-set a user's role directly in DB (bypasses the API role check) */
export async function setUserRole(userId: string, roleType: string, roleName: string): Promise<void> {
  await pool.query(
    'UPDATE users SET role_type = $1, role_name = $2 WHERE id = $3',
    [roleType, roleName, parseInt(userId, 10)]
  );
}

export interface SeededUsers {
  admin: SeedResult;
  pm: SeedResult;
  user: SeedResult;
}

/** Create 3 users: admin, project_manager, regular user. Returns tokens + user objects. */
export async function seedUsers(): Promise<SeededUsers> {
  const admin = await registerUser('Admin User', 'admin@test.com');
  const pm    = await registerUser('PM User', 'pm@test.com');
  const user  = await registerUser('Regular User', 'user@test.com');

  // Register creates all as 'user' role — promote admin and PM via DB
  await setUserRole(admin.user.id, 'admin', 'Admin');
  await setUserRole(pm.user.id, 'project_manager', 'Project Manager');

  // Re-login so tokens have updated role claims
  const adminLogin = await loginUser('admin@test.com');
  const pmLogin    = await loginUser('pm@test.com');
  const userLogin  = await loginUser('user@test.com');

  return { admin: adminLogin, pm: pmLogin, user: userLogin };
}

// ── Project helpers ──────────────────────────────────────────────────────────

export async function createProject(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; key: string; [k: string]: unknown }> {
  const res = await request
    .post('/api/v1/projects')
    .set(auth(token))
    .send({
      name: 'Test Project',
      key: 'TEST',
      visibility: 'public',
      ...overrides,
    });
  return res.body.data;
}

// ── Sprint helpers ───────────────────────────────────────────────────────────

export async function createSprint(
  token: string,
  projectId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; name: string; status: string; [k: string]: unknown }> {
  const res = await request
    .post(`/api/v1/projects/${projectId}/sprints`)
    .set(auth(token))
    .send({
      name: 'Sprint 1',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      ...overrides,
    });
  return res.body.data;
}

// ── Ticket helpers ───────────────────────────────────────────────────────────

export async function createTicket(
  token: string,
  projectId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; key: string; status: string; [k: string]: unknown }> {
  const res = await request
    .post(`/api/v1/projects/${projectId}/tickets`)
    .set(auth(token))
    .send({
      title: 'Test Ticket',
      type: 'task',
      priority: 'medium',
      ...overrides,
    });
  return res.body.data;
}

// ── Member helpers ───────────────────────────────────────────────────────────

export async function addMember(token: string, projectId: string, userId: string): Promise<void> {
  await request
    .post(`/api/v1/projects/${projectId}/members`)
    .set(auth(token))
    .send({ userId });
}
