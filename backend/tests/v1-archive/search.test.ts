import { describe, it, expect, beforeEach } from 'vitest';
import { request, cleanDB, auth, seedUsers, createProject, createTicket, type SeededUsers } from './helpers';

describe('Search', () => {
  let s: SeededUsers;

  beforeEach(async () => {
    await cleanDB();
    s = await seedUsers();
  });

  describe('GET /api/v1/search?q=', () => {
    it('should find tickets by title', async () => {
      const proj = await createProject(s.admin.token);
      await createTicket(s.admin.token, proj.id, { title: 'Fix login bug' });
      await createTicket(s.admin.token, proj.id, { title: 'Add dashboard' });

      const res = await request.get('/api/v1/search?q=login').set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Fix login bug');
    });

    it('should find tickets by key', async () => {
      const proj = await createProject(s.admin.token);
      await createTicket(s.admin.token, proj.id);

      const res = await request.get('/api/v1/search?q=TEST-1').set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should return 400 for query too short', async () => {
      const res = await request.get('/api/v1/search?q=a').set(auth(s.admin.token));
      expect(res.status).toBe(400);
    });

    it('should return empty array for no results', async () => {
      const res = await request.get('/api/v1/search?q=nonexistent').set(auth(s.admin.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should respect project visibility', async () => {
      const proj = await createProject(s.admin.token, { visibility: 'private', key: 'PRV' });
      await createTicket(s.admin.token, proj.id, { title: 'Secret ticket' });

      // Regular user (not member) should not see it
      const res = await request.get('/api/v1/search?q=Secret').set(auth(s.user.token));
      expect(res.body.data.length).toBe(0);

      // Admin should see it
      const adminRes = await request.get('/api/v1/search?q=Secret').set(auth(s.admin.token));
      expect(adminRes.body.data.length).toBe(1);
    });
  });
});
