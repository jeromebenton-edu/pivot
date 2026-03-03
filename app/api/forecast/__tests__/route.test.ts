import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => vi.fn(async () => ({ success: true }))),
}));
vi.mock('@/lib/mcp-tools', () => ({
  getMonthlySummaries: vi.fn(() => [
    { month: '2024-01', revenue: 3738900 },
    { month: '2024-02', revenue: 4100000 },
    { month: '2024-03', revenue: 4200000 },
    { month: '2024-04', revenue: 4350000 },
    { month: '2024-05', revenue: 4500000 },
    { month: '2024-06', revenue: 4600000 },
  ]),
}));
vi.mock('@/lib/forecasting', () => ({
  smartForecast: vi.fn(async (_data: unknown, steps: number) => ({
    forecasts: Array.from({ length: steps }, (_, i) => ({
      forecast: 4700000 + i * 50000,
      confidence: { lower: 4200000, upper: 5200000 },
      method: 'weighted-average',
      historicalMean: 4248150,
      historicalStd: 280000,
    })),
    method: 'weighted-average',
    fallback: true,
  })),
}));
vi.mock('@/data/samples/data_chunks.json', () => ({ default: [] }));

import { POST, GET } from '../route';
import { auth } from '@/lib/auth';

const mockedAuth = auth as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/forecast', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/forecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'u1', role: 'analyst' } });
  });

  it('returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ targetMonth: '2025-01' }));
    expect(res.status).toBe(401);
  });

  it('returns forecast for valid request', async () => {
    const res = await POST(makeRequest({ targetMonth: '2025-01', steps: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.forecast).toHaveLength(1);
    expect(body.method).toBe('weighted-average');
  });

  it('returns 400 for invalid targetMonth format', async () => {
    const res = await POST(makeRequest({ targetMonth: 'bad-date' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('YYYY-MM');
  });

  it('returns 400 for targetMonth in historical range', async () => {
    const res = await POST(makeRequest({ targetMonth: '2024-03' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('after historical data');
  });

  it('clamps steps to MAX_FORECAST_STEPS', async () => {
    const res = await POST(makeRequest({ targetMonth: '2025-01', steps: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Steps clamped to 24
    expect(body.forecast.length).toBeLessThanOrEqual(24);
  });

  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/forecast', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('supports multi-month forecast via months array', async () => {
    const res = await POST(makeRequest({
      targetMonth: '2025-01',
      months: ['2025-01', '2025-02', '2025-03'],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.forecast).toHaveLength(3);
  });

  it('returns 400 for invalid months array entries', async () => {
    const res = await POST(makeRequest({
      targetMonth: '2025-01',
      months: ['2025-01', 'bad'],
    }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/forecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'u1', role: 'analyst' } });
  });

  it('returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns available months', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availableMonths).toBeDefined();
    expect(body.totalMonths).toBeGreaterThan(0);
  });
});
