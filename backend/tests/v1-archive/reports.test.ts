import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createSprint, createTicket, type SeededUsers } from './helpers';

describe('Reports', () => {
  let s: SeededUsers;
  let projectId: string;
  let sprintId: string;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
    const proj = await createProject(s.admin.token);
    projectId = proj.id;
    const sprint = await createSprint(s.admin.token, projectId);
    sprintId = sprint.id;
  });

  // ── Burndown ─────────────────────────────────────────────────────────────

  describe('GET /projects/:id/reports/burndown', () => {
    it('should return burndown data', async () => {
      // Start sprint and add tickets
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprintId}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      await createTicket(s.admin.token, projectId, { sprintId });
      await createTicket(s.admin.token, projectId, { sprintId, title: 'T2' });

      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/burndown?sprintId=${sprintId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.totalTickets).toBe(2);
      expect(res.body.data.points).toBeDefined();
      expect(Array.isArray(res.body.data.points)).toBe(true);
    });

    it('should return empty for sprint with no tickets', async () => {
      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/burndown?sprintId=${sprintId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.totalTickets).toBe(0);
    });

    it('should return 400 for invalid sprintId', async () => {
      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/burndown?sprintId=abc`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request
        .get(`/api/v1/projects/99999/reports/burndown?sprintId=${sprintId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });

  // ── Sprint Report ────────────────────────────────────────────────────────

  describe('GET /projects/:id/reports/sprint-report', () => {
    it('should return completed and incomplete lists', async () => {
      await request.patch(`/api/v1/projects/${projectId}/sprints/${sprintId}`)
        .set(auth(s.admin.token)).send({ status: 'active' });
      const t1 = await createTicket(s.admin.token, projectId, { sprintId, title: 'Done one' });
      await createTicket(s.admin.token, projectId, { sprintId, title: 'Incomplete' });
      // Mark one as done
      await request.patch(`/api/v1/projects/${projectId}/tickets/${t1.id}`)
        .set(auth(s.admin.token)).send({ status: 'done' });

      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/sprint-report?sprintId=${sprintId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.completed.length).toBe(1);
      expect(res.body.data.incomplete.length).toBe(1);
    });

    it('should return 404 for nonexistent sprint', async () => {
      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/sprint-report?sprintId=99999`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request
        .get(`/api/v1/projects/99999/reports/sprint-report?sprintId=${sprintId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });

  // ── Velocity ─────────────────────────────────────────────────────────────

  describe('GET /projects/:id/reports/velocity', () => {
    it('should return velocity data for all sprints', async () => {
      await createTicket(s.admin.token, projectId, { sprintId });
      const res = await request
        .get(`/api/v1/projects/${projectId}/reports/velocity`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].committed).toBe(1);
    });

    it('should return empty array for project with no sprints', async () => {
      const proj2 = await createProject(s.admin.token, { name: 'Empty', key: 'EMP' });
      const res = await request
        .get(`/api/v1/projects/${proj2.id}/reports/velocity`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await request
        .get('/api/v1/projects/99999/reports/velocity')
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });
});
