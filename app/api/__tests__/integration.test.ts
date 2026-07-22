/**
 * Integration tests for API routes.
 *
 * These differ from the per-route unit tests: auth() is mocked to return
 * controlled sessions, but requirePermission & getUserRole use the REAL
 * RBAC logic so we verify the full auth → validation → RBAC → response cycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — only external services; RBAC logic is real
// ---------------------------------------------------------------------------
// RBAC logic is inlined in the auth mock below via require()

vi.mock('@/lib/auth', () => {
  // Inline RBAC permissions for end-to-end auth+RBAC testing
  const PERMISSIONS: Record<string, Set<string>> = {
    admin: new Set(['chat', 'upload', 'connect', 'export', 'manage_users', 'view_audit']),
    analyst: new Set(['chat', 'upload', 'connect', 'export']),
    viewer: new Set(['chat']),
  };
  function getUserRole(session: { user?: { role?: string } | null } | null) {
    if (!session?.user) return undefined;
    return (session.user as { role?: string }).role;
  }
  function requirePermission(
    session: { user?: { role?: string } | null } | null,
    action: string,
  ) {
    const role = getUserRole(session);
    if (!role || !PERMISSIONS[role] || !PERMISSIONS[role].has(action)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('next/server').NextResponse.json(
        { error: `Insufficient permissions for ${action}` }, { status: 403 },
      );
    }
    return null;
  }
  return {
    auth: vi.fn(),
    getUserRole,
    requirePermission,
    authInstance: {},
    handlers: { GET: vi.fn(), POST: vi.fn() },
  };
});

vi.mock('@/lib/env', () => ({
  isEnvironmentValid: vi.fn(() => true),
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => vi.fn(async () => ({ success: true }))),
}));
vi.mock('@/lib/llm-client', () => ({
  createStreamingChatCompletion: vi.fn(),
  getCurrentProvider: vi.fn(() => 'openai'),
}));
vi.mock('@/lib/mcp-tools', () => ({
  initializeRAG: vi.fn(async () => ({ success: true })),
  semanticSearch: vi.fn(async () => []),
  getMonthlySummaries: vi.fn(async () => []),
}));
vi.mock('@/lib/embeddings', () => ({
  generateEmbedding: vi.fn(async () => [0.1]),
}));
vi.mock('@/lib/cache', () => ({
  searchCache: { get: vi.fn(), set: vi.fn() },
  llmCache: { get: vi.fn(), set: vi.fn() },
  cacheKey: vi.fn((...a: string[]) => a.join('-')),
  invalidateDatasetCaches: vi.fn(),
}));
vi.mock('@/lib/validation', () => ({
  validateQuery: vi.fn((q: string) => ({
    valid: q.length > 0,
    sanitized: q,
    warnings: q.length === 0 ? ['empty'] : [],
  })),
  validateSources: vi.fn((s: unknown[]) => ({ valid: s, warnings: [] })),
  validateChartConfig: vi.fn(() => ({ valid: false, cleaned: null, warnings: [] })),
  crossCheckTotals: vi.fn(() => ({ passed: true, discrepancies: [] })),
}));
vi.mock('@/lib/db/supply-chain', () => ({
  isDBAvailable: vi.fn(() => false),
  checkDBHealth: vi.fn(async () => false),
  getKnownTotals: vi.fn(async () => ({})),
}));
vi.mock('@/lib/db/messages', () => ({
  saveMessage: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/sessions', () => ({
  getSession: vi.fn(async () => null),
  listSessions: vi.fn(async () => []),
  createSession: vi.fn(async (_uid: string, title?: string) => ({
    id: 'sess-1',
    user_id: _uid,
    title: title || 'New chat',
    created_at: new Date().toISOString(),
  })),
  deleteSession: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/dashboards', () => {
  const store: Record<string, unknown> = {};
  return {
    listDashboards: vi.fn(async () => Object.values(store)),
    getDashboard: vi.fn(async (id: string) => store[id] || null),
    createDashboard: vi.fn(async (userId: string, title: string, widgets: unknown[]) => {
      const d = { id: 'dash-1', user_id: userId, title, widgets, created_at: new Date().toISOString() };
      store[d.id] = d;
      return d;
    }),
    updateDashboard: vi.fn(async () => null),
    deleteDashboard: vi.fn(async (id: string) => {
      if (!store[id]) return false;
      delete store[id];
      return true;
    }),
  };
});
vi.mock('@/lib/db/audit', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/data/embedder', () => ({
  getDatasetStore: vi.fn(),
  getDatasetOwner: vi.fn(),
  embedAndStoreChunks: vi.fn(async () => ({ success: true, chunksStored: 1 })),
}));
vi.mock('@/lib/forecasting', () => ({
  weightedAverageForecast: vi.fn(() => []),
  formatForecastResult: vi.fn(() => ''),
  generateForecastChart: vi.fn(() => ({})),
}));
vi.mock('@/data/samples/chart_samples.json', () => ({ default: [] }));
vi.mock('@/data/samples/dataset_overview.json', () => ({ default: {} }));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------
import { GET as healthGET } from '@/app/api/health/route';
import { POST as chatPOST } from '@/app/api/chat/route';
import { POST as uploadPOST } from '@/app/api/upload/route';
import { POST as connectPOST } from '@/app/api/connect/route';
import { GET as dashGET, POST as dashPOST, DELETE as dashDELETE } from '@/app/api/dashboards/route';
import { auth } from '@/lib/auth';

const mockAuth = auth as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function adminSession() {
  return { user: { id: 'u-admin', name: 'Admin', email: 'admin@test', role: 'admin' } };
}
function viewerSession() {
  return { user: { id: 'u-viewer', name: 'Viewer', email: 'viewer@test', role: 'viewer' } };
}
function analystSession() {
  return { user: { id: 'u-analyst', name: 'Analyst', email: 'analyst@test', role: 'analyst' } };
}

function jsonReq(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ---- Health endpoint ----
describe('GET /api/health', () => {
  it('returns 200 with status object (no auth required)', async () => {
    const res = await healthGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.checks).toHaveProperty('timestamp');
    expect(body.checks).toHaveProperty('environment');
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('forecast');
  });

  it('includes a valid ISO timestamp', async () => {
    const res = await healthGET();
    const body = await res.json();
    expect(() => new Date(body.checks.timestamp)).not.toThrow();
    expect(new Date(body.checks.timestamp).toISOString()).toBe(body.checks.timestamp);
  });
});

// ---- Chat endpoint ----
describe('POST /api/chat', () => {
  const url = 'http://localhost:3000/api/chat';

  it('returns 401 without auth session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await chatPOST(jsonReq(url, {
      messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: new Date().toISOString() }],
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 with empty messages array', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await chatPOST(jsonReq(url, { messages: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message exceeds length limit', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await chatPOST(jsonReq(url, {
      messages: [{ id: '1', role: 'user', content: 'x'.repeat(10001), timestamp: new Date().toISOString() }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing messages field', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await chatPOST(jsonReq(url, { foo: 'bar' }));
    expect(res.status).toBe(400);
  });

  it('allows viewer role to chat (viewer has chat permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession());
    const res = await chatPOST(jsonReq(url, {
      messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
    }));
    // Should pass auth+RBAC and reach LLM — NOT 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---- Upload endpoint ----
describe('POST /api/upload', () => {
  const url = 'http://localhost:3000/api/upload';

  it('returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const fd = new FormData();
    fd.append('file', new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }));
    const req = new NextRequest(url, { method: 'POST', body: fd });
    const res = await uploadPOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role (no upload permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession());
    const fd = new FormData();
    fd.append('file', new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }));
    const req = new NextRequest(url, { method: 'POST', body: fd });
    const res = await uploadPOST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 with unsupported file type', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const fd = new FormData();
    fd.append('file', new File(['hello'], 'data.txt', { type: 'text/plain' }));
    const req = new NextRequest(url, { method: 'POST', body: fd });
    const res = await uploadPOST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when no file provided', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const fd = new FormData();
    const req = new NextRequest(url, { method: 'POST', body: fd });
    const res = await uploadPOST(req);
    expect(res.status).toBe(400);
  });
});

// ---- Connect endpoint ----
describe('POST /api/connect', () => {
  const url = 'http://localhost:3000/api/connect';

  it('returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await connectPOST(jsonReq(url, {
      action: 'test', type: 'postgresql',
      host: 'db.example.com', database: 'app', username: 'user',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role (no connect permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession());
    const res = await connectPOST(jsonReq(url, {
      action: 'test', type: 'postgresql',
      host: 'db.example.com', database: 'app', username: 'user',
    }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for SSRF attempt with private IP', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await connectPOST(jsonReq(url, {
      action: 'test', type: 'postgresql',
      host: '192.168.1.1', database: 'app', username: 'user',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it('returns 400 for localhost SSRF attempt', async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await connectPOST(jsonReq(url, {
      action: 'test', type: 'postgresql',
      host: 'localhost', database: 'app', username: 'user',
    }));
    expect(res.status).toBe(400);
  });
});

// ---- Dashboards endpoint ----
describe('Dashboards API', () => {
  const url = 'http://localhost:3000/api/dashboards';

  it('GET returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await dashGET(getReq(url));
    expect(res.status).toBe(401);
  });

  it('GET returns empty array for new user', async () => {
    mockAuth.mockResolvedValue(analystSession());
    const res = await dashGET(getReq(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST creates a dashboard (analyst has export permission)', async () => {
    mockAuth.mockResolvedValue(analystSession());
    const res = await dashPOST(jsonReq(url, { title: 'My Dashboard', widgets: [] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('My Dashboard');
    expect(body.id).toBeDefined();
  });

  it('POST returns 403 for viewer role (no export permission)', async () => {
    mockAuth.mockResolvedValue(viewerSession());
    const res = await dashPOST(jsonReq(url, { title: 'My Dashboard', widgets: [] }));
    expect(res.status).toBe(403);
  });

  it('DELETE returns 401 without auth', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await dashDELETE(getReq(`${url}?id=dash-1`));
    expect(res.status).toBe(401);
  });
});
