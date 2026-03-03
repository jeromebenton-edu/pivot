import { describe, it, expect } from 'vitest';
import { POST } from '../route';

describe('POST /api/mcp', () => {
  it('returns 501 not implemented', async () => {
    const res = await POST();
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.status).toBe('not_implemented');
  });

  it('does not echo request body', async () => {
    const res = await POST();
    const body = await res.json();
    expect(body.received).toBeUndefined();
  });
});
