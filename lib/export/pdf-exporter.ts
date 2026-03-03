/**
 * PDF export using ECharts getDataURL() for chart images.
 * Generates a minimal PDF without external dependencies.
 *
 * Note: This produces a basic PDF with the chart image and data table.
 * For production use, consider a proper PDF library (jsPDF, pdfmake).
 */

import type { ChartConfig } from '@/lib/types';

/** Generate a printable HTML page with chart image and data table, then trigger print dialog */
export function exportChartAsPDF(
  chartDataURL: string,
  config: ChartConfig,
): void {
  const { title, data } = config;
  const keys = data.length > 0 ? Object.keys(data[0]) : [];

  // Build data table HTML
  let tableHTML = '';
  if (data.length > 0) {
    const headerCells = keys.map(k => `<th style="padding:4px 8px;border:1px solid #ddd;text-align:left">${escapeHTML(k)}</th>`).join('');
    const bodyRows = data.map(row => {
      const cells = keys.map(k => {
        const v = row[k];
        return `<td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(String(v ?? ''))}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    tableHTML = `
      <h3 style="margin-top:20px">Data</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHTML(title || 'Chart Export')}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h2>${escapeHTML(title || 'Chart')}</h2>
      <img src="${chartDataURL}" style="max-width:100%;height:auto" />
      ${tableHTML}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
