import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth } from './helpers';

describe('Auth', () => {
  beforeEach(async () => { await cleanDB(); });

  // ── Register ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register with valid data', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'test@test.com', password: 'password123',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.name).toBe('Test User');
      expect(res.body.data.user.email).toBe('test@test.com');
    });

    it('should default role to user', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'test@test.com', password: 'password123',
      });
      expect(res.body.data.user.role_type).toBe('user');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        email: 'test@test.com', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when name is too short', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'A', email: 'test@test.com', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email is missing', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email has no @', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'invalid', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when password is missing', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'test@test.com',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 when password is too short', async () => {
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'test@test.com', password: '1234567',
      });
      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate email', async () => {
      await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'dupe@test.com', password: 'password123',
      });
      const res = await request.post('/api/v1/auth/register').send({
        name: 'Another', email: 'dupe@test.com', password: 'password123',
      });
      expect(res.status).toBe(409);
    });
  });

  // ── Login ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request.post('/api/v1/auth/register').send({
        name: 'Test User', email: 'login@test.com', password: 'password123',
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request.post('/api/v1/auth/login').send({
        email: 'login@test.com', password: 'password123',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('login@test.com');
    });

    it('should return 401 for wrong password', async () => {
      const res = await request.post('/api/v1/auth/login').send({
        email: 'login@test.com', password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
    });

    it('should return 401 for nonexistent email', async () => {
      const res = await request.post('/api/v1/auth/login').send({
        email: 'nobody@test.com', password: 'password123',
      });
      expect(res.status).toBe(401);
    });

    it('should return 400 when email is missing', async () => {
      const res = await request.post('/api/v1/auth/login').send({ password: 'password123' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when password is missing', async () => {
      const res = await request.post('/api/v1/auth/login').send({ email: 'login@test.com' });
      expect(res.status).toBe(400);
    });
  });

  // ── Me ───────────────────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const reg = await request.post('/api/v1/auth/register').send({
        name: 'Me User', email: 'me@test.com', password: 'password123',
      });
      const token = reg.body.data.token;

      const res = await request.get('/api/v1/auth/me').set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('me@test.com');
    });

    it('should return 401 with no token', async () => {
      const res = await request.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request.get('/api/v1/auth/me').set(auth('garbage.token.here'));
      expect(res.status).toBe(401);
    });
  });
});
