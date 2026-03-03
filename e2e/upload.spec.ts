import { test, expect } from '@playwright/test';

test.describe('Upload flow', () => {
  test('upload API requires authentication', async ({ request }) => {
    const res = await request.post('/api/upload');
    expect(res.status()).toBe(401);
  });

  test('dashboards API requires authentication', async ({ request }) => {
    const res = await request.get('/api/dashboards');
    expect(res.status()).toBe(401);
  });
});
