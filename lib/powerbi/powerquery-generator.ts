import { ChartConfig } from '@/lib/types';

export interface PowerQueryOutput {
  code: string;
  description: string;
}

// Sanitize identifiers/values used in Power Query M code to prevent injection (#R9-8)
function sanitizeMId(name: string): string {
  return name.replace(/[\[\]\(\)\n\r"\\]/g, '').slice(0, 128);
}
function sanitizeMValue(val: unknown): string {
  return String(val).replace(/"/g, '""').slice(0, 1000);
}

export function generatePowerQuery(config: ChartConfig): PowerQueryOutput {
  const xKey = sanitizeMId(config.xAxis?.dataKey || 'name');
  const yKey = sanitizeMId(config.yAxis?.dataKey || 'value');
  const title = config.title.replace(/[^a-zA-Z0-9 ]/g, '');

  // Build M code based on the chart data
  const columnTypes = inferColumnTypes(config);

  let code = `let\n`;
  code += `    // Source: Pivot BI Export - ${title}\n`;
  code += `    Source = Table.FromRecords({\n`;

  // Add first few rows as example data
  const sampleRows = config.data.slice(0, 3);
  sampleRows.forEach((row, i) => {
    const fields = Object.entries(row)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => {
        if (typeof v === 'number') return `${sanitizeMId(k)} = ${v}`;
        return `${sanitizeMId(k)} = "${sanitizeMValue(v)}"`;
      })
      .join(', ');
    code += `        [${fields}]${i < sampleRows.length - 1 ? ',' : ''}\n`;
  });

  code += `        // ... additional rows from your data source\n`;
  code += `    }),\n\n`;

  // Type casting
  code += `    // Set column types\n`;
  code += `    TypedTable = Table.TransformColumnTypes(Source, {\n`;
  const typeEntries = Object.entries(columnTypes).map(([col, type]) => {
    const mType = type === 'number' ? 'type number' : type === 'date' ? 'type date' : 'type text';
    return `        {"${col}", ${mType}}`;
  });
  code += typeEntries.join(',\n');
  code += `\n    }),\n\n`;

  // Transformations based on chart type
  switch (config.type) {
    case 'bar':
    case 'pie':
      code += `    // Sort by ${yKey} descending\n`;
      code += `    Sorted = Table.Sort(TypedTable, {{"${yKey}", Order.Descending}}),\n\n`;
      code += `    // Add index column for ranking\n`;
      code += `    Indexed = Table.AddIndexColumn(Sorted, "Rank", 1, 1, Int64.Type)\n`;
      break;

    case 'line':
    case 'area':
      code += `    // Sort by ${xKey} for time series\n`;
      code += `    Sorted = Table.Sort(TypedTable, {{"${xKey}", Order.Ascending}}),\n\n`;

      if (config.data.some(d => d.forecast !== undefined)) {
        code += `    // Split actual and forecast\n`;
        code += `    WithType = Table.AddColumn(Sorted, "DataType",\n`;
        code += `        each if [actual] <> null then "Actual" else "Forecast", type text)\n`;
      } else {
        code += `    // Add running total\n`;
        code += `    RunningTotal = Table.AddColumn(Sorted, "RunningTotal",\n`;
        code += `        each List.Sum(List.FirstN(Sorted[${yKey}], [${xKey}])), type number)\n`;
      }
      break;

    default:
      code += `    Result = TypedTable\n`;
  }

  code += `in\n`;
  // Reference the correct final step for each chart type (#R10-7)
  let finalStep: string;
  if (config.type === 'bar' || config.type === 'pie') {
    finalStep = 'Indexed';
  } else if (config.type === 'line' || config.type === 'area') {
    finalStep = config.data.some(d => d.forecast !== undefined) ? 'WithType' : 'RunningTotal';
  } else {
    finalStep = 'Result';
  }
  code += `    ${finalStep}`;

  const description = `Power Query M code for "${title}". This transforms the data for optimal Power BI visualization. Import into Power BI via Home > Transform Data > New Source > Blank Query, then paste in the Advanced Editor.`;

  return { code, description };
}

function inferColumnTypes(config: ChartConfig): Record<string, string> {
  const types: Record<string, string> = {};
  if (config.data.length === 0) return types;

  const firstRow = config.data[0];
  for (const [key, value] of Object.entries(firstRow)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') types[key] = 'number';
    else if (typeof value === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) && !isNaN(Date.parse(value))) types[key] = 'date'; // Strict date regex (#R9-16)
    else types[key] = 'string';
  }

  return types;
}
