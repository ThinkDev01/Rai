import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, type SeededUsers } from './helpers';

describe('Users', () => {
  let s: SeededUsers;
  beforeEach(async () => { await cleanDB(); s = await seedUsers(); });

  // ── GET /users ───────────────────────────────────────────────────────────

  describe('GET /api/v1/users', () => {
    it('should list all users', async () => {
      const res = await request.get('/api/v1/users').set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('should return 401 without auth', async () => {
      const res = await request.get('/api/v1/users');
      expect(res.status).toBe(401);
    });
  });

  // ── PATCH /users/:id/role ────────────────────────────────────────────────

  describe('PATCH /api/v1/users/:id/role', () => {
    it('should allow admin to update role', async () => {
      const res = await request
        .patch(`/api/v1/users/${s.user.user.id}/role`)
        .set(auth(s.admin.token))
        .send({ role_type: 'project_manager', role_name: 'PM' });
      expect(res.status).toBe(200);
      expect(res.body.data.role_type).toBe('project_manager');
    });

    it('should deny non-admin', async () => {
      const res = await request
        .patch(`/api/v1/users/${s.user.user.id}/role`)
        .set(auth(s.pm.token))
        .send({ role_type: 'admin', role_name: 'Admin' });
      expect(res.status).toBe(403);
    });

    it('should deny changing own role', async () => {
      const res = await request
        .patch(`/api/v1/users/${s.admin.user.id}/role`)
        .set(auth(s.admin.token))
        .send({ role_type: 'user', role_name: 'User' });
      expect(res.status).toBe(403);
    });

    it('should return 400 for invalid role_type', async () => {
      const res = await request
        .patch(`/api/v1/users/${s.user.user.id}/role`)
        .set(auth(s.admin.token))
        .send({ role_type: 'superadmin', role_name: 'SA' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing role_name', async () => {
      const res = await request
        .patch(`/api/v1/users/${s.user.user.id}/role`)
        .set(auth(s.admin.token))
        .send({ role_type: 'admin' });
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request
        .patch('/api/v1/users/99999/role')
        .set(auth(s.admin.token))
        .send({ role_type: 'admin', role_name: 'Admin' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const res = await request
        .patch('/api/v1/users/abc/role')
        .set(auth(s.admin.token))
        .send({ role_type: 'admin', role_name: 'Admin' });
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /users/:id ────────────────────────────────────────────────────

  describe('DELETE /api/v1/users/:id', () => {
    it('should allow admin to delete user', async () => {
      const res = await request
        .delete(`/api/v1/users/${s.user.user.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
    });

    it('should deny non-admin', async () => {
      const res = await request
        .delete(`/api/v1/users/${s.user.user.id}`)
        .set(auth(s.pm.token));
      expect(res.status).toBe(403);
    });

    it('should deny deleting self', async () => {
      const res = await request
        .delete(`/api/v1/users/${s.admin.user.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request
        .delete('/api/v1/users/99999')
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });
});
