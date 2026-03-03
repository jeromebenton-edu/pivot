import { describe, it, expect } from 'vitest';
import { buildEChartsOption } from '../chart-config-builder';
import type { ChartConfig } from '../types';

const baseConfig: ChartConfig = {
  type: 'bar',
  title: 'Test Chart',
  data: [
    { name: 'A', value: 100 },
    { name: 'B', value: 200 },
    { name: 'C', value: 300 },
  ],
  xAxis: { dataKey: 'name' },
  yAxis: { dataKey: 'value' },
};

describe('buildEChartsOption', () => {
  it('builds bar chart option', () => {
    const option = buildEChartsOption(baseConfig);
    expect(option.series).toBeDefined();
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('bar');
  });

  it('builds line chart option', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'line' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('line');
  });

  it('builds pie chart option', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'pie' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('pie');
  });

  it('builds scatter chart option', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'scatter',
      data: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      xAxis: { dataKey: 'x' },
      yAxis: { dataKey: 'y' },
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('scatter');
  });

  it('builds area chart option', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'area' });
    const series = option.series as Array<{ type: string; areaStyle: unknown }>;
    expect(series[0].type).toBe('line');
    expect(series[0].areaStyle).toBeDefined();
  });

  it('builds funnel chart option', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'funnel' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('funnel');
  });

  it('builds radar chart option', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'radar' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('radar');
    expect(option.radar).toBeDefined();
  });

  it('builds gauge chart option', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'gauge',
      data: [{ value: 75 }],
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('gauge');
  });

  it('falls back to bar for unknown types', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'unknown' as ChartConfig['type'] });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('bar');
  });

  it('handles forecast data in line chart', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'line',
      data: [
        { month: 'Jan', actual: 100, forecast: null },
        { month: 'Feb', actual: null, forecast: 120, lowerBound: 100, upperBound: 140 },
      ],
      xAxis: { dataKey: 'month' },
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ name?: string }>;
    // Forecast chart should have multiple series
    expect(series.length).toBeGreaterThan(1);
  });

  it('builds waterfall chart option', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'waterfall',
      data: [
        { name: 'Jan', value: 10000 },
        { name: 'Feb', value: 5000 },
        { name: 'Mar', value: -3000 },
      ],
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ type: string; stack?: string }>;
    // Waterfall uses 3 stacked bar series: base (invisible), increase, decrease
    expect(series).toHaveLength(3);
    expect(series[0].type).toBe('bar');
    expect(series[0].stack).toBe('waterfall');
    expect(series[1].stack).toBe('waterfall');
    expect(series[2].stack).toBe('waterfall');
  });

  it('uses custom colors when provided', () => {
    const config: ChartConfig = {
      ...baseConfig,
      colors: ['#ff0000', '#00ff00'],
    };
    const option = buildEChartsOption(config);
    expect(option.series).toBeDefined();
  });

  // heatmap, treemap, combo fall back to line chart
  it('heatmap falls back to line chart', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'heatmap' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('line');
  });

  it('treemap falls back to line chart', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'treemap' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('line');
  });

  it('combo falls back to line chart', () => {
    const option = buildEChartsOption({ ...baseConfig, type: 'combo' });
    const series = option.series as Array<{ type: string }>;
    expect(series[0].type).toBe('line');
  });

  // Waterfall builder logic
  it('waterfall computes correct running totals', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'waterfall',
      data: [
        { name: 'Jan', value: 10000 },
        { name: 'Feb', value: 5000 },
        { name: 'Mar', value: -3000 },
      ],
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ data: (number | string)[] }>;
    const base = series[0].data;      // invisible base
    const increase = series[1].data;  // green bars
    const decrease = series[2].data;  // red bars

    // Jan: base=0, increase=10000 (positive)
    expect(base[0]).toBe(0);
    expect(increase[0]).toBe(10000);
    expect(decrease[0]).toBe('-');

    // Feb: base=10000, increase=5000 (positive)
    expect(base[1]).toBe(10000);
    expect(increase[1]).toBe(5000);
    expect(decrease[1]).toBe('-');

    // Mar: base=12000 (15000-3000), increase='-', decrease=3000
    expect(base[2]).toBe(12000);
    expect(increase[2]).toBe('-');
    expect(decrease[2]).toBe(3000);

    // Total bar appended: base=0, increase=12000 (running total)
    expect(base[3]).toBe(0);
    expect(increase[3]).toBe(12000);
  });

  it('waterfall adds Total label to xAxis', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'waterfall',
      data: [
        { name: 'Jan', value: 100 },
        { name: 'Feb', value: -50 },
      ],
    };
    const option = buildEChartsOption(config);
    const xAxisData = (option.xAxis as { data: string[] }).data;
    expect(xAxisData[xAxisData.length - 1]).toBe('Total');
    expect(xAxisData).toHaveLength(3); // Jan, Feb, Total
  });

  it('handles forecast data in bar chart', () => {
    const config: ChartConfig = {
      ...baseConfig,
      type: 'bar',
      data: [
        { month: 'Jan', actual: 100, forecast: null },
        { month: 'Feb', actual: null, forecast: 120, lowerBound: 100, upperBound: 140 },
      ],
      xAxis: { dataKey: 'month' },
    };
    const option = buildEChartsOption(config);
    const series = option.series as Array<{ name?: string; type: string }>;
    expect(series.length).toBe(2);
    expect(series[0].name).toBe('Historical');
    expect(series[1].name).toBe('Forecast');
  });
});
