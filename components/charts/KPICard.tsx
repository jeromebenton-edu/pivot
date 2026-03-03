'use client';

import React from 'react';

interface KPICardProps {
  title: string;
  value: string;
  delta?: { value: number; label: string };
  subtitle?: string;
}

export default function KPICard({ title, value, delta, subtitle }: KPICardProps) {
  const isPositive = delta && delta.value >= 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        {title}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {value}
      </p>
      {delta && (
        <div className="flex items-center gap-1">
          <span className={`text-sm font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{delta.label}</span>
        </div>
      )}
      {subtitle && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
