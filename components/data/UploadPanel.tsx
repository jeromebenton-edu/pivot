'use client';

import React, { useState, useRef } from 'react';

interface UploadPanelProps {
  onUploadComplete: (datasetId: string, datasetName: string) => void;
  onClose: () => void;
}

interface ColumnPreview {
  name: string;
  type: string;
  sampleValues: unknown[];
}

export default function UploadPanel({ onUploadComplete, onClose }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState<{ columns: ColumnPreview[]; rowCount: number } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');

    // Get preview
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('preview', 'true');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setPreview({ columns: data.columns, rowCount: data.rowCount });
      }
    } catch {
      setError('Failed to preview file');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress('Parsing file...');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgress('Uploading and embedding data...');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setProgress('Complete!');
        onUploadComplete(data.datasetId, data.datasetName);
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Upload Dataset</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Drop zone */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drop a CSV or Excel file here, or click to browse
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Supports .csv, .xlsx, .xls
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
            </div>
          )}

          {/* File selected + preview */}
          {file && (
            <div>
              <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => { setFile(null); setPreview(null); }} className="text-xs text-gray-400 hover:text-red-500">
                  Remove
                </button>
              </div>

              {preview && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {preview.rowCount} rows, {preview.columns.length} columns
                  </p>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full border border-gray-200 dark:border-gray-700 rounded">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800">
                          <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Column</th>
                          <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Type</th>
                          <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Sample</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.columns.map(col => (
                          <tr key={col.name} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-2 py-1 font-mono text-gray-900 dark:text-gray-100">{col.name}</td>
                            <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{col.type}</td>
                            <td className="px-2 py-1 text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                              {String(col.sampleValues[0] ?? '')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>
          )}

          {progress && !error && (
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-3">{progress}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || !preview}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {uploading ? 'Processing...' : 'Upload & Embed'}
          </button>
        </div>
      </div>
    </div>
  );
}
