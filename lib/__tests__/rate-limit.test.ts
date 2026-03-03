import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rate-limit';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('allows requests within limit', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect((await limiter('rl-user-a1')).success).toBe(true);
    expect((await limiter('rl-user-a1')).success).toBe(true);
    expect((await limiter('rl-user-a1')).success).toBe(true);
  });

  it('blocks requests exceeding limit', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    await limiter('rl-user-b1');
    await limiter('rl-user-b1');
    const result = await limiter('rl-user-b1');
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it('resets after window expires', async () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    await limiter('rl-user-c1');
    const blocked = await limiter('rl-user-c1');
    expect(blocked.success).toBe(false);

    vi.advanceTimersByTime(1500);
    const reset = await limiter('rl-user-c1');
    expect(reset.success).toBe(true);
  });

  it('tracks different users independently', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect((await limiter('rl-user-d1')).success).toBe(true);
    expect((await limiter('rl-user-d2')).success).toBe(true);
    expect((await limiter('rl-user-d1')).success).toBe(false);
    expect((await limiter('rl-user-d2')).success).toBe(false);
  });

  it('uses custom error message', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, message: 'Custom message' });
    await limiter('rl-user-e1');
    const result = await limiter('rl-user-e1');
    expect(result.message).toBe('Custom message');
  });

  it('uses default config when none provided', async () => {
    const limiter = createRateLimiter();
    // Default max is 10, use unique user
    for (let i = 0; i < 10; i++) {
      expect((await limiter('rl-user-f1')).success).toBe(true);
    }
    expect((await limiter('rl-user-f1')).success).toBe(false);
  });

  it('first request always succeeds', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 100 });
    const result = await limiter('rl-user-g-brand-new');
    expect(result.success).toBe(true);
  });

  it('increments count on each request', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    for (let i = 0; i < 5; i++) {
      const result = await limiter('rl-user-h1');
      expect(result.success).toBe(true);
    }
    const result = await limiter('rl-user-h1');
    expect(result.success).toBe(false);
  });
});
