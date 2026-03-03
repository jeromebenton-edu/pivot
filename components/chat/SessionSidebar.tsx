'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionSidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  isOpen: boolean;
}

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        return data.sessions || [];
      }
    } catch {
      // Silently fail — sidebar is non-critical
    }
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSessions().then(result => {
      if (!cancelled && result) setSessions(result);
    });
    return () => { cancelled = true; };
  }, [fetchSessions, currentSessionId]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions?id=${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        onNewSession();
      }
    } catch {
      // Silently fail
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Sidebar panel */}
      <div
        className={`absolute inset-y-0 left-0 z-10 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full pt-12 pb-4">
          <div className="px-3 mb-2">
            <button
              onClick={onNewSession}
              className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              + New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">No chat history</p>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSession(session.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectSession(session.id); }}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 group transition-colors cursor-pointer ${
                    currentSessionId === session.id
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm truncate flex-1">
                      {session.title || 'New conversation'}
                    </p>
                    <button
                      onClick={e => handleDelete(e, session.id)}
                      className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                      aria-label="Delete session"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {formatDate(session.updated_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
