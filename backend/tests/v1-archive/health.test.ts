import { describe, it, expect } from 'vitest';
import { request } from './helpers';

describe('Health — GET /api/health', () => {
  it('should return ok with db connected', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('connected');
    expect(res.body.data.timestamp).toBeDefined();
  });
});
