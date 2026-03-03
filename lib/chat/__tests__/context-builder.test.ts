import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isOverviewQuery, OVERVIEW_PHRASES, buildContext } from '../context-builder';

// Mock all external dependencies
vi.mock('@/lib/mcp-tools', () => ({
  semanticSearch: vi.fn(async () => ({ success: false, results: [] })),
}));
vi.mock('@/lib/data/embedder', () => ({
  getDatasetStore: vi.fn(() => null),
}));
vi.mock('@/lib/embeddings', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
}));
vi.mock('@/lib/cache', () => ({
  searchCache: { get: vi.fn(() => null), set: vi.fn() },
  cacheKey: vi.fn((...args: string[]) => args.join('-')),
}));
vi.mock('@/lib/validation', () => ({
  validateSources: vi.fn((s: unknown[]) => ({ valid: s, warnings: [] })),
  crossCheckTotals: vi.fn(() => ({ passed: true, discrepancies: [] })),
}));
vi.mock('@/lib/db/supply-chain', () => ({
  isDBAvailable: vi.fn(() => false),
  getKnownTotals: vi.fn(async () => ({})),
}));
vi.mock('@/data/samples/dataset_overview.json', () => ({
  default: {
    overview: { title: 'Test', description: 'Test data', timeRange: '2024', recordCount: 100 },
    metrics: { totalProcurementSpend: '$100k', totalPurchaseOrders: 50, avgPOValue: '$2k', onTimeDeliveryRate: '95%', avgLeadTimeDays: 10 },
    dimensions: { regions: [{ name: 'Asia', revenue: '$50k', orders: 25 }], categories: [{ name: 'Bearings', revenue: '$30k', orders: 15 }] },
    temporalPatterns: { highestSpendMonth: { month: 'March', revenue: '$15k' }, lowestSpendMonth: { month: 'June', revenue: '$5k' }, trend: 'stable' },
  },
}));

import { semanticSearch } from '@/lib/mcp-tools';
import { searchCache } from '@/lib/cache';
import { getDatasetStore } from '@/lib/data/embedder';
import { isDBAvailable } from '@/lib/db/supply-chain';

const mockedSemanticSearch = semanticSearch as ReturnType<typeof vi.fn>;
const mockedCacheGet = (searchCache.get as ReturnType<typeof vi.fn>);
const mockedGetDatasetStore = getDatasetStore as ReturnType<typeof vi.fn>;
const mockedIsDBAvailable = isDBAvailable as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedCacheGet.mockReturnValue(null);
  mockedGetDatasetStore.mockReturnValue(null);
  mockedIsDBAvailable.mockReturnValue(false);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('isOverviewQuery', () => {
  it('detects "describe the dataset"', () => {
    expect(isOverviewQuery('Please describe the dataset')).toBe(true);
  });

  it('detects "dataset overview"', () => {
    expect(isOverviewQuery('Give me a dataset overview')).toBe(true);
  });

  it('does not match normal queries', () => {
    expect(isOverviewQuery('What is the total revenue?')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOverviewQuery('DESCRIBE THE DATASET please')).toBe(true);
  });

  it('exports all overview phrases', () => {
    expect(OVERVIEW_PHRASES.length).toBeGreaterThan(10);
  });
});

describe('buildContext', () => {
  it('returns empty context when no sources found', async () => {
    const result = await buildContext('some query', undefined, 'user-1', false);
    expect(result.context).toBe('');
    expect(result.sources).toHaveLength(0);
  });

  it('returns cached results when available', async () => {
    const cachedData = {
      context: 'cached context',
      results: [{ id: 'src-1', content: 'data', metadata: {}, score: 0.9 }],
    };
    mockedCacheGet.mockReturnValue(cachedData);

    const result = await buildContext('some query', undefined, 'user-1', true);
    expect(result.context).toBe('cached context');
    expect(result.sources).toHaveLength(1);
  });

  it('performs semantic search when RAG is initialized', async () => {
    mockedSemanticSearch.mockResolvedValue({
      success: true,
      results: [
        { id: 'r1', content: 'result 1', metadata: { type: 'test' }, relevance_score: 0.9 },
      ],
    });

    const result = await buildContext('total revenue', undefined, 'user-1', true);
    expect(result.sources).toHaveLength(1);
    expect(result.context).toContain('result 1');
    expect(mockedSemanticSearch).toHaveBeenCalled();
  });

  it('skips semantic search when RAG is not initialized', async () => {
    await buildContext('total revenue', undefined, 'user-1', false);
    expect(mockedSemanticSearch).not.toHaveBeenCalled();
  });

  it('searches uploaded dataset when datasetId is provided', async () => {
    const mockStore = {
      query: vi.fn(async () => ({
        documents: [['doc1', 'doc2']],
        ids: [['id1', 'id2']],
        metadatas: [[{}, {}]],
        distances: [[0.1, 0.2]],
      })),
    };
    mockedGetDatasetStore.mockReturnValue(mockStore);

    const result = await buildContext('query', 'upload-123', 'user-1', false);
    expect(result.sources).toHaveLength(2);
    expect(result.context).toContain('uploaded dataset');
  });

  it('deduplicates sources by ID', async () => {
    mockedSemanticSearch.mockResolvedValue({
      success: true,
      results: [
        { id: 'dup-1', content: 'data', metadata: {}, relevance_score: 0.9 },
        { id: 'dup-1', content: 'data', metadata: {}, relevance_score: 0.8 }, // duplicate
        { id: 'unique', content: 'other', metadata: {}, relevance_score: 0.7 },
      ],
    });

    const result = await buildContext('query', undefined, 'user-1', true);
    expect(result.sources).toHaveLength(2);
  });

  it('caps sources at MAX_SOURCES (25)', async () => {
    const results = Array.from({ length: 30 }, (_, i) => ({
      id: `src-${i}`, content: 'x', metadata: {}, relevance_score: 0.5,
    }));
    mockedSemanticSearch.mockResolvedValue({ success: true, results });

    const result = await buildContext('query', undefined, 'user-1', true);
    expect(result.sources.length).toBeLessThanOrEqual(25);
  });

  it('uses enhanced query for category keywords', async () => {
    mockedSemanticSearch.mockResolvedValue({ success: true, results: [] });
    await buildContext('show product line breakdown', undefined, 'user-1', true);

    const call = mockedSemanticSearch.mock.calls[0][0];
    expect(call.query).toContain('product line summary');
    expect(call.limit).toBeGreaterThan(5);
  });

  it('uses enhanced query for monthly keywords', async () => {
    mockedSemanticSearch.mockResolvedValue({ success: true, results: [] });
    await buildContext('show january revenue', undefined, 'user-1', true);

    const call = mockedSemanticSearch.mock.calls[0][0];
    expect(call.query).toContain('monthly summary');
  });

  it('appends SQL verification for precision queries when DB is available', async () => {
    mockedIsDBAvailable.mockReturnValue(true);
    const { getKnownTotals } = await import('@/lib/db/supply-chain');
    (getKnownTotals as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_spend: 100000,
      total_events: 500,
    });

    const result = await buildContext('what is the total spend', undefined, 'user-1', false);
    expect(result.context).toContain('Verified SQL Result');
    expect(result.context).toContain('100,000');
  });
});
