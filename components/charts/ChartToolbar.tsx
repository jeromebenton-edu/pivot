'use client';

import React, { useCallback, useState } from 'react';
import type { EChartsInstance } from './EChart';
import type { ChartConfig } from '@/lib/types';
import dynamic from 'next/dynamic';

const PowerBIExport = dynamic(() => import('./PowerBIExport'), { ssr: false });

interface ChartToolbarProps {
  chartInstance: EChartsInstance | null;
  title: string;
  data?: Record<string, unknown>[];
  chartConfig?: ChartConfig;
  onPinToDashboard?: (config: ChartConfig) => void;
}

export default function ChartToolbar({ chartInstance, title, data, chartConfig, onPinToDashboard }: ChartToolbarProps) {
  const [showPowerBI, setShowPowerBI] = useState(false);
  const [pinned, setPinned] = useState(false);

  const exportPNG = useCallback(() => {
    if (!chartInstance) return;
    const url = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}.png`;
    link.href = url;
    link.click();
  }, [chartInstance, title]);

  const exportSVG = useCallback(() => {
    if (!chartInstance) return;
    const url = chartInstance.getDataURL({
      type: 'svg',
    });
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}.svg`;
    link.href = url;
    link.click();
  }, [chartInstance, title]);

  const exportCSV = useCallback(() => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h];
        return val === null || val === undefined ? '' : String(val);
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, title]);

  const exportExcel = useCallback(async () => {
    if (!data || data.length === 0) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`);
  }, [data, title]);

  const exportPDF = useCallback(async () => {
    if (!chartInstance) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Title
    doc.setFontSize(16);
    doc.text(title, margin, 20);

    // Chart image
    const imgData = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = imgWidth * 0.5;
    doc.addImage(imgData, 'PNG', margin, 28, imgWidth, imgHeight);

    // Data table below chart
    if (data && data.length > 0) {
      let y = 28 + imgHeight + 10;
      const headers = Object.keys(data[0]);
      const colWidth = (pageWidth - margin * 2) / headers.length;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => {
        doc.text(h, margin + i * colWidth, y);
      });
      doc.setFont('helvetica', 'normal');
      y += 5;

      for (const row of data) {
        if (y > doc.internal.pageSize.getHeight() - 10) {
          doc.addPage();
          y = 15;
        }
        headers.forEach((h, i) => {
          const val = row[h];
          const text = val === null || val === undefined ? '' : String(val);
          doc.text(text, margin + i * colWidth, y);
        });
        y += 4;
      }
    }

    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
  }, [chartInstance, data, title]);

  const btnClass =
    'px-2 py-1 text-xs rounded border transition-colors ' +
    'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 ' +
    'hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Export:</span>
        <button onClick={exportPNG} className={btnClass} title="Download as PNG">
          PNG
        </button>
        <button onClick={exportSVG} className={btnClass} title="Download as SVG">
          SVG
        </button>
        <button onClick={exportPDF} className={btnClass + ' font-medium text-red-600 dark:text-red-400 border-red-200 dark:border-red-700'} title="Download as PDF with chart and data">
          PDF
        </button>
        {data && data.length > 0 && (
          <>
            <button onClick={exportCSV} className={btnClass} title="Download data as CSV">
              CSV
            </button>
            <button onClick={exportExcel} className={btnClass + ' font-medium text-green-600 dark:text-green-400 border-green-200 dark:border-green-700'} title="Download data as Excel">
              Excel
            </button>
          </>
        )}
        {chartConfig && (
          <>
            <button
              onClick={() => setShowPowerBI(true)}
              className={btnClass + ' font-medium text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700'}
              title="Export DAX & Power Query code"
            >
              Power BI
            </button>
            {onPinToDashboard && (
              <button
                onClick={() => {
                  onPinToDashboard(chartConfig);
                  setPinned(true);
                  setTimeout(() => setPinned(false), 2000);
                }}
                disabled={pinned}
                className={btnClass + (pinned
                  ? ' font-medium text-green-600 dark:text-green-400 border-green-200 dark:border-green-700'
                  : ' font-medium text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700'
                )}
                title="Pin chart to dashboard"
              >
                {pinned ? 'Pinned!' : 'Pin'}
              </button>
            )}
          </>
        )}
      </div>

      {showPowerBI && chartConfig && (
        <PowerBIExport config={chartConfig} onClose={() => setShowPowerBI(false)} />
      )}
    </>
  );
}
