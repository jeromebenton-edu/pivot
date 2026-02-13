import { z } from 'zod';
import { searchChunks, addChunksToVectorStore, initializeVectorStore } from './chroma';

// Tool schemas using Zod
export const semanticSearchSchema = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().optional().default(5).describe('Number of results to return'),
  filters: z.record(z.string(), z.any()).optional().describe('Metadata filters to apply')
});

export const aggregateDataSchema = z.object({
  operation: z.enum(['sum', 'avg', 'count', 'group_by']).describe('Aggregation operation'),
  field: z.string().optional().describe('Field to aggregate'),
  groupBy: z.string().optional().describe('Field to group by'),
  filters: z.record(z.string(), z.any()).optional().describe('Filters to apply before aggregation')
});

export const generateChartConfigSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']).describe('Type of chart to generate'),
  title: z.string().describe('Chart title'),
  data: z.array(z.any()).describe('Data points for the chart'),
  xAxis: z.string().optional().describe('X-axis field name'),
  yAxis: z.string().optional().describe('Y-axis field name'),
  series: z.string().optional().describe('Series field for grouping')
});

export const comparePeriodSchema = z.object({
  metric: z.string().describe('Metric to compare (revenue, orders, etc)'),
  period1: z.object({
    start: z.string().describe('Start date YYYY-MM-DD'),
    end: z.string().describe('End date YYYY-MM-DD')
  }),
  period2: z.object({
    start: z.string().describe('Start date YYYY-MM-DD'),
    end: z.string().describe('End date YYYY-MM-DD')
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
    console.log(`Searching for: "${query}" with limit ${limit}`);

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
    console.error('Semantic search error:', error);
    return {
      success: false,
      error: 'Failed to perform semantic search',
      results: []
    };
  }
}

export async function aggregateData(params: z.infer<typeof aggregateDataSchema>) {
  // This would typically query the actual database
  // For now, we'll return mock aggregated data
  const { operation, field, groupBy, filters } = params;

  // Mock implementation
  const mockResults = {
    sum: {
      revenue: 393744.62,
      orders: 659
    },
    avg: {
      order_value: 597.41,
      items_per_order: 1.4
    },
    count: {
      total_events: 2000,
      unique_users: 500,
      unique_products: 36
    },
    group_by: {
      category: {
        'Electronics': { count: 99, revenue: 89234.50 },
        'Clothing': { count: 126, revenue: 45123.75 },
        'Home & Garden': { count: 120, revenue: 67890.25 },
        'Sports & Outdoors': { count: 101, revenue: 78456.30 },
        'Books': { count: 103, revenue: 23456.78 },
        'Toys & Games': { count: 110, revenue: 89583.04 }
      },
      region: {
        'North America': { count: 167, revenue: 98234.50 },
        'Europe': { count: 162, revenue: 95678.90 },
        'Asia': { count: 176, revenue: 103456.78 },
        'South America': { count: 154, revenue: 96374.44 }
      }
    }
  };

  // Return appropriate mock data based on operation
  if (operation === 'group_by' && groupBy) {
    return {
      success: true,
      operation,
      groupBy,
      results: mockResults.group_by[groupBy as keyof typeof mockResults.group_by] || {}
    };
  }

  return {
    success: true,
    operation,
    field,
    results: mockResults[operation as keyof typeof mockResults] || {}
  };
}

// Generate chart configuration
export async function generateChartConfig(params: z.infer<typeof generateChartConfigSchema>) {
  const { chartType, title, data, xAxis, yAxis, series } = params;

  try {
    // Create Recharts-compatible configuration
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
  } catch (error) {
    return {
      success: false,
      error: 'Failed to generate chart configuration'
    };
  }
}

// Compare periods
export async function comparePeriods(params: z.infer<typeof comparePeriodSchema>) {
  const { metric, period1, period2 } = params;

  // Load data chunks for analysis
  const chunks = require('../data/samples/data_chunks.json');

  // Filter chunks by period
  const period1Data = chunks.filter((c: any) => {
    if (c.metadata?.date) {
      return c.metadata.date >= period1.start && c.metadata.date <= period1.end;
    }
    return false;
  });

  const period2Data = chunks.filter((c: any) => {
    if (c.metadata?.date) {
      return c.metadata.date >= period2.start && c.metadata.date <= period2.end;
    }
    return false;
  });

  // Calculate metrics
  const calculateMetric = (data: any[], metric: string) => {
    if (metric === 'revenue') {
      return data.reduce((sum, d) => sum + (d.metadata?.revenue || 0), 0);
    } else if (metric === 'orders') {
      return data.filter(d => d.metadata?.event_type === 'purchase').length;
    } else if (metric === 'avg_order_value') {
      const purchases = data.filter(d => d.metadata?.event_type === 'purchase');
      const totalRevenue = purchases.reduce((sum, d) => sum + (d.metadata?.revenue || 0), 0);
      return purchases.length > 0 ? totalRevenue / purchases.length : 0;
    }
    return 0;
  };

  const value1 = calculateMetric(period1Data, metric);
  const value2 = calculateMetric(period2Data, metric);
  const delta = value2 - value1;
  const percentChange = value1 !== 0 ? (delta / value1) * 100 : 0;

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
      percentChange: percentChange.toFixed(2),
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
    output = `"Title","${title}"\n`;
    findings.forEach((finding, idx) => {
      output += `"Finding ${idx + 1}","${finding}"\n`;
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

// Initialize the vector store with sample data
let isInitialized = false;

export async function initializeRAG() {
  if (isInitialized) {
    return { success: true, message: 'RAG already initialized' };
  }

  try {
    // Initialize vector store
    await initializeVectorStore();

    // Load sample chunks
    const chunks = require('../data/samples/data_chunks.json');
    await addChunksToVectorStore(chunks);

    isInitialized = true;
    return { success: true, message: `Initialized RAG with ${chunks.length} chunks` };
  } catch (error) {
    console.error('Failed to initialize RAG:', error);
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