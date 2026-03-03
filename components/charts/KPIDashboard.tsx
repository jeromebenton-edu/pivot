'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import KPICard from './KPICard';
import dynamic from 'next/dynamic';
import { buildEChartsOption } from '@/lib/chart-config-builder';
import type { ChartConfig, EChartsClickParams } from '@/lib/types';

const EChart = dynamic(() => import('./EChart'), { ssr: false });

interface DrillMenu {
  x: number;
  y: number;
  name: string;
  value: string;
  options: string[];
  containerKey: 'trend' | 'category';
}

function getDrillOptions(chartType: string, name: string): string[] {
  if (chartType === 'bar') {
    return [
      `Show me the monthly trend for ${name}`,
      `What are the top suppliers for ${name}?`,
      `Compare ${name} spend across regions`,
    ];
  }
  return [
    `Break down ${name} spend by product line`,
    `What drove the change in ${name}?`,
  ];
}

function fmtValue(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface KPIDashboardProps {
  data: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    monthlyTrend: { month: string; revenue: number }[];
    categoryBreakdown: { name: string; revenue: number }[];
  };
  onDrillDown?: (query: string) => void;
}

export default function KPIDashboard({ data, onDrillDown }: KPIDashboardProps) {
  const { totalRevenue, totalOrders, avgOrderValue, monthlyTrend, categoryBreakdown } = data;
  const [drillMenu, setDrillMenu] = useState<DrillMenu | null>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);

  const firstHalf = monthlyTrend.slice(0, 6).reduce((s, m) => s + m.revenue, 0);
  const secondHalf = monthlyTrend.slice(6, 12).reduce((s, m) => s + m.revenue, 0);
  const growthRate = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

  const trendConfig: ChartConfig = {
    type: 'area',
    title: '',
    data: monthlyTrend.map(m => ({ name: m.month, value: m.revenue })),
    xAxis: { dataKey: 'name' },
    yAxis: { dataKey: 'value' },
  };

  const categoryConfig: ChartConfig = {
    type: 'bar',
    title: '',
    data: categoryBreakdown.sort((a, b) => b.revenue - a.revenue).slice(0, 6).map(c => ({ name: c.name, value: c.revenue })),
    xAxis: { dataKey: 'name' },
    yAxis: { dataKey: 'value', label: 'Revenue ($)' },
  };

  const handleTrendClick = useCallback((params: EChartsClickParams) => {
    if (!params.name || !trendRef.current) return;
    const evt = params.event?.event as MouseEvent | undefined;
    if (!evt) return;
    const rect = trendRef.current.getBoundingClientRect();
    setDrillMenu({
      x: Math.min(Math.max(0, evt.clientX - rect.left), rect.width - 240),
      y: Math.min(Math.max(0, evt.clientY - rect.top), rect.height - 80),
      name: params.name,
      value: fmtValue(params.value),
      options: getDrillOptions('area', params.name),
      containerKey: 'trend',
    });
  }, []);

  const handleCategoryClick = useCallback((params: EChartsClickParams) => {
    if (!params.name || !categoryRef.current) return;
    const evt = params.event?.event as MouseEvent | undefined;
    if (!evt) return;
    const rect = categoryRef.current.getBoundingClientRect();
    setDrillMenu({
      x: Math.min(Math.max(0, evt.clientX - rect.left), rect.width - 240),
      y: Math.min(Math.max(0, evt.clientY - rect.top), rect.height - 80),
      name: params.name,
      value: fmtValue(params.value),
      options: getDrillOptions('bar', params.name),
      containerKey: 'category',
    });
  }, []);

  const handleOptionClick = useCallback((query: string) => {
    setDrillMenu(null);
    onDrillDown?.(query);
  }, [onDrillDown]);

  useEffect(() => {
    if (!drillMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrillMenu(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drillMenu]);

  const menu = drillMenu && (
    <>
      <div className="fixed inset-0 z-20" onClick={() => setDrillMenu(null)} />
      <div
        className="absolute z-30 w-60 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
        style={{ top: drillMenu.y, left: drillMenu.x }}
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{drillMenu.name}</p>
          {drillMenu.value && <p className="text-xs text-gray-500 dark:text-gray-400">{drillMenu.value}</p>}
        </div>
        <div className="py-1">
          {drillMenu.options.map(opt => (
            <button key={opt} onClick={() => handleOptionClick(opt)} className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
              {opt}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Spend" value={`$${(totalRevenue / 1000000).toFixed(1)}M`} subtitle="Full year 2024" />
        <KPICard title="Purchase Orders" value={totalOrders.toLocaleString()} subtitle="Issued to suppliers" />
        <KPICard title="Avg PO Value" value={`$${(avgOrderValue / 1000).toFixed(1)}K`} subtitle="Per purchase order" />
        <KPICard
          title="H2 vs H1 Growth"
          value={`${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`}
          delta={{ value: growthRate, label: 'vs H1' }}
          subtitle="Revenue trend"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div ref={trendRef} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 relative">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Monthly Procurement Spend</h4>
          <EChart option={buildEChartsOption(trendConfig)} height={200} {...(onDrillDown ? { onEvents: { click: handleTrendClick as (...args: unknown[]) => void } } : {})} />
          {drillMenu?.containerKey === 'trend' && menu}
        </div>
        <div ref={categoryRef} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 relative">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Spend by Product Line</h4>
          <EChart option={buildEChartsOption(categoryConfig)} height={200} {...(onDrillDown ? { onEvents: { click: handleCategoryClick as (...args: unknown[]) => void } } : {})} />
          {drillMenu?.containerKey === 'category' && menu}
        </div>
      </div>
    </div>
  );
}
