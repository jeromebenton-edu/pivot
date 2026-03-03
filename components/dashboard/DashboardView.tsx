'use client';

import React, { useState, useCallback } from 'react';
import type { Dashboard, DashboardWidget } from '@/lib/types';
import WidgetCard from './WidgetCard';

interface DashboardViewProps {
  dashboard: Dashboard;
  onUpdate?: (dashboard: Dashboard) => void;
}

export default function DashboardView({ dashboard, onUpdate }: DashboardViewProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(dashboard.widgets);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(dashboard.title);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    const updated = widgets.filter(w => w.id !== widgetId);
    setWidgets(updated);

    // Persist to API
    fetch('/api/dashboards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dashboard.id, widgets: updated }),
    }).then(() => {
      onUpdate?.({ ...dashboard, widgets: updated });
    });
  }, [widgets, dashboard, onUpdate]);

  const handleTitleSave = useCallback(() => {
    setIsEditing(false);
    fetch('/api/dashboards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dashboard.id, title }),
    }).then(() => {
      onUpdate?.({ ...dashboard, title });
    });
  }, [title, dashboard, onUpdate]);

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z" />
        </svg>
        <p className="text-sm">No widgets yet. Pin charts from the chat to add them here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        {isEditing ? (
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
            className="text-xl font-bold bg-transparent border-b border-blue-500 outline-none text-gray-900 dark:text-gray-100"
            autoFocus
          />
        ) : (
          <h2
            className="text-xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600"
            onClick={() => setIsEditing(true)}
            title="Click to edit title"
          >
            {title}
          </h2>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {widgets
          .sort((a, b) => a.order - b.order)
          .map(widget => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              onRemove={handleRemoveWidget}
            />
          ))}
      </div>
    </div>
  );
}
