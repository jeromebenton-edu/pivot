'use client';

import React, { useState } from 'react';
import UploadPanel from './UploadPanel';
import DatabaseConnector from './DatabaseConnector';

interface Dataset {
  id: string;
  name: string;
  type: 'builtin' | 'uploaded' | 'database';
}

interface DatasetSelectorProps {
  currentDatasetId: string;
  onDatasetChange: (datasetId: string) => void;
}

export default function DatasetSelector({ currentDatasetId, onDatasetChange }: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([
    { id: 'builtin', name: 'Supply Chain 2024', type: 'builtin' },
  ]);
  const [showUpload, setShowUpload] = useState(false);
  const [showConnector, setShowConnector] = useState(false);

  const handleUploadComplete = (datasetId: string, datasetName: string) => {
    setDatasets(prev => [...prev, { id: datasetId, name: datasetName, type: 'uploaded' }]);
    onDatasetChange(datasetId);
    setShowUpload(false);
  };

  const handleDBConnected = (datasetId: string, datasetName: string) => {
    setDatasets(prev => [...prev, { id: datasetId, name: datasetName, type: 'database' }]);
    onDatasetChange(datasetId);
    setShowConnector(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={currentDatasetId}
          onChange={e => onDatasetChange(e.target.value)}
          className="text-sm px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
        >
          {datasets.map(ds => (
            <option key={ds.id} value={ds.id}>
              {ds.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowUpload(true)}
          className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Upload CSV or Excel"
        >
          Upload
        </button>
        <button
          onClick={() => setShowConnector(true)}
          className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Connect to database"
        >
          Connect DB
        </button>
      </div>

      {showUpload && (
        <UploadPanel
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showConnector && (
        <DatabaseConnector
          onConnected={handleDBConnected}
          onClose={() => setShowConnector(false)}
        />
      )}
    </>
  );
}
