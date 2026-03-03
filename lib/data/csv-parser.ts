import Papa from 'papaparse';

export interface ParsedData {
  rows: Record<string, unknown>[];
  columns: ColumnMeta[];
  rowCount: number;
}

export interface ColumnMeta {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  sampleValues: unknown[];
}

export function parseCSV(text: string): ParsedData {
  const result = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  // Log parse errors — corrupted rows can produce incorrect BI results (#R9-2)
  if (result.errors && result.errors.length > 0) {
    console.warn(`[CSV] ${result.errors.length} parse error(s)`);
    result.errors.slice(0, 5).forEach(e => console.warn(`[CSV]   Row ${e.row}: ${e.message}`));
  }

  // Filter out rows with parse errors to prevent corrupt data entering RAG (#R9-2)
  let rows = result.data as Record<string, unknown>[];
  if (result.errors && result.errors.length > 0) {
    const errorRows = new Set(result.errors.filter(e => e.row !== undefined).map(e => e.row));
    if (errorRows.size > 0) {
      const before = rows.length;
      rows = rows.filter((_, idx) => !errorRows.has(idx));
      console.warn(`[CSV] Filtered ${before - rows.length} rows with parse errors`);
    }
  }

  const columns = detectColumns(rows);

  return { rows, columns, rowCount: rows.length };
}

export function detectColumns(rows: Record<string, unknown>[]): ColumnMeta[] {
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]);
  return keys.map(name => {
    const samples = rows.slice(0, 5).map(r => r[name]);
    const nonNull = samples.filter(v => v !== null && v !== undefined && v !== '');

    let type: ColumnMeta['type'] = 'string';
    if (nonNull.length > 0) {
      if (nonNull.every(v => typeof v === 'number')) {
        type = 'number';
      } else if (nonNull.every(v => typeof v === 'boolean')) {
        type = 'boolean';
      } else if (nonNull.every(v => {
        const s = String(v);
        // Require date-like format with valid month (1-12) and day (1-31) ranges (#R8-1, #R9)
        return /^\d{4}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])|^(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/]\d{2,4}/.test(s) && !isNaN(Date.parse(s));
      })) {
        type = 'date';
      }
    }

    return { name, type, sampleValues: samples };
  });
}
