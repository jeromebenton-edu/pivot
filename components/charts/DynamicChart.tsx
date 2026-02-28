'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie,
  ScatterChart, Scatter,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer
} from 'recharts';

interface DynamicChartProps {
  config: {
    type: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
    title: string;
    data: Record<string, unknown>[];
    xAxis?: { dataKey: string; label?: string };
    yAxis?: { dataKey: string; label?: string };
    series?: string;
    colors?: string[];
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
  };
}

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

export default function DynamicChart({ config }: DynamicChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartTheme = {
    grid: isDark ? '#374151' : '#e5e7eb',
    axis: isDark ? '#9ca3af' : '#6b7280',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    tooltipText: isDark ? '#f3f4f6' : '#111827',
  };

  const {
    type,
    title,
    data,
    xAxis,
    yAxis,
    series,
    colors = COLORS,
    height = 400,
    margin = { top: 20, right: 30, bottom: 40, left: 50 }
  } = config;

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No data available for chart</p>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'line':
        // Check if this is a forecast chart (has both actual and forecast data)
        const hasForecast = data.some(d => d.forecast !== undefined);

        if (hasForecast) {

          return (
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={data} margin={margin}>
                <defs>
                  <linearGradient id="colorConfidence" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis dataKey={xAxis?.dataKey || 'month'} tick={{ fill: chartTheme.axis }} />
                <YAxis tick={{ fill: chartTheme.axis }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as Record<string, unknown>;
                      return (
                        <div style={{ background: chartTheme.tooltipBg, color: chartTheme.tooltipText, border: `1px solid ${chartTheme.tooltipBorder}` }} className="p-2 rounded shadow">
                          <p className="font-semibold">{label}</p>
                          {data.actual !== null && data.actual !== undefined && (
                            <p className="text-sm">Actual: ${(data.actual as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          )}
                          {data.forecast !== null && data.forecast !== undefined && (
                            <>
                              <p className="text-sm text-red-600 dark:text-red-400">Forecast: ${(data.forecast as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              {data.lowerBound !== null && data.upperBound !== null && (
                                <p className="text-xs" style={{ color: chartTheme.axis }}>95% CI: ${(data.lowerBound as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${(data.upperBound as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ color: chartTheme.axis }} />

                {/* Confidence interval as area between bounds */}
                <Area
                  type="monotone"
                  dataKey="upperBound"
                  stackId="1"
                  stroke="none"
                  fill="url(#colorConfidence)"
                  connectNulls={false}
                  legendType="none"
                />

                {/* Historical data line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Historical"
                  stroke={colors[0]}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={false}
                />

                {/* Lower bound line (dashed, subtle) */}
                <Line
                  type="monotone"
                  dataKey="lowerBound"
                  stroke="#EF4444"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                  connectNulls={false}
                  dot={false}
                  legendType="none"
                />

                {/* Upper bound line (dashed, subtle) */}
                <Line
                  type="monotone"
                  dataKey="upperBound"
                  stroke="#EF4444"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                  connectNulls={false}
                  dot={false}
                  legendType="none"
                />

                {/* Forecast data line */}
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke={colors[1] || '#EF4444'}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  connectNulls={false}
                  dot={{ r: 4, fill: '#EF4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey={xAxis?.dataKey || 'name'} tick={{ fill: chartTheme.axis }} />
              <YAxis tick={{ fill: chartTheme.axis }} />
              <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText }} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              <Line
                type="monotone"
                dataKey={yAxis?.dataKey || series || 'value'}
                stroke={colors[0]}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        // Check if this is a forecast chart (has both actual and forecast data)
        const hasBarForecast = data.some(d => d.forecast !== undefined);

        if (hasBarForecast) {
          return (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={data} margin={margin}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis dataKey={xAxis?.dataKey || 'month'} tick={{ fill: chartTheme.axis }} />
                <YAxis
                  tick={{ fill: chartTheme.axis }}
                  label={yAxis?.label ? { value: yAxis.label, angle: -90, position: 'insideLeft', fill: chartTheme.axis } : undefined}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as Record<string, unknown>;
                      return (
                        <div style={{ background: chartTheme.tooltipBg, color: chartTheme.tooltipText, border: `1px solid ${chartTheme.tooltipBorder}` }} className="p-2 rounded shadow">
                          <p className="font-semibold">{label}</p>
                          {data.actual !== null && data.actual !== undefined && (
                            <p className="text-sm">Actual: ${(data.actual as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          )}
                          {data.forecast !== null && data.forecast !== undefined && (
                            <>
                              <p className="text-sm text-red-600 dark:text-red-400">Forecast: ${(data.forecast as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              {data.lowerBound !== null && data.upperBound !== null && (
                                <p className="text-xs" style={{ color: chartTheme.axis }}>95% CI: ${(data.lowerBound as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${(data.upperBound as number)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ color: chartTheme.axis }} />
                <Bar
                  dataKey="actual"
                  fill={colors[0]}
                  name="Historical"
                />
                <Bar
                  dataKey="forecast"
                  fill={colors[1] || '#EF4444'}
                  name="Forecast"
                />
              </BarChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey={xAxis?.dataKey || 'name'} tick={{ fill: chartTheme.axis }} />
              <YAxis
                tick={{ fill: chartTheme.axis }}
                label={yAxis?.label ? { value: yAxis.label, angle: -90, position: 'insideLeft', fill: chartTheme.axis } : undefined}
              />
              <Tooltip
                contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText }}
                formatter={(value: unknown, name?: string) => {
                  if (name === 'turnoverRate') {
                    return [`${value} orders/$1k`, 'Turnover Rate'];
                  }
                  if (typeof value === 'number') {
                    return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name || ''];
                  }
                  return [String(value), name || ''];
                }}
              />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              <Bar
                dataKey={yAxis?.dataKey || series || 'value'}
                fill={colors[0]}
                name={yAxis?.dataKey === 'turnoverRate' ? 'Turnover Rate' : (yAxis?.dataKey || series || 'Value')}
              />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey={yAxis?.dataKey || series || 'value'}
                nameKey={xAxis?.dataKey || 'name'}
                cx="50%"
                cy="50%"
                outerRadius={120}
                label
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText }} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey={xAxis?.dataKey || 'x'} name={xAxis?.label || 'X'} tick={{ fill: chartTheme.axis }} />
              <YAxis dataKey={yAxis?.dataKey || 'y'} name={yAxis?.label || 'Y'} tick={{ fill: chartTheme.axis }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText }} />
              <Scatter name="Data" data={data} fill={colors[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey={xAxis?.dataKey || 'name'} tick={{ fill: chartTheme.axis }} />
              <YAxis tick={{ fill: chartTheme.axis }} />
              <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, color: chartTheme.tooltipText }} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              <Area
                type="monotone"
                dataKey={yAxis?.dataKey || series || 'value'}
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded">
            <p className="text-gray-500 dark:text-gray-400">Unsupported chart type: {type}</p>
          </div>
        );
    }
  };

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">{title}</h3>
      )}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        {renderChart()}
      </div>
    </div>
  );
}