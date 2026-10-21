import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createTicket, type SeededUsers } from './helpers';

describe('Comments', () => {
  let s: SeededUsers;
  let projectId: string;
  let ticketId: string;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
    const proj = await createProject(s.admin.token);
    projectId = proj.id;
    const ticket = await createTicket(s.admin.token, projectId);
    ticketId = ticket.id;
  });

  // ── POST /projects/:id/tickets/:ticketId/comments ────────────────────────

  describe('POST — add comment', () => {
    it('should add comment', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.admin.token))
        .send({ content: 'Great work!' });
      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe('Great work!');
      expect(res.body.data.author).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('should return 400 for empty content', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.admin.token))
        .send({ content: '' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing content', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.admin.token))
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent ticket', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/tickets/99999/comments`)
        .set(auth(s.admin.token))
        .send({ content: 'Hello' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /projects/:id/tickets/:ticketId/comments/:commentId ───────────

  describe('DELETE — delete comment', () => {
    it('should allow user to delete own comment', async () => {
      const add = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.user.token))
        .send({ content: 'My comment' });
      const commentId = add.body.data.id;

      const res = await request
        .delete(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(s.user.token));
      expect(res.status).toBe(200);
    });

    it('should allow admin to delete any comment', async () => {
      const add = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.user.token))
        .send({ content: 'User comment' });
      const commentId = add.body.data.id;

      const res = await request
        .delete(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(200);
    });

    it('should allow PM to delete any comment', async () => {
      const add = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.user.token))
        .send({ content: 'User comment' });
      const commentId = add.body.data.id;

      const res = await request
        .delete(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(s.pm.token));
      expect(res.status).toBe(200);
    });

    it('should deny regular user deleting other user comment', async () => {
      const add = await request
        .post(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments`)
        .set(auth(s.admin.token))
        .send({ content: 'Admin comment' });
      const commentId = add.body.data.id;

      const res = await request
        .delete(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`)
        .set(auth(s.user.token));
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent comment', async () => {
      const res = await request
        .delete(`/api/v1/projects/${projectId}/tickets/${ticketId}/comments/99999`)
        .set(auth(s.admin.token));
      expect(res.status).toBe(404);
    });
  });
});
