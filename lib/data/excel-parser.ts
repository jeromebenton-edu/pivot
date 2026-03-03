import * as XLSX from 'xlsx';
import type { ParsedData } from './csv-parser';
import { detectColumns } from './csv-parser';

export function parseExcel(buffer: ArrayBuffer): { sheets: string[]; data: Record<string, ParsedData> } {
  // Limit to first sheet to prevent zip-bomb / multi-sheet resource exhaustion (#R8-11)
  const workbook = XLSX.read(buffer, { type: 'array', sheets: 0 });

  // Only process the first sheet — sheets: 0 limits decoding, but SheetNames may list others (#R9-7)
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { sheets: [], data: {} };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return { sheets: [firstSheetName], data: {} };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const columns = detectColumns(rows);

  return {
    sheets: [firstSheetName],
    data: { [firstSheetName]: { rows, columns, rowCount: rows.length } },
  };
}

// detectColumns is now imported from csv-parser.ts to avoid duplication (#R9-10)
