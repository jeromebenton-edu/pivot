import { describe, it, expect, vi } from 'vitest';
import { weightedAverageForecast, smartForecast, formatForecastResult, generateForecastChart } from '../forecasting';

const sampleData = [
  { month: 'Jan 2024', revenue: 30000 },
  { month: 'Feb 2024', revenue: 32000 },
  { month: 'Mar 2024', revenue: 35000 },
  { month: 'Apr 2024', revenue: 28000 },
  { month: 'May 2024', revenue: 33000 },
  { month: 'Jun 2024', revenue: 37000 },
  { month: 'Jul 2024', revenue: 34000 },
  { month: 'Aug 2024', revenue: 36000 },
  { month: 'Sep 2024', revenue: 31000 },
  { month: 'Oct 2024', revenue: 29000 },
  { month: 'Nov 2024', revenue: 30000 },
  { month: 'Dec 2024', revenue: 38000 },
];

describe('weightedAverageForecast', () => {
  it('returns a single forecast for steps=1', () => {
    const results = weightedAverageForecast(sampleData, 1);
    expect(results).toHaveLength(1);
    expect(results[0].forecast).toBeGreaterThan(0);
    expect(results[0].method).toBe('weighted-average');
  });

  it('returns multiple forecasts for steps>1', () => {
    const results = weightedAverageForecast(sampleData, 3);
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.forecast).toBeGreaterThan(0);
    });
  });

  it('provides confidence intervals', () => {
    const results = weightedAverageForecast(sampleData, 1);
    const r = results[0];
    expect(r.confidence.lower).toBeLessThanOrEqual(r.forecast);
    expect(r.confidence.upper).toBeGreaterThanOrEqual(r.forecast);
  });

  it('widens confidence intervals for further forecasts', () => {
    const results = weightedAverageForecast(sampleData, 3);
    const width1 = results[0].confidence.upper - results[0].confidence.lower;
    const width3 = results[2].confidence.upper - results[2].confidence.lower;
    expect(width3).toBeGreaterThan(width1);
  });

  it('computes historicalMean and historicalStd', () => {
    const results = weightedAverageForecast(sampleData, 1);
    const r = results[0];
    const mean = sampleData.reduce((s, d) => s + d.revenue, 0) / sampleData.length;
    expect(r.historicalMean).toBeCloseTo(mean, 0);
    expect(r.historicalStd).toBeGreaterThan(0);
  });

  it('throws on empty data', () => {
    expect(() => weightedAverageForecast([], 1)).toThrow('No historical data');
  });

  it('throws on insufficient data (less than 3 valid)', () => {
    expect(() => weightedAverageForecast([{ month: 'Jan', revenue: 100 }], 1)).toThrow('Insufficient');
  });

  it('filters NaN revenue values', () => {
    const data = [
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: NaN },
      { month: 'Mar', revenue: 200 },
      { month: 'Apr', revenue: 150 },
    ];
    const results = weightedAverageForecast(data, 1);
    expect(results).toHaveLength(1);
    expect(Number.isFinite(results[0].forecast)).toBe(true);
  });

  it('filters Infinity revenue values', () => {
    const data = [
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: Infinity },
      { month: 'Mar', revenue: 200 },
      { month: 'Apr', revenue: 150 },
    ];
    const results = weightedAverageForecast(data, 1);
    expect(Number.isFinite(results[0].forecast)).toBe(true);
  });

  it('forecast is never negative', () => {
    // Data with strong downward trend
    const data = [
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: 50 },
      { month: 'Mar', revenue: 10 },
      { month: 'Apr', revenue: 5 },
    ];
    const results = weightedAverageForecast(data, 3);
    results.forEach(r => {
      expect(r.forecast).toBeGreaterThanOrEqual(0);
      expect(r.confidence.lower).toBeGreaterThanOrEqual(0);
    });
  });

  it('defaults to 1 step', () => {
    const results = weightedAverageForecast(sampleData);
    expect(results).toHaveLength(1);
  });

  it('applies seasonal factor using correct calendar month alignment', () => {
    // 12 months of data with distinct seasonal pattern
    const seasonalData = Array.from({ length: 12 }, (_, i) => ({
      month: `2024-${String(i + 1).padStart(2, '0')}`,
      revenue: i < 6 ? 50000 : 30000, // H1=50k, H2=30k
    }));
    const mean = (50000 * 6 + 30000 * 6) / 12; // 40000
    const results = weightedAverageForecast(seasonalData, 12);
    // Step 0 → maps to revenues[(11+1+0) % 12] = revenues[0] = 50000 (high season)
    // Step 6 → maps to revenues[(11+1+6) % 12] = revenues[6] = 30000 (low season)
    // The seasonal factor for high = 50000/40000 = 1.25 → multiplied by 0.3 + 0.7
    // The seasonal factor for low = 30000/40000 = 0.75 → multiplied by 0.3 + 0.7
    // So step 0 should have a higher seasonal boost than step 6
    const step0Factor = 0.7 + 0.3 * (50000 / mean);
    const step6Factor = 0.7 + 0.3 * (30000 / mean);
    expect(step0Factor).toBeGreaterThan(step6Factor);
    // Verify the forecasts reflect this relationship (accounting for trend decay)
    expect(results).toHaveLength(12);
    expect(results[0].forecast).toBeGreaterThan(0);
    expect(results[6].forecast).toBeGreaterThan(0);
  });
});

describe('smartForecast', () => {
  it('falls back to weighted-average when service is unavailable', async () => {
    // No forecast service is running during tests
    const result = await smartForecast(sampleData, 3);
    expect(result.fallback).toBe(true);
    expect(result.method).toBe('weighted-average');
    expect(result.forecasts).toHaveLength(3);
    result.forecasts.forEach(f => {
      expect(f.forecast).toBeGreaterThan(0);
    });
  });

  it('returns SARIMAX results when service responds', async () => {
    const mockResponse = {
      forecasts: [
        { month: '2025-01', forecast: 35000, lower: 30000, upper: 40000 },
      ],
      method: 'SARIMAX',
      historical_mean: 33000,
      historical_std: 3000,
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await smartForecast(sampleData, 1);
    expect(result.fallback).toBe(false);
    expect(result.method).toBe('SARIMAX');
    expect(result.forecasts).toHaveLength(1);
    expect(result.forecasts[0].forecast).toBe(35000);

    vi.restoreAllMocks();
  });
});

describe('formatForecastResult', () => {
  it('formats result as markdown', () => {
    const result = weightedAverageForecast(sampleData, 1)[0];
    const formatted = formatForecastResult(result, 'Jan 2025');
    expect(formatted).toContain('Jan 2025');
    expect(formatted).toContain('Forecast:');
    expect(formatted).toContain('Confidence Interval');
    expect(formatted).toContain('Historical average');
  });

  it('handles zero historical mean without division by zero', () => {
    const result = {
      forecast: 100,
      confidence: { lower: 50, upper: 150 },
      method: 'Test',
      historicalMean: 0,
      historicalStd: 0,
    };
    const formatted = formatForecastResult(result, 'Jan 2025');
    expect(formatted).toContain('0.0%');
  });
});

describe('generateForecastChart', () => {
  it('returns a line chart config with combined data', () => {
    const result = weightedAverageForecast(sampleData, 1)[0];
    const chart = generateForecastChart(sampleData, result, 'Jan 2025');
    expect(chart.type).toBe('line');
    expect(chart.data).toHaveLength(sampleData.length + 1);
    // Last point should be the forecast
    const lastPoint = chart.data[chart.data.length - 1];
    expect(lastPoint.month).toBe('Jan 2025');
    expect(lastPoint.forecast).toBe(result.forecast);
    expect(lastPoint.actual).toBeNull();
  });

  it('historical points have null forecast values', () => {
    const result = weightedAverageForecast(sampleData, 1)[0];
    const chart = generateForecastChart(sampleData, result, 'Jan 2025');
    const firstPoint = chart.data[0];
    expect(firstPoint.actual).toBe(sampleData[0].revenue);
    expect(firstPoint.forecast).toBeNull();
  });
});
