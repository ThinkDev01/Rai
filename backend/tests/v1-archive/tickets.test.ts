import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createSprint, createTicket, addMember, type SeededUsers } from './helpers';
import pool from '../config/db';

describe('Tickets', () => {
  let s: SeededUsers;
  let projectId: string;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
    const proj = await createProject(s.admin.token);
    projectId = proj.id;
  });

  // ── GET /projects/:id/tickets/:key ───────────────────────────────────────

  describe('GET /projects/:id/tickets/:key', () => {
    it('should get ticket by key', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.get(`/api/v1/projects/${projectId}/tickets/${ticket.key}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe(ticket.key);
      expect(res.body.data.comments).toBeDefined();
      expect(res.body.data.subTicketKeys).toBeDefined();
    });

    it('should return 404 for nonexistent ticket', async () => {
      const res = await request.get(`/api/v1/projects/${projectId}/tickets/TEST-999`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });

  // ── POST /projects/:id/tickets ───────────────────────────────────────────

  describe('POST /projects/:id/tickets', () => {
    it('should create ticket with required fields', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'My Ticket', type: 'task', priority: 'medium' });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toMatch(/^TEST-\d+$/);
      expect(res.body.data.status).toBe('todo');
    });

    it('should auto-increment ticket keys', async () => {
      const t1 = await createTicket(s.admin.token, projectId);
      const t2 = await createTicket(s.admin.token, projectId, { title: 'Second' });
      expect(t1.key).toBe('TEST-1');
      expect(t2.key).toBe('TEST-2');
    });

    it('should set reporter to current user', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium' });
      expect(res.body.data.reporter.id).toBe(String(s.admin.user.id));
    });

    it('should create with assignee who is project member', async () => {
      await addMember(s.admin.token, projectId, s.user.user.id);
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium', assigneeId: s.user.user.id });
      expect(res.status).toBe(201);
      expect(res.body.data.assignee.id).toBe(String(s.user.user.id));
    });

    it('should return 400 for assignee not member', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium', assigneeId: s.user.user.id });
      expect(res.status).toBe(400);
    });

    it('should create with sprint', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium', sprintId: sprint.id });
      expect(res.status).toBe(201);
      expect(res.body.data.sprintId).toBe(sprint.id);
    });

    it('should return 400 for sprint not in project', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium', sprintId: '99999' });
      expect(res.status).toBe(400);
    });

    it('should create with parent ticket', async () => {
      const parent = await createTicket(s.admin.token, projectId, { title: 'Parent' });
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'Child', type: 'task', priority: 'medium', parentKey: parent.key });
      expect(res.status).toBe(201);
      expect(res.body.data.parentKey).toBe(parent.key);
    });

    it('should return 400 for nonexistent parent', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'Child', type: 'task', priority: 'medium', parentKey: 'TEST-999' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing title', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ type: 'task', priority: 'medium' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'feature', priority: 'medium' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid priority', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'urgent' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid status', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/tickets`)
        .set(auth(s.admin.token))
        .send({ title: 'T', type: 'task', priority: 'medium', status: 'closed' });
      expect(res.status).toBe(400);
    });

    it('should log initial status in history', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const history = await pool.query(
        'SELECT * FROM ticket_status_history WHERE ticket_id = $1',
        [parseInt(ticket.id, 10)]
      );
      expect(history.rows.length).toBeGreaterThanOrEqual(1);
      expect(history.rows[0]!.new_status).toBe('todo');
    });
  });

  // ── PATCH /projects/:id/tickets/:ticketId ────────────────────────────────

  describe('PATCH /projects/:id/tickets/:ticketId', () => {
    it('should update title', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ title: 'Updated Title' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Title');
    });

    it('should update status and log in history', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ status: 'in_progress' });
      const history = await pool.query(
        'SELECT * FROM ticket_status_history WHERE ticket_id = $1 ORDER BY changed_at DESC',
        [parseInt(ticket.id, 10)]
      );
      expect(history.rows.length).toBeGreaterThanOrEqual(2); // initial + update
      expect(history.rows[0]!.new_status).toBe('in_progress');
      expect(history.rows[0]!.old_status).toBe('todo');
    });

    it('should clear assignee', async () => {
      await addMember(s.admin.token, projectId, s.user.user.id);
      const ticket = await createTicket(s.admin.token, projectId, { assigneeId: s.user.user.id });
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ assigneeId: null });
      expect(res.status).toBe(200);
      expect(res.body.data.assignee).toBeNull();
    });

    it('should move ticket to backlog', async () => {
      const sprint = await createSprint(s.admin.token, projectId);
      const ticket = await createTicket(s.admin.token, projectId, { sprintId: sprint.id });
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ sprintId: null });
      expect(res.status).toBe(200);
      expect(res.body.data.sprintId).toBeNull();
    });

    it('should return 400 for empty title', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ title: '' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid status', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({ status: 'closed' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for no fields', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token)).send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent ticket', async () => {
      const res = await request.patch(`/api/v1/projects/${projectId}/tickets/99999`)
        .set(auth(s.admin.token)).send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /projects/:id/tickets/:ticketId ───────────────────────────────

  describe('DELETE /projects/:id/tickets/:ticketId', () => {
    it('should allow admin to delete', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.delete(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
    });

    it('should allow PM to delete', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.delete(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.pm.token));
      expect(res.status).toBe(200);
    });

    it('should deny regular user', async () => {
      const ticket = await createTicket(s.admin.token, projectId);
      const res = await request.delete(`/api/v1/projects/${projectId}/tickets/${ticket.id}`)
        .set(auth(s.user.token));
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent ticket', async () => {
      const res = await request.delete(`/api/v1/projects/${projectId}/tickets/99999`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });
});
