import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing route
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
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
  initializeRAG: vi.fn(async () => ({ success: true, message: 'OK' })),
  semanticSearch: vi.fn(async () => []),
  getMonthlySummaries: vi.fn(async () => []),
}));
vi.mock('@/lib/embeddings', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
}));
vi.mock('@/lib/cache', () => ({
  searchCache: { get: vi.fn(), set: vi.fn() },
  llmCache: { get: vi.fn(), set: vi.fn() },
  cacheKey: vi.fn((...args: string[]) => args.join('-')),
}));
vi.mock('@/lib/validation', () => ({
  validateQuery: vi.fn((q: string) => ({ valid: q.length > 0, sanitized: q, warnings: q.length === 0 ? ['empty'] : [] })),
  validateSources: vi.fn((s: unknown[]) => ({ valid: s, warnings: [] })),
  validateChartConfig: vi.fn(() => ({ valid: false, cleaned: null, warnings: [] })),
  crossCheckTotals: vi.fn(() => ({ passed: true, discrepancies: [] })),
}));
vi.mock('@/lib/db/supply-chain', () => ({
  isDBAvailable: vi.fn(() => false),
  getKnownTotals: vi.fn(async () => ({})),
}));
vi.mock('@/lib/db/messages', () => ({
  saveMessage: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/sessions', () => ({
  getSession: vi.fn(async () => null),
}));
vi.mock('@/lib/db/audit', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/data/embedder', () => ({
  getDatasetStore: vi.fn(),
  getDatasetOwner: vi.fn(),
}));
vi.mock('@/lib/forecasting', () => ({
  weightedAverageForecast: vi.fn(() => []),
  formatForecastResult: vi.fn(() => ''),
  generateForecastChart: vi.fn(() => ({})),
}));
vi.mock('@/data/samples/chart_samples.json', () => ({ default: [] }));
vi.mock('@/data/samples/dataset_overview.json', () => ({ default: {} }));

import { POST } from '../route';
import { auth } from '@/lib/auth';
import { isEnvironmentValid } from '@/lib/env';

const mockedAuth = auth as ReturnType<typeof vi.fn>;
const mockedIsEnvValid = isEnvironmentValid as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(content = 'What is total revenue?') {
  return {
    messages: [
      { id: '1', role: 'user', content, timestamp: '2026-01-01T00:00:00Z' },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Test' } });
  mockedIsEnvValid.mockReturnValue(true);
});

describe('POST /api/chat', () => {
  it('returns 503 when environment is invalid', async () => {
    mockedIsEnvValid.mockReturnValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(503);
  });

  it('returns 400 for invalid request body', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing messages array', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty messages array', async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when last message is not from user', async () => {
    const res = await POST(makeRequest({
      messages: [{ id: '1', role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:00Z' }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for too many messages', async () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'msg',
      timestamp: '2026-01-01T00:00:00Z',
    }));
    const res = await POST(makeRequest({ messages }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for message content too long', async () => {
    const res = await POST(makeRequest({
      messages: [{ id: '1', role: 'user', content: 'x'.repeat(10001), timestamp: '2026-01-01T00:00:00Z' }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid sessionId', async () => {
    const res = await POST(makeRequest({
      ...validBody(),
      sessionId: 'x'.repeat(129),
    }));
    expect(res.status).toBe(400);
  });

  it('accepts valid request format', async () => {
    // This will proceed past validation. It may fail later due to LLM mock
    // but it should NOT return 400 or 401
    const res = await POST(makeRequest(validBody()));
    expect([400, 401, 503]).not.toContain(res.status);
  });
});
