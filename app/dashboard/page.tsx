'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Dashboard } from '@/lib/types';
import DashboardView from '@/components/dashboard/DashboardView';
import { authClient } from '@/lib/auth-client';

export default function DashboardPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard — redirect to login if unauthenticated
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.session) {
        router.replace('/login');
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

  const loadDashboards = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboards');
      if (res.ok) {
        const data = await res.json();
        setDashboards(data);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) loadDashboards();
  }, [authChecked, loadDashboards]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Dashboard' }),
      });
      if (res.ok) {
        const dashboard = await res.json();
        setDashboards(prev => [dashboard, ...prev]);
        setSelectedId(dashboard.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/dashboards?id=${id}`, { method: 'DELETE' });
    setDashboards(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selected = dashboards.find(d => d.id === selectedId);

  if (!authChecked || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboards</h1>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
        >
          {creating ? 'Creating...' : 'New Dashboard'}
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">No dashboards yet</p>
          <p className="text-sm">Create a dashboard and pin charts from the chat to build your view.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="space-y-1">
              {dashboards.map(d => (
                <div key={d.id} className="flex items-center group">
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      selectedId === d.id
                        ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {d.title}
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {selected ? (
              <DashboardView
                key={selected.id}
                dashboard={selected}
                onUpdate={(updated) => {
                  setDashboards(prev => prev.map(d => d.id === updated.id ? updated : d));
                }}
              />
            ) : (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                Select a dashboard from the sidebar
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
