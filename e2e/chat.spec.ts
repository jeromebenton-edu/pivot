import { test, expect } from '@playwright/test';

test.describe('Chat flow', () => {
  test('health endpoint returns OK', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBeLessThanOrEqual(503);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
  });

  test('chat API requires authentication', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: {
        messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
      },
    });
    expect(res.status()).toBe(401);
  });

  test('docs endpoint returns OpenAPI spec', async ({ request }) => {
    const res = await request.get('/api/docs');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.openapi).toBe('3.0.3');
    expect(body.info.title).toContain('Pivot');
  });
});
