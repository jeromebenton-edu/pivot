/**
 * CSV export for chart data.
 * Reuses the CSV escape logic from mcp-tools.ts.
 */

/** Escape a CSV field: double internal quotes, prefix formula chars */
function escapeCSV(s: string): string {
  let escaped = s.replace(/"/g, '""');
  if (/^[=+\-@\t\r\n|]/.test(escaped)) escaped = "'" + escaped;
  return `"${escaped}"`;
}

/** Convert chart data to a downloadable CSV string */
export function chartDataToCSV(data: Record<string, unknown>[], title?: string): string {
  if (!data || data.length === 0) return '';

  const keys = Object.keys(data[0]);
  const lines: string[] = [];

  // Optional title row
  if (title) {
    lines.push(escapeCSV(title));
    lines.push('');
  }

  // Header row
  lines.push(keys.map(k => escapeCSV(k)).join(','));

  // Data rows
  for (const row of data) {
    const values = keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return '""';
      if (typeof v === 'number') return String(v);
      return escapeCSV(String(v));
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/** Trigger a CSV download in the browser */
export function downloadCSV(data: Record<string, unknown>[], filename: string, title?: string): void {
  const csv = chartDataToCSV(data, title);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
