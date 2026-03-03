import type { ParsedData, ColumnMeta } from './csv-parser';

export interface DataChunk {
  content: string;
  metadata: Record<string, unknown>;
}

export function chunkData(parsed: ParsedData, datasetName: string): DataChunk[] {
  const chunks: DataChunk[] = [];
  const { rows, columns } = parsed;

  // 1. Dataset overview chunk
  chunks.push({
    content: buildOverviewChunk(datasetName, columns, rows.length),
    metadata: { type: 'dataset_overview', dataset: datasetName },
  });

  // 2. Column summary chunks
  const numericCols = columns.filter(c => c.type === 'number');
  for (const col of numericCols) {
    // Filter NaN/Infinity — typeof check passes for these but they corrupt stats (#R7)
    const values = rows.map(r => r[col.name] as number).filter(v => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    // Use reduce instead of Math.min/max spread to avoid RangeError on large arrays (#29 R6)
    const min = values.reduce((a, b) => a < b ? a : b, values[0]);
    const max = values.reduce((a, b) => a > b ? a : b, values[0]);

    chunks.push({
      content: `Column "${col.name}" statistics for ${datasetName}: Count=${values.length}, Sum=${sum.toFixed(2)}, Average=${avg.toFixed(2)}, Min=${min}, Max=${max}`,
      metadata: { type: 'column_summary', dataset: datasetName, column: col.name },
    });
  }

  // 3. Row group chunks (groups of 20 rows)
  const groupSize = 20;
  for (let i = 0; i < rows.length; i += groupSize) {
    const group = rows.slice(i, i + groupSize);
    const content = group.map((row, idx) => {
      const parts = columns.map(c => `${c.name}: ${row[c.name]}`);
      return `Row ${i + idx + 1}: ${parts.join(', ')}`;
    }).join('\n');

    chunks.push({
      content: `${datasetName} rows ${i + 1}-${Math.min(i + groupSize, rows.length)}:\n${content}`,
      metadata: { type: 'row_group', dataset: datasetName, startRow: i + 1, endRow: Math.min(i + groupSize, rows.length) },
    });
  }

  // 4. Category/grouping chunks — group by first string column if exists
  // Skip high-cardinality columns to prevent excessive chunks (#R8)
  const firstStringCol = columns.find(c => c.type === 'string');
  const MAX_GROUPS = 200;
  if (firstStringCol && numericCols.length > 0) {
    const groups: Record<string, Record<string, unknown>[]> = {};
    for (const row of rows) {
      const key = String(row[firstStringCol.name] || 'Unknown');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    const groupEntries = Object.entries(groups);
    if (groupEntries.length > MAX_GROUPS) {
      console.warn(`[Chunker] Skipping group chunks: ${groupEntries.length} groups exceeds limit ${MAX_GROUPS} (high-cardinality column "${firstStringCol.name}")`);
    } else {

    for (const [groupName, groupRows] of groupEntries) {
      const summaries = numericCols.map(col => {
        // Filter NaN/Infinity and guard division by zero (#R7)
        const vals = groupRows.map(r => r[col.name] as number).filter(v => typeof v === 'number' && Number.isFinite(v));
        const sum = vals.reduce((a, b) => a + b, 0);
        const avg = vals.length > 0 ? sum / vals.length : 0;
        return `${col.name}: total=${sum.toFixed(2)}, count=${vals.length}, avg=${avg.toFixed(2)}`;
      });

      chunks.push({
        content: `${datasetName} group "${groupName}" (by ${firstStringCol.name}): ${groupRows.length} records. ${summaries.join('; ')}`,
        metadata: { type: 'group_summary', dataset: datasetName, groupBy: firstStringCol.name, groupValue: groupName },
      });
    }
    } // end else (not high-cardinality)
  }

  return chunks;
}

function buildOverviewChunk(name: string, columns: ColumnMeta[], rowCount: number): string {
  const colDescriptions = columns.map(c =>
    `${c.name} (${c.type})`
  ).join(', ');

  return `Dataset "${name}": ${rowCount} rows, ${columns.length} columns. Columns: ${colDescriptions}`;
}
