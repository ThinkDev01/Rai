import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, addMember, type SeededUsers } from './helpers';

describe('Projects', () => {
  let s: SeededUsers;
  beforeEach(async () => { await cleanDB(); s = await seedUsers(); });

  // ── GET /projects ────────────────────────────────────────────────────────

  describe('GET /api/v1/projects', () => {
    it('should return projects for admin', async () => {
      await createProject(s.admin.token);
      const res = await request.get('/api/v1/projects').set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should filter private projects for non-members', async () => {
      await createProject(s.admin.token, { name: 'Private', key: 'PRV', visibility: 'private' });
      const res = await request.get('/api/v1/projects').set(auth(s.user.token));
      expect(res.body.data.length).toBe(0);
    });

    it('should show public projects to non-members', async () => {
      await createProject(s.admin.token, { visibility: 'public' });
      const res = await request.get('/api/v1/projects').set(auth(s.user.token));
      expect(res.body.data.length).toBe(1);
    });

    it('should return 401 without auth', async () => {
      const res = await request.get('/api/v1/projects');
      expect(res.status).toBe(401);
    });
  });

  // ── POST /projects ───────────────────────────────────────────────────────

  describe('POST /api/v1/projects', () => {
    it('should create project as admin', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'My Project', key: 'MP', visibility: 'public' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('My Project');
      expect(res.body.data.key).toBe('MP');
    });

    it('should auto-add creator as member', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'My Project', key: 'MP', visibility: 'public' });
      expect(res.body.data.members.length).toBe(1);
      expect(res.body.data.members[0].id).toBe(String(s.admin.user.id));
    });

    it('should deny non-admin', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.user.token))
        .send({ name: 'My Project', key: 'MP', visibility: 'public' });
      expect(res.status).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ key: 'MP', visibility: 'public' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for lowercase key', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'P', key: 'mp', visibility: 'public' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for key too short', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'P', key: 'M', visibility: 'public' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid visibility', async () => {
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'P', key: 'MP', visibility: 'hidden' });
      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate key', async () => {
      await createProject(s.admin.token, { key: 'DUP' });
      const res = await request.post('/api/v1/projects').set(auth(s.admin.token))
        .send({ name: 'Another', key: 'DUP', visibility: 'public' });
      expect(res.status).toBe(409);
    });
  });

  // ── GET /projects/:id ────────────────────────────────────────────────────

  describe('GET /api/v1/projects/:id', () => {
    it('should return full project', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.get(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.sprints).toBeDefined();
      expect(res.body.data.members).toBeDefined();
      expect(res.body.data.backlog).toBeDefined();
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request.get('/api/v1/projects/99999').set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const res = await request.get('/api/v1/projects/abc').set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should deny private project to non-member', async () => {
      const proj = await createProject(s.admin.token, { visibility: 'private', key: 'PRV' });
      const res = await request.get(`/api/v1/projects/${proj.id}`).set(auth(s.user.token));
      expect(res.status).toBe(404);
    });

    it('should allow public project for non-member', async () => {
      const proj = await createProject(s.admin.token, { visibility: 'public' });
      const res = await request.get(`/api/v1/projects/${proj.id}`).set(auth(s.user.token));
      expect(res.status).toBe(200);
    });
  });

  // ── PATCH /projects/:id ──────────────────────────────────────────────────

  describe('PATCH /api/v1/projects/:id', () => {
    it('should update name', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.patch(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token))
        .send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
    });

    it('should archive project', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.patch(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token))
        .send({ archived: true });
      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
    });

    it('should deny non-admin', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.patch(`/api/v1/projects/${proj.id}`).set(auth(s.user.token))
        .send({ name: 'Nope' });
      expect(res.status).toBe(403);
    });

    it('should return 400 for empty name', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.patch(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token))
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('should accept empty body (only updates timestamp)', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.patch(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token))
        .send({});
      expect(res.status).toBe(200);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request.patch('/api/v1/projects/99999').set(auth(s.admin.token))
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /projects/:id ─────────────────────────────────────────────────

  describe('DELETE /api/v1/projects/:id', () => {
    it('should delete project', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.delete(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token));
      expect(res.status).toBe(200);
      // Verify gone
      const get = await request.get(`/api/v1/projects/${proj.id}`).set(auth(s.admin.token));
      expect(get.status).toBe(404);
    });

    it('should deny non-admin', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.delete(`/api/v1/projects/${proj.id}`).set(auth(s.user.token));
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent', async () => {
      const res = await request.delete('/api/v1/projects/99999').set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });

  // ── Members ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/projects/:id/members', () => {
    it('should add member', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.post(`/api/v1/projects/${proj.id}/members`).set(auth(s.admin.token))
        .send({ userId: s.user.user.id });
      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(2);
    });

    it('should return 409 if already member', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      const res = await request.post(`/api/v1/projects/${proj.id}/members`).set(auth(s.admin.token))
        .send({ userId: s.user.user.id });
      expect(res.status).toBe(409);
    });

    it('should return 404 for nonexistent user', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.post(`/api/v1/projects/${proj.id}/members`).set(auth(s.admin.token))
        .send({ userId: '99999' });
      expect(res.status).toBe(404);
    });

    it('should deny non-admin', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.post(`/api/v1/projects/${proj.id}/members`).set(auth(s.user.token))
        .send({ userId: s.pm.user.id });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/projects/:id/members/:userId', () => {
    it('should remove member', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      const res = await request.delete(`/api/v1/projects/${proj.id}/members/${s.user.user.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
    });

    it('should return 404 if not member', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.delete(`/api/v1/projects/${proj.id}/members/${s.user.user.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });

    it('should deny non-admin', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      const res = await request.delete(`/api/v1/projects/${proj.id}/members/${s.user.user.id}`)
        .set(auth(s.user.token));
      expect(res.status).toBe(403);
    });
  });
});
