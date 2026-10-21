import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createSprint, createTicket, addMember, type SeededUsers } from './helpers';

describe('AI Agent Endpoints', () => {
  let s: SeededUsers;

  beforeEach(async () => { await cleanDB(); s = await seedUsers(); });

  // ── GET /users/:id/tickets ───────────────────────────────────────────────

  describe('GET /api/v1/users/:id/tickets', () => {
    it('should return tickets assigned to a user across projects', async () => {
      const p1 = await createProject(s.admin.token, { name: 'P1', key: 'PA' });
      const p2 = await createProject(s.admin.token, { name: 'P2', key: 'PB' });
      await addMember(s.admin.token, p1.id, s.user.user.id);
      await addMember(s.admin.token, p2.id, s.user.user.id);
      await createTicket(s.admin.token, p1.id, { assigneeId: s.user.user.id, title: 'Task in P1' });
      await createTicket(s.admin.token, p2.id, { assigneeId: s.user.user.id, title: 'Task in P2' });
      await createTicket(s.admin.token, p1.id, { title: 'Unassigned' });

      const res = await request.get(`/api/v1/users/${s.user.user.id}/tickets`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].projectKey).toBeDefined();
      expect(res.body.data[0].projectName).toBeDefined();
    });

    it('should return empty array if user has no assignments', async () => {
      const res = await request.get(`/api/v1/users/${s.user.user.id}/tickets`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request.get('/api/v1/users/99999/tickets')
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid user id', async () => {
      const res = await request.get('/api/v1/users/abc/tickets')
        .set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await request.get(`/api/v1/users/${s.user.user.id}/tickets`);
      expect(res.status).toBe(401);
    });

    it('should include sprint and project context', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      const sprint = await createSprint(s.admin.token, proj.id);
      await createTicket(s.admin.token, proj.id, {
        assigneeId: s.user.user.id,
        sprintId: sprint.id,
      });

      const res = await request.get(`/api/v1/users/${s.user.user.id}/tickets`)
        .set(auth(s.admin.token));
      expect(res.body.data[0].sprintName).toBe('Sprint 1');
      expect(res.body.data[0].projectKey).toBe('TEST');
    });

    it('should order by status priority (in_progress first)', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      const t1 = await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'Todo one' });
      const t2 = await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'Active one' });
      // Move t2 to in_progress
      await request.patch(`/api/v1/projects/${proj.id}/tickets/${t2.id}`)
        .set(auth(s.admin.token)).send({ status: 'in_progress' });

      const res = await request.get(`/api/v1/users/${s.user.user.id}/tickets`)
        .set(auth(s.admin.token));
      expect(res.body.data[0].status).toBe('in_progress');
      expect(res.body.data[1].status).toBe('todo');
    });
  });

  // ── GET /projects/:id/tickets (filtered listing) ─────────────────────────

  describe('GET /api/v1/projects/:id/tickets', () => {
    it('should return all tickets in a project', async () => {
      const proj = await createProject(s.admin.token);
      await createTicket(s.admin.token, proj.id, { title: 'T1' });
      await createTicket(s.admin.token, proj.id, { title: 'T2' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter by status', async () => {
      const proj = await createProject(s.admin.token);
      const t1 = await createTicket(s.admin.token, proj.id, { title: 'Todo' });
      const t2 = await createTicket(s.admin.token, proj.id, { title: 'Done' });
      await request.patch(`/api/v1/projects/${proj.id}/tickets/${t2.id}`)
        .set(auth(s.admin.token)).send({ status: 'done' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?status=done`)
        .set(auth(s.admin.token));
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Done');
    });

    it('should filter by type', async () => {
      const proj = await createProject(s.admin.token);
      await createTicket(s.admin.token, proj.id, { title: 'A Bug', type: 'bug' });
      await createTicket(s.admin.token, proj.id, { title: 'A Task', type: 'task' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?type=bug`)
        .set(auth(s.admin.token));
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('A Bug');
    });

    it('should filter by assigneeId', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'Assigned' });
      await createTicket(s.admin.token, proj.id, { title: 'Unassigned' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?assigneeId=${s.user.user.id}`)
        .set(auth(s.admin.token));
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Assigned');
    });

    it('should filter by priority', async () => {
      const proj = await createProject(s.admin.token);
      await createTicket(s.admin.token, proj.id, { title: 'Critical', priority: 'critical' });
      await createTicket(s.admin.token, proj.id, { title: 'Low', priority: 'low' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?priority=critical`)
        .set(auth(s.admin.token));
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Critical');
    });

    it('should combine multiple filters', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'Bug todo', type: 'bug' });
      await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'Task todo', type: 'task' });
      await createTicket(s.admin.token, proj.id, { title: 'Bug unassigned', type: 'bug' });

      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?type=bug&assigneeId=${s.user.user.id}`)
        .set(auth(s.admin.token));
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Bug todo');
    });

    it('should return 400 for invalid status filter', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?status=closed`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request.get('/api/v1/projects/99999/tickets')
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });

    it('should return empty array when no tickets match', async () => {
      const proj = await createProject(s.admin.token);
      const res = await request.get(`/api/v1/projects/${proj.id}/tickets?status=done`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});
