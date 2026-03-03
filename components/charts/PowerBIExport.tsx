'use client';

import React, { useState, useMemo } from 'react';
import { ChartConfig } from '@/lib/types';
import { generateDAX } from '@/lib/powerbi/dax-generator';
import { generatePowerQuery } from '@/lib/powerbi/powerquery-generator';

interface PowerBIExportProps {
  config: ChartConfig;
  onClose: () => void;
}

export default function PowerBIExport({ config, onClose }: PowerBIExportProps) {
  const [tab, setTab] = useState<'dax' | 'powerquery'>('dax');
  const [copied, setCopied] = useState<string | null>(null);

  const dax = useMemo(() => generateDAX(config), [config]);
  const pq = useMemo(() => generatePowerQuery(config), [config]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API unavailable (non-HTTPS or unsupported browser) (#R10-18)
      setCopied(null);
    }
  };

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      active
        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Power BI Export</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{config.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3 bg-gray-50 dark:bg-gray-950">
          <button className={tabClass(tab === 'dax')} onClick={() => setTab('dax')}>
            DAX Measures
          </button>
          <button className={tabClass(tab === 'powerquery')} onClick={() => setTab('powerquery')}>
            Power Query M
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'dax' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Copy these DAX measures into Power BI Desktop: Modeling &gt; New Measure
              </p>
              {dax.measures.map((m, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{m.name}</span>
                    <button
                      onClick={() => handleCopy(m.formula, m.name)}
                      className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                    >
                      {copied === m.name ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="px-3 py-2 text-xs font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 overflow-x-auto">
                    {m.formula}
                  </pre>
                  <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                    {m.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {tab === 'powerquery' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pq.description}
              </p>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Power Query M Code</span>
                  <button
                    onClick={() => handleCopy(pq.code, 'pq')}
                    className="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                  >
                    {copied === 'pq' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="px-3 py-3 text-xs font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 overflow-x-auto whitespace-pre-wrap">
                  {pq.code}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
