'use client';

import React from 'react';
import type { DashboardWidget } from '@/lib/types';
import DynamicChart from '@/components/charts/DynamicChart';

interface WidgetCardProps {
  widget: DashboardWidget;
  onRemove?: (widgetId: string) => void;
}

export default function WidgetCard({ widget, onRemove }: WidgetCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
          {widget.title}
        </h4>
        {onRemove && (
          <button
            onClick={() => onRemove(widget.id)}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Remove widget"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-3">
        <DynamicChart config={widget.chartConfig} />
      </div>
    </div>
  );
}
