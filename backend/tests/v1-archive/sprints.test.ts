import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createSprint, createTicket, type SeededUsers } from './helpers';

describe('Sprints', () => {
  let s: SeededUsers;
  let projectId: string;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
    const proj = await createProject(s.admin.token);
    projectId = proj.id;
  });

  // ── POST /projects/:id/sprints ───────────────────────────────────────────

  describe('POST /projects/:id/sprints', () => {
    it('should create sprint', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/sprints`).set(auth(s.admin.token))
        .send({ name: 'Sprint 1' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Sprint 1');
      expect(res.body.data.status).toBe('planned');
    });

    it('should allow PM to create', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/sprints`).set(auth(s.pm.token))
        .send({ name: 'Sprint PM' });
      expect(res.status).toBe(201);
    });

    it('should deny regular user', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/sprints`).set(auth(s.user.token))
        .send({ name: 'Sprint No' });
      expect(res.status).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/sprints`).set(auth(s.admin.token))
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate name', async () => {
      await createSprint(s.admin.token, projectId, { name: 'Dup Sprint' });
      const res = await request.post(`/api/v1/projects/${projectId}/sprints`).set(auth(s.admin.token))
        .send({ name: 'Dup Sprint' });
      expect(res.status).toBe(409);
    });
  });

  // ── PATCH /projects/:id/sprints/:sprintId ────────────────────────────────

  describe('PATCH — sprint updates + state machine', () => {
    it('should update sprint name', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed');
    });

    it('should start sprint (planned → active)', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should deny starting when another sprint is active', async () => {
      const s1 = await createSprint(s.admin.token, projectId, { name: 'S1' });
      await createSprint(s.admin.token, projectId, { name: 'S2' });
      // Start S1
      await request.patch(`/api/v1/projects/${projectId}/sprints/${s1.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      // Try to start S2
      const sprint2 = (await request.get(`/api/v1/projects/${projectId}`).set(auth(s.admin.token))).body.data.sprints.find((sp: { name: string }) => sp.name === 'S2');
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint2.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      expect(res.status).toBe(409);
    });

    it('should complete sprint (active → completed)', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
    });

    it('should move incomplete tickets to backlog on complete', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      // Start sprint
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      // Add tickets
      await createTicket(s.admin.token, projectId, { sprintId: sprint.id, title: 'Todo ticket' });
      await createTicket(s.admin.token, projectId, { sprintId: sprint.id, title: 'Done ticket', status: 'done' });
      // Complete sprint
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'completed' });
      // Check: project should have 1 ticket in backlog (the todo one), 1 in sprint (done one)
      const proj = await request.get(`/api/v1/projects/${projectId}`).set(auth(s.admin.token));
      expect(proj.body.data.backlog.length).toBe(1);
      expect(proj.body.data.backlog[0].title).toBe('Todo ticket');
    });

    it('should deny reverting to planned', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'planned' });
      expect(res.status).toBe(400);
    });

    it('should deny changing completed sprint status', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'completed' });
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent sprint', async () => {
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/99999`)
        .set(auth(s.admin.token)).send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for no fields', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({});
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /projects/:id/sprints/:sprintId ───────────────────────────────

  describe('DELETE /projects/:id/sprints/:sprintId', () => {
    it('should delete planned sprint', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.delete(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
    });

    it('should move tickets to backlog on delete', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      await createTicket(s.admin.token, projectId, { sprintId: sprint.id });
      await request.delete(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token));
      const proj = await request.get(`/api/v1/projects/${projectId}`).set(auth(s.admin.token));
      expect(proj.body.data.backlog.length).toBe(1);
    });

    it('should deny deleting active sprint', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      const res = await request.delete(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should deny PM from deleting (admin only)', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.delete(`/api/v1/projects/${projectId}/sprints/${sprint.id}`)
        .set(auth(s.pm.token));
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent sprint', async () => {
      const res = await request.delete(`/api/v1/projects/${projectId}/sprints/99999`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });
});
