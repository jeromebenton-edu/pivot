import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('@/lib/data/csv-parser', () => ({
  parseCSV: vi.fn(),
}));
vi.mock('@/lib/data/excel-parser', () => ({
  parseExcel: vi.fn(),
}));
vi.mock('@/lib/data/chunker', () => ({
  chunkData: vi.fn(() => [{ content: 'chunk', metadata: {} }]),
}));
vi.mock('@/lib/data/embedder', () => ({
  embedAndStoreChunks: vi.fn(async () => ({ success: true, chunksStored: 1 })),
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
import { parseCSV } from '@/lib/data/csv-parser';

const mockedAuth = auth as ReturnType<typeof vi.fn>;
const mockedParseCSV = parseCSV as ReturnType<typeof vi.fn>;

// Helper to create a mock NextRequest with a properly named File
function makeUploadRequest(fileName: string, content: string, previewOnly = false): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
  });

  // Override formData() to return a proper FormData with named file
  const mockFile = {
    name: fileName,
    size: content.length,
    type: 'text/csv',
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  };

  const mockFormData = {
    get: (key: string) => {
      if (key === 'file') return mockFile;
      if (key === 'preview') return previewOnly ? 'true' : null;
      return null;
    },
  };

  vi.spyOn(req, 'formData').mockResolvedValue(mockFormData as unknown as FormData);
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Test' } });
  mockedParseCSV.mockReturnValue({
    rows: [{ name: 'test', value: 100 }],
    columns: [
      { name: 'name', type: 'string', sampleValues: ['test'] },
      { name: 'value', type: 'number', sampleValues: [100] },
    ],
    rowCount: 1,
  });
});

describe('POST /api/upload', () => {
  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeUploadRequest('test.csv', 'data'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/upload', { method: 'POST' });
    const mockFormData = { get: () => null };
    vi.spyOn(req, 'formData').mockResolvedValue(mockFormData as unknown as FormData);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No file');
  });

  it('returns 400 for unsupported file types', async () => {
    const res = await POST(makeUploadRequest('test.pdf', 'content'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unsupported');
  });

  it('returns 400 when file contains no data', async () => {
    mockedParseCSV.mockReturnValue({ rows: [], columns: [], rowCount: 0 });
    const res = await POST(makeUploadRequest('empty.csv', ''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('no data');
  });

  it('returns preview data when preview=true', async () => {
    const res = await POST(makeUploadRequest('test.csv', 'name,value\ntest,100', true));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns).toBeDefined();
    expect(body.rowCount).toBe(1);
    expect(body.datasetId).toBeUndefined();
  });

  it('returns dataset info on successful upload', async () => {
    const res = await POST(makeUploadRequest('test.csv', 'name,value\ntest,100'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.datasetId).toBeDefined();
    expect(body.datasetId).toMatch(/^upload-/);
    expect(body.datasetName).toBe('test');
    expect(body.rowCount).toBe(1);
  });

  it('returns 400 for too many rows', async () => {
    mockedParseCSV.mockReturnValue({
      rows: Array.from({ length: 100001 }, () => ({ v: 1 })),
      columns: [{ name: 'v', type: 'number', sampleValues: [1] }],
      rowCount: 100001,
    });
    const res = await POST(makeUploadRequest('big.csv', 'data'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('too many rows');
  });

  it('returns 413 for files exceeding size limit', async () => {
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { 'content-length': String(60 * 1024 * 1024) }, // 60MB
    });
    const mockFile = {
      name: 'huge.csv',
      size: 60 * 1024 * 1024,
      type: 'text/csv',
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const mockFormData = {
      get: (key: string) => key === 'file' ? mockFile : null,
    };
    vi.spyOn(req, 'formData').mockResolvedValue(mockFormData as unknown as FormData);
    const res = await POST(req);
    expect(res.status).toBe(413);
  });
});
