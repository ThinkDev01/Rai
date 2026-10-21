import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createTicket, addMember, type SeededUsers } from './helpers';

describe('My Work', () => {
  let s: SeededUsers;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
  });

  describe('GET /api/v1/me/tickets', () => {
    it('should return tickets assigned to current user', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id, title: 'My task' });
      await createTicket(s.admin.token, proj.id, { title: 'Not mine' });

      const res = await request.get('/api/v1/me/tickets').set(auth(s.user.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].ticket.title).toBe('My task');
    });

    it('should include project and sprint context', async () => {
      const proj = await createProject(s.admin.token);
      await addMember(s.admin.token, proj.id, s.user.user.id);
      await createTicket(s.admin.token, proj.id, { assigneeId: s.user.user.id });

      const res = await request.get('/api/v1/me/tickets').set(auth(s.user.token));
      expect(res.body.data[0].project).toBeDefined();
      expect(res.body.data[0].project.name).toBe('Test Project');
      expect(res.body.data[0].sprint).toBeDefined();
    });

    it('should return empty array when no assignments', async () => {
      const res = await request.get('/api/v1/me/tickets').set(auth(s.user.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return tickets from multiple projects', async () => {
      const proj1 = await createProject(s.admin.token, { name: 'P1', key: 'PA' });
      const proj2 = await createProject(s.admin.token, { name: 'P2', key: 'PB' });
      await addMember(s.admin.token, proj1.id, s.user.user.id);
      await addMember(s.admin.token, proj2.id, s.user.user.id);
      await createTicket(s.admin.token, proj1.id, { assigneeId: s.user.user.id });
      await createTicket(s.admin.token, proj2.id, { assigneeId: s.user.user.id });

      const res = await request.get('/api/v1/me/tickets').set(auth(s.user.token));
      expect(res.body.data.length).toBe(2);
    });
  });
});
