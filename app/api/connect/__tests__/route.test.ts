import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
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

describe('POST /api/connect', () => {
  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-PostgreSQL type', async () => {
    const res = await POST(makeRequest(validBody({ type: 'mysql' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('PostgreSQL');
  });

  it('returns 400 for invalid action', async () => {
    const res = await POST(makeRequest(validBody({ action: 'drop' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing host', async () => {
    const res = await POST(makeRequest(validBody({ host: '' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid database name', async () => {
    const res = await POST(makeRequest(validBody({ database: '' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid username', async () => {
    const res = await POST(makeRequest(validBody({ username: '' })));
    expect(res.status).toBe(400);
  });

  // SSRF protection tests
  it('blocks localhost', async () => {
    const res = await POST(makeRequest(validBody({ host: 'localhost' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not allowed');
  });

  it('blocks 127.0.0.1', async () => {
    const res = await POST(makeRequest(validBody({ host: '127.0.0.1' })));
    expect(res.status).toBe(400);
  });

  it('blocks 10.x.x.x private IPs', async () => {
    const res = await POST(makeRequest(validBody({ host: '10.0.0.1' })));
    expect(res.status).toBe(400);
  });

  it('blocks 172.16-31.x.x private IPs', async () => {
    const res = await POST(makeRequest(validBody({ host: '172.16.0.1' })));
    expect(res.status).toBe(400);
  });

  it('blocks 192.168.x.x private IPs', async () => {
    const res = await POST(makeRequest(validBody({ host: '192.168.1.1' })));
    expect(res.status).toBe(400);
  });

  it('blocks AWS metadata IP 169.254.x.x', async () => {
    const res = await POST(makeRequest(validBody({ host: '169.254.169.254' })));
    expect(res.status).toBe(400);
  });

  it('blocks 0.0.0.0', async () => {
    const res = await POST(makeRequest(validBody({ host: '0.0.0.0' })));
    expect(res.status).toBe(400);
  });

  it('blocks IPv6 loopback ::1', async () => {
    const res = await POST(makeRequest(validBody({ host: '::1' })));
    expect(res.status).toBe(400);
  });

  it('blocks metadata.google.internal', async () => {
    const res = await POST(makeRequest(validBody({ host: 'metadata.google.internal' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for import without table name', async () => {
    const res = await POST(makeRequest(validBody({ action: 'import' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Table name');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost:3000/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
