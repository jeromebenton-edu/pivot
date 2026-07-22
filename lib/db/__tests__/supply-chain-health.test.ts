import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const query = vi.fn();

vi.mock('pg', () => {
  // Must be a real constructor — supply-chain.ts calls `new Pool(...)`
  class Pool {
    query = query;
  }
  return { default: { Pool }, Pool };
});

import { checkDBHealth } from '../supply-chain';

const ORIGINAL_URL = process.env.DATABASE_URL;

describe('checkDBHealth', () => {
  beforeEach(() => {
    query.mockReset();
    process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/test';
    // Drop any pool cached by an earlier test
    (globalThis as Record<string, unknown>).__pivotPgPool = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_URL;
  });

  it('reports false when no DATABASE_URL is configured', async () => {
    delete process.env.DATABASE_URL;
    await expect(checkDBHealth()).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports true when the probe query succeeds', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await expect(checkDBHealth()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('does not depend on prior initialization, so it cannot flicker', async () => {
    query.mockResolvedValue({ rows: [] });
    // Two back-to-back calls with no init in between must agree
    await expect(checkDBHealth()).resolves.toBe(true);
    await expect(checkDBHealth()).resolves.toBe(true);
  });

  it('reports false when the probe query rejects', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(checkDBHealth()).resolves.toBe(false);
  });

  it('reports false when the probe exceeds the timeout', async () => {
    query.mockReturnValue(new Promise(() => {})); // never settles
    const result = checkDBHealth(50);
    await expect(result).resolves.toBe(false);
  });

  it('does not leave an unhandled rejection when the probe loses the race', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);

    let reject!: (e: Error) => void;
    query.mockReturnValue(new Promise((_, r) => { reject = r; }));
    await expect(checkDBHealth(20)).resolves.toBe(false);
    reject(new Error('late failure'));
    await new Promise(resolve => setTimeout(resolve, 20));

    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});
