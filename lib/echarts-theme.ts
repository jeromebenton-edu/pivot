const CORPORATE_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#E11D48', // Rose
];

export const lightTheme = {
  color: CORPORATE_COLORS,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#374151',
  },
  title: {
    textStyle: {
      color: '#111827',
      fontSize: 14,
      fontWeight: 600,
    },
  },
  grid: {
    left: 60,
    right: 24,
    top: 40,
    bottom: 48,
    containLabel: false,
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#d1d5db' } },
    axisTick: { lineStyle: { color: '#d1d5db' } },
    axisLabel: { color: '#6b7280', fontSize: 11 },
    splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' as const } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#6b7280', fontSize: 11 },
    splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' as const } },
  },
  legend: {
    textStyle: { color: '#6b7280', fontSize: 11 },
    pageTextStyle: { color: '#6b7280' },
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    textStyle: { color: '#111827', fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);',
  },
};

export const darkTheme = {
  color: CORPORATE_COLORS.map(c => adjustBrightness(c, 15)),
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#d1d5db',
  },
  title: {
    textStyle: {
      color: '#f3f4f6',
      fontSize: 14,
      fontWeight: 600,
    },
  },
  grid: {
    left: 60,
    right: 24,
    top: 40,
    bottom: 48,
    containLabel: false,
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#4b5563' } },
    axisTick: { lineStyle: { color: '#4b5563' } },
    axisLabel: { color: '#9ca3af', fontSize: 11 },
    splitLine: { lineStyle: { color: '#1f2937', type: 'dashed' as const } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#9ca3af', fontSize: 11 },
    splitLine: { lineStyle: { color: '#1f2937', type: 'dashed' as const } },
  },
  legend: {
    textStyle: { color: '#9ca3af', fontSize: 11 },
    pageTextStyle: { color: '#9ca3af' },
  },
  tooltip: {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    textStyle: { color: '#f3f4f6', fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);',
  },
};

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function formatCurrency(value: number): string {
  const v = Number(value);
  if (isNaN(v)) return '$0';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function formatNumber(value: number): string {
  const v = Number(value);
  if (isNaN(v)) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export { CORPORATE_COLORS };
