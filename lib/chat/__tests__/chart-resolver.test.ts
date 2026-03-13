import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldForecast, shouldChart, resolveChart, resolveForecast } from '../chart-resolver';

// Mock dependencies
vi.mock('@/lib/forecasting', () => ({
  weightedAverageForecast: vi.fn(() => [
    { forecast: 35000, confidence: { lower: 30000, upper: 40000 }, method: 'Test', historicalMean: 33000, historicalStd: 3000 },
  ]),
  smartForecast: vi.fn((_data: unknown, steps: number = 3) => ({
    forecasts: Array.from({ length: steps }, (_, i) => ({
      forecast: 35000 + i * 500,
      confidence: { lower: 30000, upper: 40000 },
      method: 'weighted-average',
      historicalMean: 33000,
      historicalStd: 3000,
    })),
    method: 'weighted-average',
    fallback: true,
  })),
}));
vi.mock('@/lib/mcp-tools', () => ({
  getMonthlySummaries: vi.fn(() => [
    { month: '2024-01', revenue: 30000 },
    { month: '2024-02', revenue: 32000 },
    { month: '2024-03', revenue: 35000 },
    { month: '2024-04', revenue: 28000 },
    { month: '2024-05', revenue: 33000 },
    { month: '2024-06', revenue: 37000 },
    { month: '2024-07', revenue: 34000 },
    { month: '2024-08', revenue: 36000 },
    { month: '2024-09', revenue: 31000 },
    { month: '2024-10', revenue: 29000 },
    { month: '2024-11', revenue: 30000 },
    { month: '2024-12', revenue: 38000 },
  ]),
}));
vi.mock('@/lib/validation', () => ({
  validateChartConfig: vi.fn((config: unknown) => {
    if (!config || typeof config !== 'object') return { valid: false, cleaned: null, warnings: [] };
    return { valid: true, cleaned: config, warnings: [] };
  }),
}));
vi.mock('@/data/samples/chart_samples.json', () => ({
  default: {
    supplierPerformance: { type: 'bar', title: 'Supplier Performance', data: [{ name: 'A', value: 95 }] },
    monthlyTrend: { type: 'line', title: 'Monthly Trend', data: Array.from({ length: 12 }, (_, i) => ({ month: `2024-${String(i + 1).padStart(2, '0')}`, revenue: 30000 + i * 1000 })) },
    categoryBreakdown: { type: 'bar', title: 'Category Breakdown', data: [{ name: 'A', value: 100 }] },
    regionPie: { type: 'pie', title: 'Region Pie', data: [{ name: 'Asia', revenue: 100 }] },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('shouldForecast', () => {
  it('detects "forecast" keyword', () => {
    expect(shouldForecast('forecast next month spend')).toBe(true);
  });

  it('detects "predict" keyword', () => {
    expect(shouldForecast('predict revenue for next quarter')).toBe(true);
  });

  it('detects "sarima" keyword', () => {
    expect(shouldForecast('use sarima model')).toBe(true);
  });

  it('detects future year mentions', () => {
    expect(shouldForecast('what will revenue be in 2025')).toBe(true);
    expect(shouldForecast('spend projection for 2026')).toBe(true);
  });

  it('does not trigger for past years', () => {
    expect(shouldForecast('revenue in 2024')).toBe(false);
    expect(shouldForecast('what happened in 2023')).toBe(false);
  });

  it('does not trigger for normal queries', () => {
    expect(shouldForecast('what is total revenue')).toBe(false);
  });

  // Natural language forward-looking intent
  it('detects "what does Q4 look like?"', () => {
    expect(shouldForecast('what does Q4 look like?')).toBe(true);
  });

  it('detects "what should we expect for next quarter?"', () => {
    expect(shouldForecast('what should we expect for next quarter?')).toBe(true);
  });

  it('detects "where is spend headed for the rest of the year?"', () => {
    expect(shouldForecast('where is spend headed for the rest of the year?')).toBe(true);
  });

  it('detects "what\'s the Q4 outlook?"', () => {
    expect(shouldForecast("what's the Q4 outlook?")).toBe(true);
  });

  it('detects "going forward, what do you see?"', () => {
    expect(shouldForecast('going forward, what do you see?')).toBe(true);
  });

  it('detects compound query with forecast intent', () => {
    expect(shouldForecast('what drove the Q3 dip and what does Q4 look like?')).toBe(true);
  });

  it('does not trigger for historical quarter question', () => {
    expect(shouldForecast('what was Q3 spend?')).toBe(false);
  });

  it('does not trigger for comparative quarter question', () => {
    expect(shouldForecast('compare Q2 and Q3')).toBe(false);
  });
});

describe('shouldChart', () => {
  it('detects visualization keywords', () => {
    expect(shouldChart('show me a chart')).toBe(true);
    expect(shouldChart('graph the data')).toBe(true);
    expect(shouldChart('visualize revenue')).toBe(true);
    expect(shouldChart('plot by region')).toBe(true);
  });

  it('detects analytical keywords', () => {
    expect(shouldChart('which region is best')).toBe(true);
    expect(shouldChart('top 5 suppliers')).toBe(true);
    expect(shouldChart('rank products')).toBe(true);
  });

  it('detects data keywords', () => {
    expect(shouldChart('breakdown by product')).toBe(true);
    expect(shouldChart('by region')).toBe(true);
    expect(shouldChart('defect rate')).toBe(true);
  });

  it('does not trigger for simple questions', () => {
    expect(shouldChart('what is the total revenue')).toBe(false);
  });
});

describe('resolveChart', () => {
  const makeSource = (overrides: Record<string, unknown> = {}) => ({
    id: 'src-1',
    content: 'data',
    metadata: { type: 'category_summary', category: 'Bearings', revenue: 50000, orders: 100, ...overrides },
    score: 0.9,
  });

  it('falls back to categoryBreakdown when no specific chart matches', () => {
    // When shouldChart() triggers but no specific pattern matches,
    // the resolver falls through to the default category breakdown
    const result = resolveChart('show me something', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).title).toBe('Category Breakdown');
  });

  it('resolves category bar chart from sources', () => {
    const sources = [
      makeSource({ category: 'A', revenue: 100 }),
      makeSource({ id: 'src-2', category: 'B', revenue: 200 }),
      makeSource({ id: 'src-3', category: 'C', revenue: 300 }),
    ];
    const result = resolveChart('show product breakdown', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('bar');
  });

  it('resolves monthly trend from chartSamples', () => {
    const result = resolveChart('show monthly trend', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('line');
  });

  it('resolves supplier performance chart', () => {
    const result = resolveChart('compare supplier performance', []);
    expect(result).not.toBeNull();
  });

  it('resolves region pie chart', () => {
    const sources = [
      makeSource({ type: 'region_summary', region: 'Asia', revenue: 100, orders: 50 }),
      makeSource({ id: 'src-2', type: 'region_summary', region: 'Europe', revenue: 200, orders: 60 }),
      makeSource({ id: 'src-3', type: 'region_summary', region: 'NA', revenue: 150, orders: 40 }),
    ];
    const result = resolveChart('by region', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('pie');
  });

  it('resolves region bar chart when "plot" is in query', () => {
    const sources = [
      makeSource({ type: 'region_summary', region: 'Asia', revenue: 100, orders: 50 }),
      makeSource({ id: 'src-2', type: 'region_summary', region: 'Europe', revenue: 200, orders: 60 }),
      makeSource({ id: 'src-3', type: 'region_summary', region: 'NA', revenue: 150, orders: 40 }),
    ];
    const result = resolveChart('plot by region', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('bar');
  });

  it('resolves quarter comparison chart', () => {
    const result = resolveChart('compare q3 vs q4', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('line');
  });

  it('resolves single quarter analysis', () => {
    const result = resolveChart('what drove the change in q4', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('bar');
  });

  it('resolves OTD chart from supplier sources', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'supplier_summary', supplier_name: 'A', otd_rate: 95 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'supplier_summary', supplier_name: 'B', otd_rate: 90 }, score: 0.8 },
      { id: 's3', content: 'c', metadata: { type: 'supplier_summary', supplier_name: 'C', otd_rate: 85 }, score: 0.7 },
    ];
    const result = resolveChart('supplier on-time delivery', sources);
    expect(result).not.toBeNull();
  });

  it('resolves defect/quality chart', () => {
    const sources = [
      makeSource({ type: 'category_summary', category: 'A', defect_rate: 2.5 }),
      makeSource({ id: 'src-2', type: 'category_summary', category: 'B', defect_rate: 1.2 }),
      makeSource({ id: 'src-3', type: 'category_summary', category: 'C', defect_rate: 3.1 }),
    ];
    const result = resolveChart('defect rate by product', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).title).toContain('Defect Rate');
  });

  it('resolves lead time chart', () => {
    const sources = [
      makeSource({ type: 'region_summary', region: 'Asia', avg_lead_time: 15 }),
      makeSource({ id: 'src-2', type: 'region_summary', region: 'Europe', avg_lead_time: 12 }),
      makeSource({ id: 'src-3', type: 'region_summary', region: 'NA', avg_lead_time: 18 }),
    ];
    const result = resolveChart('lead time by region', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).title).toContain('Lead Time');
  });

  // Product-specific charts
  it('resolves product-by-region chart', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'product_region_summary', category: 'Industrial Bearings', region: 'Asia', revenue: 50000 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'product_region_summary', category: 'Industrial Bearings', region: 'Europe', revenue: 40000 }, score: 0.8 },
    ];
    const result = resolveChart('industrial bearings across region', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('bar');
    expect((result as Record<string, unknown>).title).toContain('Industrial Bearings');
  });

  it('resolves product monthly trend', () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      content: 'a',
      metadata: { type: 'product_monthly_summary', category: 'Industrial Bearings', month: `2024-0${i + 1}`, revenue: 5000 + i * 100 },
      score: 0.9,
    }));
    const result = resolveChart('industrial bearings monthly trend', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('line');
  });

  // Scatter chart tests — scatter keywords must not conflict with other resolvers
  it('resolves scatter chart from supplier cost/quality sources', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'supplier_summary', supplier_name: 'A', avg_cost: 1000, quality_score: 95 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'supplier_summary', supplier_name: 'B', avg_cost: 1500, quality_score: 88 }, score: 0.8 },
      { id: 's3', content: 'c', metadata: { type: 'supplier_summary', supplier_name: 'C', avg_cost: 800, quality_score: 92 }, score: 0.7 },
    ];
    // "scatter" alone without "supplier" or other competing keywords
    const result = resolveChart('scatter plot of data', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('scatter');
  });

  it('resolves scatter chart fallback from category data', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'category_summary', category: 'A', orders: 100, revenue: 50000 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'category_summary', category: 'B', orders: 200, revenue: 80000 }, score: 0.8 },
      { id: 's3', content: 'c', metadata: { type: 'category_summary', category: 'C', orders: 150, revenue: 60000 }, score: 0.7 },
    ];
    // "correlation" triggers scatter path — avoid conflicting keywords
    const result = resolveChart('show correlation analysis', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('scatter');
  });

  // Waterfall chart tests
  it('resolves waterfall chart for "waterfall" keyword', () => {
    const result = resolveChart('show waterfall chart', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('waterfall');
  });

  it('"change by month" matches trend before waterfall (keyword priority)', () => {
    // "month" hits the trend resolver first — this tests the keyword priority
    const result = resolveChart('show the change by month', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('line');
  });

  // Sample data flagging
  it('marks sample data fallbacks with sampleData: true', () => {
    const result = resolveChart('show monthly trend', []);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).sampleData).toBe(true);
  });

  it('does NOT mark RAG-sourced charts with sampleData', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'category_summary', category: 'A', revenue: 100, orders: 10 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'category_summary', category: 'B', revenue: 200, orders: 20 }, score: 0.8 },
      { id: 's3', content: 'c', metadata: { type: 'category_summary', category: 'C', revenue: 300, orders: 30 }, score: 0.7 },
    ];
    const result = resolveChart('show product breakdown', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).sampleData).toBeUndefined();
  });

  // Region-specific chart
  it('resolves named region monthly trend', () => {
    const sources = [
      { id: 's1', content: 'a', metadata: { type: 'region_monthly_summary', region: 'North America', month: '2024-01', revenue: 1000 }, score: 0.9 },
      { id: 's2', content: 'b', metadata: { type: 'region_monthly_summary', region: 'North America', month: '2024-02', revenue: 1100 }, score: 0.8 },
      { id: 's3', content: 'c', metadata: { type: 'region_monthly_summary', region: 'North America', month: '2024-03', revenue: 1200 }, score: 0.7 },
    ];
    const result = resolveChart('show north america monthly trend', sources);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).type).toBe('line');
    expect((result as Record<string, unknown>).title).toContain('North America');
  });
});

describe('resolveForecast', () => {
  it('returns forecast result for "forecast" query', async () => {
    const result = await resolveForecast('forecast next month');
    expect(result).not.toBeNull();
    expect(result!.formattedText).toContain('Forecast');
    expect(result!.chartConfig).not.toBeNull();
  });

  it('returns forecast with chart config', async () => {
    const result = await resolveForecast('forecast for 2025');
    expect(result).not.toBeNull();
    expect(result!.chartConfig).toHaveProperty('type');
    expect(result!.chartConfig).toHaveProperty('data');
  });

  it('handles multi-month forecast', async () => {
    const { smartForecast } = await import('@/lib/forecasting');
    (smartForecast as ReturnType<typeof vi.fn>).mockReturnValue({
      forecasts: Array.from({ length: 6 }, (_, i) => ({
        forecast: 35000 + i * 500,
        confidence: { lower: 30000, upper: 40000 },
        method: 'weighted-average',
        historicalMean: 33000,
        historicalStd: 3000,
      })),
      method: 'weighted-average',
      fallback: true,
    });

    const result = await resolveForecast('forecast next six months');
    expect(result).not.toBeNull();
    expect(result!.formattedText).toContain('Summary');
  });

  it('returns null when no monthly summaries available', async () => {
    const { getMonthlySummaries } = await import('@/lib/mcp-tools');
    (getMonthlySummaries as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await resolveForecast('forecast next month');
    expect(result).toBeNull();
  });

  it('returns null on forecast error', async () => {
    const { smartForecast } = await import('@/lib/forecasting');
    (smartForecast as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Test error');
    });

    const result = await resolveForecast('forecast next month');
    expect(result).toBeNull();
  });
});
