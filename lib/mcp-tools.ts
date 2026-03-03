import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { searchChunks, addChunksToVectorStore, initializeVectorStore } from './chroma';
import {
  initializeSupplyChainDB,
  isDBAvailable,
  aggregateData as sqlAggregateData,
} from './db/supply-chain';
import type { DataChunk } from '@/lib/types';
import dataChunksRaw from '../data/samples/data_chunks.json';

// Cast once to typed DataChunk array
const dataChunks = dataChunksRaw as unknown as DataChunk[];

const log = createLogger('mcp-tools');

// Tool schemas using Zod
export const semanticSearchSchema = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().optional().default(5).describe('Number of results to return'),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Metadata filters to apply'), // Typed filter values (#17)
});

export const aggregateDataSchema = z.object({
  operation: z.enum(['sum', 'avg', 'count', 'group_by']).describe('Aggregation operation'),
  field: z.string().optional().describe('Field to aggregate'),
  groupBy: z.string().optional().describe('Field to group by'),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Filters to apply before aggregation'),
});

export const generateChartConfigSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']).describe('Type of chart to generate'),
  title: z.string().describe('Chart title'),
  data: z.array(z.record(z.string(), z.unknown())).describe('Data points for the chart'),
  xAxis: z.string().optional().describe('X-axis field name'),
  yAxis: z.string().optional().describe('Y-axis field name'),
  series: z.string().optional().describe('Series field for grouping')
});

// Date format regex for YYYY-MM-DD (#R8)
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format');

export const comparePeriodSchema = z.object({
  metric: z.string().describe('Metric to compare (revenue, orders, etc)'),
  period1: z.object({
    start: dateString.describe('Start date YYYY-MM-DD'),
    end: dateString.describe('End date YYYY-MM-DD')
  }),
  period2: z.object({
    start: dateString.describe('Start date YYYY-MM-DD'),
    end: dateString.describe('End date YYYY-MM-DD')
  })
});

export const exportSummarySchema = z.object({
  title: z.string().describe('Summary title'),
  findings: z.array(z.string()).describe('Key findings'),
  format: z.enum(['json', 'csv', 'markdown']).optional().default('json')
});

// Tool implementations
export async function semanticSearch(params: z.infer<typeof semanticSearchSchema>) {
  try {
    const { query, limit, filters } = params;
    log.info('Searching', { query, limit });

    const results = await searchChunks(query, limit, filters);

    return {
      success: true,
      results: results.map(result => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        relevance_score: result.score
      })),
      total_results: results.length,
      query: query
    };
  } catch (error) {
    log.error('Semantic search error', { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: 'Failed to perform semantic search',
      results: []
    };
  }
}

// Mock data used as fallback when PostgreSQL is not available
const mockResults = {
  sum: { revenue: 53426420.61, orders: 3199 },
  avg: { order_value: 16700.98, lead_time: 13.3 },
  count: { total_events: 10004, unique_suppliers: 15, unique_materials: 60 },
  group_by: {
    category: {
      'Industrial Bearings': { count: 701, revenue: 12964552.23 },
      'Structural Fabrications': { count: 637, revenue: 11527533.17 },
      'Electronic Assemblies': { count: 644, revenue: 10615538.25 },
      'Hydraulic Components': { count: 554, revenue: 7752200.88 },
      'Polymer & Seal Kits': { count: 397, revenue: 7512731.69 },
      'Precision Tooling': { count: 266, revenue: 3053864.39 },
    },
    region: {
      'Europe': { count: 1059, revenue: 18114780.19 },
      'North America': { count: 1072, revenue: 17634671.05 },
      'Asia Pacific': { count: 634, revenue: 10229051.55 },
      'Latin America': { count: 434, revenue: 7447917.82 },
    },
  },
};

export async function aggregateData(params: z.infer<typeof aggregateDataSchema>) {
  const { operation, field, groupBy, filters } = params;

  // Use PostgreSQL if available, otherwise fall back to mock data
  if (isDBAvailable()) {
    try {
      const result = await sqlAggregateData({ operation, field, groupBy, filters: filters as Record<string, unknown> | undefined });
      return { ...result, source: 'database' };
    } catch (error) {
      log.error('SQL query failed, falling back to mock', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Fallback: mock data — prominently labeled so LLM knows these are estimates (#2/#9)
  // Return field-appropriate mock data instead of ignoring field param (#7 R6)
  log.warn('Using sample data (PostgreSQL not available)');
  const sampleWarning = 'WARNING: These are estimated sample values, not verified database results. PostgreSQL is not configured.';
  if (operation === 'group_by' && groupBy) {
    return {
      success: true,
      operation,
      groupBy,
      results: mockResults.group_by[groupBy as keyof typeof mockResults.group_by] || {},
      _sampleData: true,
      _warning: sampleWarning,
      source: 'mock_fallback',
    };
  }

  // Map field to closest mock data key (#7 R6)
  let mockKey: keyof typeof mockResults = operation as keyof typeof mockResults;
  if (operation === 'sum' || operation === 'avg') mockKey = operation;
  return {
    success: true,
    operation,
    field: field || 'total_cost',
    results: mockResults[mockKey] || {},
    _sampleData: true,
    _warning: sampleWarning,
    source: 'mock_fallback',
  };
}

// Generate chart configuration — pure data transform, no I/O (#36)
export async function generateChartConfig(params: z.infer<typeof generateChartConfigSchema>) {
  const { chartType, title, data, xAxis, yAxis, series } = params;

  const config = {
    type: chartType,
    title,
    data: data || [],
    width: 600,
    height: 400,
    margin: { top: 20, right: 30, bottom: 40, left: 50 },
    xAxis: xAxis ? { dataKey: xAxis, label: xAxis } : undefined,
    yAxis: yAxis ? { dataKey: yAxis, label: yAxis } : undefined,
    series: series || yAxis || 'value',
    colors: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
  };

  return {
    success: true,
    config,
    message: `Generated ${chartType} chart configuration`
  };
}

// Compare periods
export async function comparePeriods(params: z.infer<typeof comparePeriodSchema>) {
  const { metric, period1, period2 } = params;

  // Use statically imported data chunks (#7)
  // Exclude summary/aggregate chunks to prevent double-counting (#5)
  const transactionChunks = dataChunks.filter((c) => {
    const type = c.metadata?.type;
    return !type || !String(type).includes('summary');
  });

  // Filter chunks by period
  const period1Data = transactionChunks.filter((c) => {
    if (c.metadata?.date) {
      return (c.metadata.date as string) >= period1.start && (c.metadata.date as string) <= period1.end;
    }
    return false;
  });

  const period2Data = transactionChunks.filter((c) => {
    if (c.metadata?.date) {
      return (c.metadata.date as string) >= period2.start && (c.metadata.date as string) <= period2.end;
    }
    return false;
  });

  // Calculate metrics — use quantity from metadata for order counting (#6 R6)
  const calculateMetric = (data: DataChunk[], metric: string) => {
    if (metric === 'revenue') {
      return data.reduce((sum, d) => sum + (Number(d.metadata?.revenue) || 0), 0);
    } else if (metric === 'orders') {
      // Sum quantity field from chunks, not just count chunks (#6 R6)
      return data
        .filter(d => d.metadata?.event_type === 'purchase_order')
        .reduce((sum, d) => sum + (Number(d.metadata?.quantity) || Number(d.metadata?.orders) || 1), 0);
    } else if (metric === 'avg_order_value') {
      const purchases = data.filter(d => d.metadata?.event_type === 'purchase_order');
      const totalRevenue = purchases.reduce((sum, d) => sum + (Number(d.metadata?.revenue) || 0), 0);
      const totalOrders = purchases.reduce((sum, d) => sum + (Number(d.metadata?.quantity) || Number(d.metadata?.orders) || 1), 0);
      return totalOrders > 0 ? totalRevenue / totalOrders : 0;
    }
    return 0;
  };

  const value1 = calculateMetric(period1Data, metric);
  const value2 = calculateMetric(period2Data, metric);
  const delta = value2 - value1;
  // Return null for zero-division instead of misleading 0 (#34)
  const percentChange = value1 !== 0 ? Math.round((delta / value1) * 10000) / 100 : null;

  return {
    success: true,
    metric,
    period1: {
      ...period1,
      value: value1,
      dataPoints: period1Data.length
    },
    period2: {
      ...period2,
      value: value2,
      dataPoints: period2Data.length
    },
    comparison: {
      delta,
      percentChange,
      trend: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'stable'
    }
  };
}

// Export summary
export async function exportSummary(params: z.infer<typeof exportSummarySchema>) {
  const { title, findings, format } = params;

  let output: string | { title: string; findings: string[]; timestamp: string };

  if (format === 'markdown') {
    output = `# ${title}\n\n`;
    findings.forEach((finding, idx) => {
      output += `${idx + 1}. ${finding}\n`;
    });
  } else if (format === 'csv') {
    // Escape CSV fields: double internal quotes, prefix formula chars (#2)
    const escapeCSV = (s: string) => {
      let escaped = s.replace(/"/g, '""');
      if (/^[=+\-@\t\r\n|]/.test(escaped)) escaped = "'" + escaped; // Include \n, | (#35, #9 R6)
      return `"${escaped}"`;
    };
    output = `"Title",${escapeCSV(title)}\n`;
    findings.forEach((finding, idx) => {
      output += `"Finding ${idx + 1}",${escapeCSV(finding)}\n`;
    });
  } else {
    output = {
      title,
      findings,
      timestamp: new Date().toISOString()
    };
  }

  return {
    success: true,
    format,
    output,
    message: `Summary exported in ${format} format`
  };
}

// Use globalThis to survive HMR in Next.js dev mode (#14)
const globalRAG = globalThis as unknown as {
  __pivotRAGInitialized?: boolean;
  __pivotMonthlySummaries?: Array<{ month: string; revenue: number }> | null;
};
if (globalRAG.__pivotRAGInitialized === undefined) globalRAG.__pivotRAGInitialized = false;
if (globalRAG.__pivotMonthlySummaries === undefined) globalRAG.__pivotMonthlySummaries = null;

export function getMonthlySummaries(): Array<{ month: string; revenue: number }> | null {
  return globalRAG.__pivotMonthlySummaries ?? null;
}

export async function initializeRAG() {
  if (globalRAG.__pivotRAGInitialized) {
    return { success: true, message: 'RAG already initialized' };
  }

  try {
    await initializeVectorStore();

    // Initialize PostgreSQL SQL layer (no-op if DATABASE_URL not set)
    await initializeSupplyChainDB();

    await addChunksToVectorStore(dataChunks);

    // Pre-extract monthly summaries for forecast route
    const monthlySummaries: Array<{ month: string; revenue: number }> = [];
    for (const chunk of dataChunks) {
      if (chunk.metadata?.type === 'monthly_summary') {
        monthlySummaries.push({
          month: chunk.metadata.month as string,
          revenue: chunk.metadata.revenue as number,
        });
      }
    }
    monthlySummaries.sort((a, b) => a.month.localeCompare(b.month));
    globalRAG.__pivotMonthlySummaries = monthlySummaries;
    log.info('Pre-extracted monthly summaries for forecasting', { count: monthlySummaries.length });

    globalRAG.__pivotRAGInitialized = true;
    return { success: true, message: `Initialized RAG with ${dataChunks.length} chunks` };
  } catch (error) {
    // Log full error with stack trace for debugging (#8 R6)
    log.error('Failed to initialize RAG', { error: error instanceof Error ? error.stack : String(error) });
    return { success: false, error: 'Failed to initialize RAG system' };
  }
}

// Export all tools with their schemas
export const tools = [
  {
    name: 'semantic_search',
    description: 'Search for relevant data using natural language queries',
    schema: semanticSearchSchema,
    handler: semanticSearch
  },
  {
    name: 'aggregate_data',
    description: 'Perform aggregations on the data (sum, average, count, group by)',
    schema: aggregateDataSchema,
    handler: aggregateData
  },
  {
    name: 'generate_chart_config',
    description: 'Generate a configuration for rendering charts (line, bar, pie, scatter, area)',
    schema: generateChartConfigSchema,
    handler: generateChartConfig
  },
  {
    name: 'compare_periods',
    description: 'Compare metrics between two time periods',
    schema: comparePeriodSchema,
    handler: comparePeriods
  },
  {
    name: 'export_summary',
    description: 'Export analysis summary in various formats',
    schema: exportSummarySchema,
    handler: exportSummary
  }
];