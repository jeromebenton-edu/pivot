/**
 * Extended SSRF protection tests covering IPv4-mapped IPv6,
 * link-local, cloud metadata, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('pg', () => ({
  Pool: vi.fn(),
}));
vi.mock('@/lib/data/chunker', () => ({
  chunkData: vi.fn(() => []),
}));
vi.mock('@/lib/data/embedder', () => ({
  embedAndStoreChunks: vi.fn(async () => ({ success: true, chunksStored: 0 })),
}));
vi.mock('@/lib/db/audit', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/cache', () => ({
  invalidateDatasetCaches: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => vi.fn(async () => ({ success: true }))),
}));

import { POST } from '../route';
import { auth } from '@/lib/auth';

const mockedAuth = auth as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides = {}) {
  return {
    action: 'test',
    type: 'postgresql',
    host: 'db.example.com',
    port: 5432,
    database: 'mydb',
    username: 'user',
    password: 'pass',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Test' } });
});

describe('SSRF protection - IPv4-mapped IPv6', () => {
  it.each([
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:172.16.0.1',
    '::ffff:192.168.1.1',
    '::ffff:169.254.169.254',
    '::ffff:0.0.0.0',
  ])('blocks IPv4-mapped IPv6 address %s', async (host) => {
    const res = await POST(makeRequest(validBody({ host })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not allowed');
  });
});

describe('SSRF protection - IPv6 addresses', () => {
  it.each([
    '::1',
    '[::1]',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
  ])('blocks IPv6 address %s', async (host) => {
    const res = await POST(makeRequest(validBody({ host })));
    expect(res.status).toBe(400);
  });
});

describe('SSRF protection - cloud metadata endpoints', () => {
  it.each([
    'metadata.google.internal',
    'Metadata.Google.Internal',  // Case-insensitive
    'metadata.internal',
  ])('blocks cloud metadata host %s', async (host) => {
    const res = await POST(makeRequest(validBody({ host })));
    expect(res.status).toBe(400);
  });
});

describe('SSRF protection - localhost variants', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'LocalHost',  // Case-insensitive
  ])('blocks localhost variant %s', async (host) => {
    const res = await POST(makeRequest(validBody({ host })));
    expect(res.status).toBe(400);
  });
});

describe('SSRF protection - private IP ranges', () => {
  it.each([
    '10.0.0.0',
    '10.255.255.255',
    '172.16.0.0',
    '172.31.255.255',
    '192.168.0.0',
    '192.168.255.255',
  ])('blocks private IP %s', async (host) => {
    const res = await POST(makeRequest(validBody({ host })));
    expect(res.status).toBe(400);
  });

  it('allows non-private 172.15.x.x', async () => {
    // 172.15 is NOT in the private range — DNS resolution will fail
    // but should not be blocked by SSRF patterns
    const res = await POST(makeRequest(validBody({ host: '172.15.0.1' })));
    // Should not get 400 from SSRF check — may get 500 from DNS/connection
    expect(res.status).not.toBe(400);
  });

  it('allows non-private 172.32.x.x', async () => {
    const res = await POST(makeRequest(validBody({ host: '172.32.0.1' })));
    expect(res.status).not.toBe(400);
  });
});

describe('SSRF protection - port validation', () => {
  it('rejects port above 65535', async () => {
    const res = await POST(makeRequest(validBody({ host: '8.8.8.8', port: 65536 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('port');
  });

  it('rejects negative port', async () => {
    const res = await POST(makeRequest(validBody({ host: '8.8.8.8', port: -1 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('port');
  });
});
