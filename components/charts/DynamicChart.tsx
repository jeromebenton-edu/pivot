'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChartConfig, type EChartsClickParams } from '@/lib/types';
import { buildEChartsOption } from '@/lib/chart-config-builder';
import EChart, { type EChartsInstance } from './EChart';
import ChartToolbar from './ChartToolbar';

interface DrillMenu {
  x: number;
  y: number;
  name: string;
  value: string;
  options: string[];
}

function getDrillDownOptions(
  chartType: string,
  chartTitle: string,
  name: string,
): string[] {
  switch (chartType) {
    case 'bar':
      return [
        `Show me the monthly trend for ${name}`,
        `What are the top suppliers for ${name}?`,
        `Compare ${name} spend across regions`,
      ];
    case 'line':
    case 'area':
      return [
        `Break down ${name} spend by product line`,
        `What drove the change in ${name}?`,
      ];
    case 'pie':
      return [
        `Show me the monthly trend for ${name}`,
        `What are the details for ${name}?`,
      ];
    default:
      return [
        `Tell me more about ${name}`,
        `Show me details for ${name}`,
      ];
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTableCell(key: string, val: unknown): string {
  if (val === null || val === undefined) return '';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  const lk = key.toLowerCase();
  if (lk.includes('revenue') || lk.includes('spend') || lk.includes('cost') || lk === 'value') {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  }
  if (lk.includes('rate') || lk.includes('percent')) return `${n.toFixed(1)}%`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function humanizeHeader(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface DynamicChartProps {
  config: ChartConfig;
  onDrillDown?: (query: string) => void;
  onPinToDashboard?: (config: ChartConfig) => void;
}

export default function DynamicChart({ config, onDrillDown, onPinToDashboard }: DynamicChartProps) {
  const [chartInstance, setChartInstance] = useState<EChartsInstance | null>(null);
  const [drillMenu, setDrillMenu] = useState<DrillMenu | null>(null);
  const [showTable, setShowTable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChartReady = useCallback((instance: EChartsInstance) => {
    setChartInstance(instance);
  }, []);

  const handleChartClick = useCallback((params: EChartsClickParams) => {
    if (!onDrillDown || !params.name) return;

    const options = getDrillDownOptions(
      config.type,
      config.title,
      params.name,
    );

    const event = params.event?.event as MouseEvent | undefined;
    if (!event || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(event.clientX - rect.left, rect.width - 240);
    const y = Math.min(event.clientY - rect.top, rect.height - 100);

    setDrillMenu({
      x: Math.max(0, x),
      y: Math.max(0, y),
      name: params.name,
      value: formatValue(params.value),
      options,
    });
  }, [onDrillDown, config.type, config.title]);

  const handleOptionClick = useCallback((query: string) => {
    setDrillMenu(null);
    onDrillDown?.(query);
  }, [onDrillDown]);

  // Dismiss on Escape
  useEffect(() => {
    if (!drillMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrillMenu(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drillMenu]);

  const { title, data, height = 400 } = config;

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No data available for chart</p>
      </div>
    );
  }

  const option = buildEChartsOption(config);
  const chartEvents = onDrillDown ? { click: handleChartClick as (...args: unknown[]) => void } : undefined;

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">{title}</h3>
      )}
      <div
        ref={containerRef}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 relative"
      >
        <EChart
          option={option}
          height={height}
          sampleData={config.sampleData}
          onChartReady={handleChartReady}
          onEvents={chartEvents}
        />

        {/* Drill-down context menu */}
        {drillMenu && (
          <>
            {/* Backdrop to dismiss */}
            <div
              className="fixed inset-0 z-20"
              onClick={() => setDrillMenu(null)}
            />
            {/* Menu popup */}
            <div
              className="absolute z-30 w-60 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
              style={{ top: drillMenu.y, left: drillMenu.x }}
            >
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {drillMenu.name}
                </p>
                {drillMenu.value && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{drillMenu.value}</p>
                )}
              </div>
              <div className="py-1">
                {drillMenu.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleOptionClick(opt)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <ChartToolbar chartInstance={chartInstance} title={title} data={data} chartConfig={config} onPinToDashboard={onPinToDashboard} />
      </div>

      {/* Collapsible data table */}
      {data.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowTable(!showTable)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showTable ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showTable ? 'Hide data' : 'View data'} ({data.length} rows)
          </button>
          {showTable && (() => {
            const keys = Object.keys(data[0]);
            return (
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {keys.map(key => (
                        <th key={key} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {humanizeHeader(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                        {keys.map(key => (
                          <td key={key} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {formatTableCell(key, row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
