'use client';

import React, { useState } from 'react';

interface DatabaseConnectorProps {
  onConnected: (datasetId: string, datasetName: string) => void;
  onClose: () => void;
}

export default function DatabaseConnector({ onConnected, onClose }: DatabaseConnectorProps) {
  const [form, setForm] = useState({
    type: 'postgresql',
    host: '',
    port: '5432',
    database: '',
    username: '',
    password: '',
    ssl: false,
  });
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatus(null);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, action: 'test' }),
      });
      const data = await res.json();
      if (data.success) {
        setTables(data.tables || []);
        setStatus({ type: 'success', msg: `Connected! Found ${data.tables?.length || 0} tables.` });
      } else {
        setStatus({ type: 'error', msg: data.error || 'Connection failed' });
      }
    } catch {
      setStatus({ type: 'error', msg: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedTable) return;
    setConnecting(true);
    setStatus(null);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, action: 'import', table: selectedTable }),
      });
      const data = await res.json();
      if (data.datasetId) {
        onConnected(data.datasetId, data.datasetName);
      } else {
        setStatus({ type: 'error', msg: data.error || 'Import failed' });
      }
    } catch {
      setStatus({ type: 'error', msg: 'Import failed' });
    } finally {
      setConnecting(false);
    }
  };

  const update = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-lg w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Connect Database</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Database Type</label>
            <select value={form.type} onChange={e => update('type', e.target.value)} className={inputClass}>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Host</label>
              <input value={form.host} onChange={e => update('host', e.target.value)} placeholder="localhost" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
              <input value={form.port} onChange={e => update('port', e.target.value)} placeholder="5432" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Database</label>
            <input value={form.database} onChange={e => update('database', e.target.value)} placeholder="mydb" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input value={form.username} onChange={e => update('username', e.target.value)} placeholder="postgres" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => update('password', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ssl" checked={form.ssl} onChange={e => update('ssl', e.target.checked)} className="rounded" />
            <label htmlFor="ssl" className="text-sm text-gray-700 dark:text-gray-300">Use SSL</label>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testing || !form.host || !form.database}
            className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50 transition-colors"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {tables.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Table</label>
              <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} className={inputClass}>
                <option value="">Choose a table...</option>
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {status && (
            <p className={`text-sm ${status.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.msg}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!selectedTable || connecting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {connecting ? 'Importing...' : 'Import Table'}
          </button>
        </div>
      </div>
    </div>
  );
}
