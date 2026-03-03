import { ChartConfig } from '@/lib/types';
import { formatCurrency, formatPercent, CORPORATE_COLORS } from '@/lib/echarts-theme';
import type { EChartsCoreOption } from 'echarts/core';

export function buildEChartsOption(config: ChartConfig): EChartsCoreOption {
  const { type, colors } = config;
  const palette = colors || CORPORATE_COLORS;

  switch (type) {
    case 'line':
      return buildLineOption(config, palette);
    case 'bar':
      return buildBarOption(config, palette);
    case 'pie':
      return buildPieOption(config, palette);
    case 'scatter':
      return buildScatterOption(config, palette);
    case 'area':
      return buildAreaOption(config, palette);
    case 'funnel':
      return buildFunnelOption(config, palette);
    case 'radar':
      return buildRadarOption(config, palette);
    case 'gauge':
      return buildGaugeOption(config, palette);
    case 'waterfall':
      return buildWaterfallOption(config, palette);
    case 'heatmap':
    case 'treemap':
    case 'combo':
      return buildLineOption(config, palette);
    default:
      return buildBarOption(config, palette);
  }
}

function isForecastData(data: Record<string, unknown>[]): boolean {
  return data.some(d => d.forecast !== undefined && d.forecast !== null);
}

function buildLineOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const xKey = xAxis?.dataKey || 'month';
  const yKey = yAxis?.dataKey || 'revenue';

  if (isForecastData(data)) {
    return buildForecastLineOption(config, palette);
  }

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const d = (p as { value: number; name: string });
        return `<strong>${d.name}</strong><br/>${yAxis?.label || yKey}: ${formatCurrency(d.value)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d[xKey] as string),
      axisLabel: { rotate: data.length > 8 ? 30 : 0 },
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    },
    series: [{
      type: 'line',
      data: data.map(d => d[yKey] as number),
      smooth: true,
      lineStyle: { width: 2.5 },
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: palette[0] },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: palette[0] + '30' },
            { offset: 1, color: palette[0] + '05' },
          ],
        },
      },
    }],
  };
}

function buildForecastLineOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data } = config;
  const xKey = config.xAxis?.dataKey || 'month';

  const actualData = data.map(d => (d.actual !== null && d.actual !== undefined) ? d.actual as number : null);
  const forecastData = data.map(d => (d.forecast !== null && d.forecast !== undefined) ? d.forecast as number : null);
  const upperData = data.map(d => (d.upperBound !== null && d.upperBound !== undefined) ? d.upperBound as number : null);
  const lowerData = data.map(d => (d.lowerBound !== null && d.lowerBound !== undefined) ? d.lowerBound as number : null);

  // Build confidence band as a stacked area between lower and (upper - lower)
  const bandBase = lowerData.map(v => v ?? '-');
  const bandWidth = data.map((_, i) => {
    if (upperData[i] !== null && lowerData[i] !== null) {
      return (upperData[i] as number) - (lowerData[i] as number);
    }
    return '-';
  });

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { data: number | null; seriesName: string; dataIndex: number }[];
        if (!items || !items[0]) return '';
        const idx = items[0].dataIndex;
        const label = data[idx]?.[xKey] as string;
        let html = `<strong>${label ?? ''}</strong>`;
        const point = data[idx];
        if (!point) return html;
        if (point.actual !== null && point.actual !== undefined) {
          html += `<br/>Actual: ${formatCurrency(point.actual as number)}`;
        }
        if (point.forecast !== null && point.forecast !== undefined) {
          html += `<br/><span style="color:${palette[1] || '#EF4444'}">Forecast: ${formatCurrency(point.forecast as number)}</span>`;
        }
        if (point.lowerBound !== null && point.upperBound !== null &&
            point.lowerBound !== undefined && point.upperBound !== undefined) {
          html += `<br/><span style="font-size:11px;color:#9ca3af">95% CI: ${formatCurrency(point.lowerBound as number)} – ${formatCurrency(point.upperBound as number)}</span>`;
        }
        return html;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d[xKey] as string),
      axisLabel: { rotate: data.length > 10 ? 45 : 0 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    },
    legend: {
      data: ['Historical', 'Forecast'],
    },
    series: [
      // Confidence band base (invisible)
      {
        type: 'bar',
        stack: 'confidence',
        data: bandBase,
        itemStyle: { color: 'transparent' },
        barWidth: 0,
        silent: true,
        tooltip: { show: false },
      },
      // Confidence band width
      {
        type: 'bar',
        stack: 'confidence',
        data: bandWidth,
        itemStyle: { color: (palette[1] || '#EF4444') + '15' },
        barWidth: '100%',
        silent: true,
        tooltip: { show: false },
      },
      // Actual line
      {
        name: 'Historical',
        type: 'line',
        data: actualData.map(v => v ?? '-'),
        smooth: true,
        lineStyle: { width: 2.5, color: palette[0] },
        itemStyle: { color: palette[0] },
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: false,
      },
      // Forecast line
      {
        name: 'Forecast',
        type: 'line',
        data: forecastData.map(v => v ?? '-'),
        smooth: true,
        lineStyle: { width: 2.5, type: 'dashed', color: palette[1] || '#EF4444' },
        itemStyle: { color: palette[1] || '#EF4444' },
        symbol: 'diamond',
        symbolSize: 8,
        connectNulls: false,
      },
    ],
  };
}

function buildBarOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const xKey = xAxis?.dataKey || 'name';
  const yKey = yAxis?.dataKey || 'value';

  if (isForecastData(data)) {
    return buildForecastBarOption(config, palette);
  }

  const isPercentage = yAxis?.label?.includes('%') || yKey === 'conversionRate' || yKey === 'turnoverRate';
  const formatter = isPercentage ? formatPercent : formatCurrency;

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const d = (p as { value: number; name: string });
        return `<strong>${d.name}</strong><br/>${yAxis?.label || yKey}: ${formatter(d.value)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d[xKey] as string),
      axisLabel: { rotate: data.length > 6 ? 20 : 0 },
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
      axisLabel: { formatter: (v: number) => formatter(v) },
    },
    series: [{
      type: 'bar',
      data: data.map((d, i) => ({
        value: d[yKey] as number,
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: palette[i % palette.length] },
              { offset: 1, color: palette[i % palette.length] + 'AA' },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
      })),
      barMaxWidth: 60,
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' },
      },
    }],
  };
}

function buildForecastBarOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const xKey = xAxis?.dataKey || 'month';

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { data: number | null; seriesName: string }[];
        const idx = (items[0] as unknown as { dataIndex: number }).dataIndex;
        const point = data[idx];
        const label = point[xKey] as string;
        let html = `<strong>${label}</strong>`;
        if (point.actual !== null && point.actual !== undefined) {
          html += `<br/>Actual: ${formatCurrency(point.actual as number)}`;
        }
        if (point.forecast !== null && point.forecast !== undefined) {
          html += `<br/><span style="color:${palette[1] || '#EF4444'}">Forecast: ${formatCurrency(point.forecast as number)}</span>`;
        }
        if (point.lowerBound != null && point.upperBound != null) {
          html += `<br/><span style="font-size:11px;color:#9ca3af">95% CI: ${formatCurrency(point.lowerBound as number)} – ${formatCurrency(point.upperBound as number)}</span>`;
        }
        return html;
      },
    },
    legend: { data: ['Historical', 'Forecast'] },
    xAxis: {
      type: 'category',
      data: data.map(d => d[xKey] as string),
      axisLabel: { rotate: data.length > 10 ? 45 : 0 },
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    },
    series: [
      {
        name: 'Historical',
        type: 'bar',
        data: data.map(d => (d.actual !== null && d.actual !== undefined) ? d.actual as number : null),
        itemStyle: {
          color: palette[0],
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: 40,
      },
      {
        name: 'Forecast',
        type: 'bar',
        data: data.map(d => (d.forecast !== null && d.forecast !== undefined) ? d.forecast as number : null),
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: palette[1] || '#EF4444' },
              { offset: 1, color: (palette[1] || '#EF4444') + '88' },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: 40,
      },
    ],
  };
}

function buildPieOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const nameKey = xAxis?.dataKey || 'name';
  const valueKey = yAxis?.dataKey || 'value';

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number };
        return `<strong>${p.name}</strong><br/>${formatCurrency(p.value)} (${p.percent.toFixed(1)}%)`;
      },
    },
    legend: {
      orient: 'vertical',
      right: 16,
      top: 'center',
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 6,
        borderColor: 'transparent',
        borderWidth: 2,
      },
      label: {
        formatter: '{b}: {d}%',
        fontSize: 11,
      },
      emphasis: {
        label: { fontSize: 13, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
      },
      data: data.map((d, i) => ({
        name: d[nameKey] as string,
        value: d[valueKey] as number,
        itemStyle: { color: palette[i % palette.length] },
      })),
    }],
  };
}

function buildScatterOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const xKey = xAxis?.dataKey || 'x';
  const yKey = yAxis?.dataKey || 'y';

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { data: number[] };
        return `${xAxis?.label || xKey}: ${p.data[0]}<br/>${yAxis?.label || yKey}: ${p.data[1]}`;
      },
    },
    xAxis: {
      type: 'value',
      name: xAxis?.label,
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
    },
    series: [{
      type: 'scatter',
      data: data.map(d => [d[xKey] as number, d[yKey] as number]),
      symbolSize: 10,
      itemStyle: {
        color: palette[0],
        shadowBlur: 4,
        shadowColor: palette[0] + '40',
      },
    }],
  };
}

function buildAreaOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const xKey = xAxis?.dataKey || 'name';
  const yKey = yAxis?.dataKey || 'value';

  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map(d => d[xKey] as string),
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    },
    series: [{
      type: 'line',
      data: data.map(d => d[yKey] as number),
      smooth: true,
      lineStyle: { width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: palette[0] + '50' },
            { offset: 1, color: palette[0] + '08' },
          ],
        },
      },
      itemStyle: { color: palette[0] },
    }],
  };
}

function buildFunnelOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const nameKey = xAxis?.dataKey || 'name';
  const valueKey = yAxis?.dataKey || 'value';

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    series: [{
      type: 'funnel',
      left: '10%',
      width: '80%',
      sort: 'descending',
      label: { show: true, position: 'inside', formatter: '{b}\n{c}' },
      itemStyle: { borderWidth: 0 },
      data: data.map((d, i) => ({
        name: d[nameKey] as string,
        value: d[valueKey] as number,
        itemStyle: { color: palette[i % palette.length] },
      })),
    }],
  };
}

function buildRadarOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const nameKey = xAxis?.dataKey || 'name';
  const valueKey = yAxis?.dataKey || 'value';

  const maxVal = Math.max(...data.map(d => d[valueKey] as number)) * 1.2;

  return {
    tooltip: {},
    radar: {
      indicator: data.map(d => ({ name: d[nameKey] as string, max: maxVal })),
    },
    series: [{
      type: 'radar',
      data: [{
        value: data.map(d => d[valueKey] as number),
        areaStyle: { color: palette[0] + '30' },
        lineStyle: { color: palette[0] },
        itemStyle: { color: palette[0] },
      }],
    }],
  };
}

function buildGaugeOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data } = config;
  const value = (data[0]?.value as number) || 0;

  return {
    series: [{
      type: 'gauge',
      progress: { show: true, width: 14 },
      axisLine: { lineStyle: { width: 14 } },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { width: 2, color: '#999' } },
      pointer: { itemStyle: { color: palette[0] } },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 20,
      },
      data: [{ value }],
    }],
  };
}

function buildWaterfallOption(config: ChartConfig, palette: string[]): EChartsCoreOption {
  const { data, xAxis, yAxis } = config;
  const nameKey = xAxis?.dataKey || 'name';
  const valueKey = yAxis?.dataKey || 'value';

  const labels = data.map(d => d[nameKey] as string);
  const values = data.map(d => d[valueKey] as number);

  // Calculate running totals for the waterfall
  const base: (number | string)[] = [];
  const increase: (number | string)[] = [];
  const decrease: (number | string)[] = [];
  let running = 0;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val >= 0) {
      base.push(running);
      increase.push(val);
      decrease.push('-');
    } else {
      base.push(running + val);
      increase.push('-');
      decrease.push(Math.abs(val));
    }
    running += val;
  }

  // Add total bar
  labels.push('Total');
  base.push(0);
  increase.push(running > 0 ? running : '-');
  decrease.push(running < 0 ? Math.abs(running) : '-');

  const increaseColor = palette[0] || '#10B981';
  const decreaseColor = palette[1] || '#EF4444';

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; data: number | string; dataIndex: number }[];
        const idx = items[0]?.dataIndex ?? 0;
        const label = labels[idx];
        if (label === 'Total') {
          return `<strong>${label}</strong><br/>Total: ${formatCurrency(running)}`;
        }
        const val = values[idx];
        const prefix = val >= 0 ? '+' : '';
        return `<strong>${label}</strong><br/>Change: ${prefix}${formatCurrency(val)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { rotate: labels.length > 8 ? 30 : 0 },
    },
    yAxis: {
      type: 'value',
      name: yAxis?.label,
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    },
    series: [
      // Invisible base
      {
        type: 'bar',
        stack: 'waterfall',
        data: base,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        tooltip: { show: false },
      },
      // Increase (green)
      {
        name: 'Increase',
        type: 'bar',
        stack: 'waterfall',
        data: increase,
        itemStyle: {
          color: increaseColor,
          borderRadius: [4, 4, 0, 0],
        },
      },
      // Decrease (red)
      {
        name: 'Decrease',
        type: 'bar',
        stack: 'waterfall',
        data: decrease,
        itemStyle: {
          color: decreaseColor,
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };
}
