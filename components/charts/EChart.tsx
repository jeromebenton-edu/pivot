'use client';

import React, { useRef, useCallback, Component, type ReactNode } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, GaugeChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, ToolboxComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useTheme } from 'next-themes';
import { lightTheme, darkTheme } from '@/lib/echarts-theme';

class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('Chart render error:', error.message); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-48 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-500 dark:text-gray-400">
          Chart failed to render. Try refreshing the page.
        </div>
      );
    }
    return this.props.children;
  }
}

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, GaugeChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  ToolboxComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent,
  VisualMapComponent, CanvasRenderer,
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EChartsInstance = any;

interface EChartProps {
  option: Record<string, unknown>;
  height?: number;
  sampleData?: boolean;
  onChartReady?: (instance: EChartsInstance) => void;
  onEvents?: Record<string, (...args: unknown[]) => void>;
}

export default function EChart({ option, height = 400, sampleData, onChartReady, onEvents }: EChartProps) {
  const chartRef = useRef<ReactEChartsCore>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const mergedOption = {
    ...option,
    backgroundColor: 'transparent',
    textStyle: { ...theme.textStyle, ...(option.textStyle as object || {}) },
    grid: { ...theme.grid, ...(option.grid as object || {}) },
    tooltip: {
      ...theme.tooltip,
      trigger: 'axis' as const,
      ...(option.tooltip as object || {}),
    },
    legend: { ...theme.legend, ...(option.legend as object || {}) },
    color: option.color || theme.color,
    animationDuration: 600,
    animationEasing: 'cubicOut',
  };

  const handleChartReady = useCallback((instance: EChartsInstance) => {
    onChartReady?.(instance);
  }, [onChartReady]);

  return (
    <ChartErrorBoundary>
      {sampleData && (
        <div className="mb-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-700 dark:text-amber-300">
          Showing sample data — upload your dataset for real results
        </div>
      )}
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={mergedOption}
        style={{ height: `${height}px`, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
        onChartReady={handleChartReady}
        {...(onEvents ? { onEvents } : {})}
      />
    </ChartErrorBoundary>
  );
}

export { echarts };
export type { EChartsInstance };
