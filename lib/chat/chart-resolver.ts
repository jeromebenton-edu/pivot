/**
 * Chart resolver for the chat route.
 *
 * Extracts the keyword→chart config logic and forecast detection from the
 * monolithic chat route into a standalone, testable module.
 */

import { createLogger } from '@/lib/logger';
import { smartForecast } from '@/lib/forecasting';
import { getMonthlySummaries } from '@/lib/mcp-tools';
import { validateChartConfig } from '@/lib/validation';
import chartSamples from '@/data/samples/chart_samples.json';

const log = createLogger('chart-resolver');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface ForecastResult {
  formattedText: string;
  chartConfig: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATASET_END_YEAR = 2024;

const FORECAST_KEYWORDS = [
  'forecast', 'predict', 'sarima', 'arima', 'projection', 'future', 'next month',
  'estimate', 'procurement forecast', 'spend forecast', 'demand forecast',
];

const VISUALIZATION_KEYWORDS = [
  'chart', 'graph', 'visualiz', 'show', 'trend', 'compare', 'breakdown',
  'break down', 'distribution', 'visual', 'plot', 'display', 'illustrate', 'diagram',
];

const SCATTER_KEYWORDS = [
  'scatter', 'correlation', 'relationship between', 'x vs y', 'versus',
];

const ANALYTICAL_KEYWORDS = ['which', 'best', 'worst', 'top', 'rank', 'highest', 'lowest'];

const DATA_KEYWORDS = [
  'by product', 'by region', 'by supplier', 'by month', 'by category',
  'rate', 'defect', 'quality', 'change in q', 'drove',
];

const PRODUCT_LINE_NAMES = [
  'Industrial Bearings', 'Electronic Assemblies', 'Hydraulic Components',
  'Structural Fabrications', 'Polymer & Seal Kits', 'Precision Tooling',
];

const REGION_NAMES = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function shouldForecast(query: string): boolean {
  const q = query.toLowerCase();
  const yearMatch = q.match(/\b(20\d{2})\b/);
  const mentionedYear = yearMatch ? parseInt(yearMatch[1]) : null;
  const mentionsFutureYear = mentionedYear !== null && mentionedYear > DATASET_END_YEAR;
  return FORECAST_KEYWORDS.some(kw => q.includes(kw)) || mentionsFutureYear;
}

export function shouldChart(query: string): boolean {
  const q = query.toLowerCase();
  return VISUALIZATION_KEYWORDS.some(kw => q.includes(kw))
    || ANALYTICAL_KEYWORDS.some(kw => q.includes(kw))
    || DATA_KEYWORDS.some(kw => q.includes(kw));
}

/**
 * Resolve a chart configuration from the query keywords and RAG sources.
 * Returns null if no chart is appropriate for the query.
 */
export function resolveChart(
  query: string,
  sources: Source[],
): Record<string, unknown> | null {
  const q = query.toLowerCase();
  const wantsBarChart = q.includes('plot') && !q.includes('line');
  let chartConfig: Record<string, unknown> | null = null;

  // --- Entity-specific chart config from RAG sources ---
  chartConfig = resolveProductChart(q, sources);
  if (!chartConfig) chartConfig = resolveRegionChart(q, sources, wantsBarChart);
  if (!chartConfig) chartConfig = resolveSupplierChart(q, sources);
  if (!chartConfig) chartConfig = resolveKeywordChart(q, sources, wantsBarChart);

  // Validate chart config if one was generated
  if (chartConfig) {
    const validation = validateChartConfig(chartConfig);
    if (validation.valid && validation.cleaned) {
      return validation.cleaned;
    }
    log.warn('Chart config invalid, discarding');
    return null;
  }

  return null;
}

/**
 * Resolve a forecast. Returns formatted text + chart config, or null on failure.
 * Uses SARIMAX microservice with weighted-average fallback via cached monthly summaries.
 */
export async function resolveForecast(query: string): Promise<ForecastResult | null> {
  const q = query.toLowerCase();

  try {
    const yearMatch = q.match(/\b(20\d{2})\b/);
    const mentionedYear = yearMatch ? parseInt(yearMatch[1]) : null;
    const mentionsFutureYear = mentionedYear !== null && mentionedYear > DATASET_END_YEAR;
    const targetYear = mentionedYear && mentionedYear > DATASET_END_YEAR ? mentionedYear : DATASET_END_YEAR + 1;

    let steps = 1;
    let months: string[];

    const fmtMonth = (yr: number, m: number) => `${yr}-${String(m).padStart(2, '0')}`;
    const genFullYear = (yr: number) => Array.from({ length: 12 }, (_, i) => fmtMonth(yr, i + 1));

    if (q.includes('monthly forecast') || q.includes('all months') ||
        (q.includes('forecast') && q.includes('full year'))) {
      months = genFullYear(targetYear);
      steps = 12;
    } else {
      const nextMonthsMatch = q.match(/(?:next\s+)?(\d+|six|three|four|five|seven|eight|nine|ten|eleven|twelve)\s+month/);
      const numberWords: Record<string, number> = {
        'three': 3, 'four': 4, 'five': 5, 'six': 6,
        'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12,
      };

      if (nextMonthsMatch) {
        const matchText = nextMonthsMatch[1];
        steps = numberWords[matchText] || parseInt(matchText) || 6;
        steps = Math.min(steps, 12);
        months = Array.from({ length: steps }, (_, i) => fmtMonth(targetYear, i + 1));
      } else if (q.includes('january') && q.includes('june')) {
        months = Array.from({ length: 6 }, (_, i) => fmtMonth(targetYear, i + 1));
        steps = 6;
      } else if (q.includes('q1') && q.includes('q2')) {
        months = Array.from({ length: 6 }, (_, i) => fmtMonth(targetYear, i + 1));
        steps = 6;
      } else {
        const specificMonth = MONTH_NAMES.findIndex(m => q.includes(m));
        if (specificMonth >= 0) {
          months = [fmtMonth(targetYear, specificMonth + 1)];
          steps = 1;
        } else if (mentionsFutureYear) {
          months = genFullYear(targetYear);
          steps = 12;
        } else {
          months = [fmtMonth(targetYear, 1)];
          steps = 1;
        }
      }
    }

    const wantsBar = q.includes('plot') || q.includes('bar chart');
    const chartTypeForForecast = wantsBar ? 'bar' as const : 'line' as const;

    const cachedSummaries = getMonthlySummaries();
    if (cachedSummaries && cachedSummaries.length >= 3) {
      const smartResult = await smartForecast(cachedSummaries, steps);
      const forecastResult = smartResult.forecasts;
      if (forecastResult.length > 0) {
        const titleRange = months.length === 1 ? months[0] : `${months[0]} - ${months[months.length - 1]}`;
        let formattedText = `**Procurement Spend Forecast for ${titleRange}**\n\n`;
        months.forEach((month: string, index: number) => {
          const f = forecastResult[index];
          if (!f) return;
          formattedText += `📊 **${month}: $${f.forecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n`;
          formattedText += `   95% CI: [$${f.confidence.lower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${f.confidence.upper.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]\n\n`;
        });
        const totalForecast = forecastResult.reduce((sum, f) => sum + f.forecast, 0);
        const avgForecast = forecastResult.length > 0 ? totalForecast / forecastResult.length : 0;
        formattedText += `**Summary:**\n`;
        formattedText += `- Total ${steps}-month forecast: $${totalForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        formattedText += `- Average monthly forecast: $${avgForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        formattedText += `- Historical monthly average: $${forecastResult[0].historicalMean.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        formattedText += `*Method: ${smartResult.method}${smartResult.fallback ? ' (fallback)' : ''}*`;

        const chartData = [
          ...cachedSummaries.map(d => ({ month: d.month, actual: d.revenue, forecast: null as number | null, lowerBound: null as number | null, upperBound: null as number | null })),
          ...months.map((month: string, index: number) => ({
            month,
            actual: null as number | null,
            forecast: forecastResult[index]?.forecast ?? null,
            lowerBound: forecastResult[index]?.confidence.lower ?? null,
            upperBound: forecastResult[index]?.confidence.upper ?? null,
          })),
        ];

        const forecastChartConfig = {
          type: chartTypeForForecast,
          title: months.length === 1 ? `Procurement Spend Forecast for ${months[0]}` : `Procurement Spend Forecast: ${months[0]} - ${months[months.length - 1]}`,
          data: chartData,
          xAxis: { dataKey: 'month', label: 'Month' },
          yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
          series: ['actual', 'forecast'],
          colors: ['#3B82F6', '#EF4444'],
          height: 400,
        };

        return { formattedText, chartConfig: forecastChartConfig };
      }
    }
  } catch (error) {
    log.error('Forecast generation error', { error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal resolvers
// ---------------------------------------------------------------------------

function resolveProductChart(query: string, sources: Source[]): Record<string, unknown> | null {
  const mentionedProduct = PRODUCT_LINE_NAMES.find(p => query.includes(p.toLowerCase()));
  if (!mentionedProduct) return null;

  const isRegionQuery = ['region', 'across'].some(k => query.includes(k));
  const isTrendQuery = ['trend', 'monthly', 'month'].some(k => query.includes(k));

  if (isRegionQuery) {
    const regionData = sources
      .filter(s => s.metadata?.type === 'product_region_summary' && s.metadata?.category === mentionedProduct)
      .map(s => ({ name: String(s.metadata.region), value: Number(s.metadata.revenue) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (regionData.length >= 2) {
      return {
        type: 'bar', title: `${mentionedProduct} Spend by Region`,
        data: regionData,
        xAxis: { dataKey: 'name', label: 'Region' },
        yAxis: { dataKey: 'value', label: 'Spend ($)' },
        height: 400,
      };
    }
  } else if (isTrendQuery) {
    const monthData = sources
      .filter(s => s.metadata?.type === 'product_monthly_summary' && s.metadata?.category === mentionedProduct)
      .map(s => ({ name: String(s.metadata.month), value: Number(s.metadata.revenue) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (monthData.length >= 3) {
      return {
        type: 'line', title: `${mentionedProduct} Monthly Spend`,
        data: monthData,
        xAxis: { dataKey: 'name', label: 'Month' },
        yAxis: { dataKey: 'value', label: 'Spend ($)' },
        height: 400,
      };
    }
  }
  return null;
}

function resolveRegionChart(query: string, sources: Source[], _wantsBarChart: boolean): Record<string, unknown> | null {
  const mentionedRegion = REGION_NAMES.find(r => query.includes(r.toLowerCase()));
  if (!mentionedRegion) return null;

  const isTrendQuery = ['trend', 'monthly', 'month', 'show'].some(k => query.includes(k));
  const isProductQuery = ['product', 'category', 'breakdown', 'product line'].some(k => query.includes(k));

  if (isTrendQuery && !isProductQuery) {
    const monthData = sources
      .filter(s => s.metadata?.type === 'region_monthly_summary' && s.metadata?.region === mentionedRegion)
      .map(s => ({ name: String(s.metadata.month), value: Number(s.metadata.revenue) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (monthData.length >= 3) {
      return {
        type: 'line', title: `${mentionedRegion} Monthly Procurement Spend`,
        data: monthData,
        xAxis: { dataKey: 'name', label: 'Month' },
        yAxis: { dataKey: 'value', label: 'Spend ($)' },
        height: 400,
      };
    }
  } else if (isProductQuery) {
    const productData = sources
      .filter(s => s.metadata?.type === 'product_region_summary' && s.metadata?.region === mentionedRegion)
      .map(s => ({ name: String(s.metadata.category), value: Number(s.metadata.revenue) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (productData.length >= 2) {
      return {
        type: 'bar', title: `${mentionedRegion} Spend by Product Line`,
        data: productData,
        xAxis: { dataKey: 'name', label: 'Product Line' },
        yAxis: { dataKey: 'value', label: 'Spend ($)' },
        height: 400,
      };
    }
  }
  return null;
}

function resolveSupplierChart(query: string, sources: Source[]): Record<string, unknown> | null {
  const isSupplierQuery = ['supplier', 'vendor'].some(k => query.includes(k));
  const isOTDQuery = ['otd', 'on-time', 'delivery'].some(k => query.includes(k));

  if (isSupplierQuery && isOTDQuery) {
    const supplierData = sources
      .filter(s => s.metadata?.type === 'supplier_summary' && s.metadata?.otd_rate)
      .map(s => ({ name: String(s.metadata.supplier_name), value: Number(s.metadata.otd_rate) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    if (supplierData.length >= 3) {
      return {
        type: 'bar', title: 'Top Suppliers by On-Time Delivery Rate',
        data: supplierData,
        xAxis: { dataKey: 'name', label: 'Supplier' },
        yAxis: { dataKey: 'value', label: 'OTD Rate (%)' },
        height: 400,
      };
    }
    return { ...(chartSamples.supplierPerformance as Record<string, unknown>), sampleData: true };
  }
  return null;
}

function resolveKeywordChart(
  query: string,
  sources: Source[],
  wantsBarChart: boolean,
): Record<string, unknown> | null {
  // Helper to convert "2024-07" to "Jul"
  const shortMonth = (m: string) => SHORT_MONTH_NAMES[parseInt(m.split('-')[1], 10) - 1];
  const monthIndex = (m: string) => parseInt(m.split('-')[1], 10);

  const quarterPattern = /q[1-4]|quarter/i;
  const hasQuarterComparison = quarterPattern.test(query) && (query.includes('vs') || query.includes('compare') || query.includes('versus'));

  const singleQuarterMatch = /\bq([1-4])\b/i.exec(query);

  if (hasQuarterComparison) {
    return resolveQuarterComparison(query, shortMonth, monthIndex);
  }

  if (singleQuarterMatch) {
    return resolveSingleQuarter(singleQuarterMatch, shortMonth, monthIndex);
  }

  if (query.includes('on-time') || query.includes('otd') || query.includes('delivery rate')) {
    return resolveDeliveryChart(query, sources);
  }

  if (query.includes('defect') || query.includes('quality')) {
    return resolveQualityChart(query, sources);
  }

  if (query.includes('lead time') || query.includes('lead-time')) {
    return resolveLeadTimeChart(sources);
  }

  if (query.includes('supplier') && !query.includes('trend') && !query.includes('month')) {
    return { ...(chartSamples.supplierPerformance as Record<string, unknown>), sampleData: true };
  }

  if (query.includes('trend') || query.includes('month') || query.includes('time')) {
    return { ...(chartSamples.monthlyTrend as Record<string, unknown>), sampleData: true };
  }

  if (query.includes('category') || query.includes('product')) {
    return resolveCategoryChart(sources);
  }

  if (query.includes('region') || query.includes('location') || query.includes('facility')) {
    return resolveGenericRegionChart(sources, wantsBarChart);
  }

  // Scatter chart detection
  if (SCATTER_KEYWORDS.some(kw => query.includes(kw))) {
    return resolveScatterChart(sources);
  }

  // Waterfall chart detection
  if (query.includes('waterfall') || (query.includes('change') && query.includes('month'))) {
    return resolveWaterfallChart();
  }

  // Default fallback
  return resolveDefaultChart(sources);
}

// --- Quarter helpers ---

function resolveQuarterComparison(
  query: string,
  shortMonth: (m: string) => string,
  monthIndex: (m: string) => number,
): Record<string, unknown> {
  const q3Mentioned = /q3|third quarter|jul|aug|sep|july|august|september/i.test(query);
  const q4Mentioned = /q4|fourth quarter|oct|nov|dec|october|november|december/i.test(query);

  const monthlyData = (chartSamples.monthlyTrend as { data: Array<{ month: string; revenue: number }> }).data;

  if (q3Mentioned && q4Mentioned) {
    const q3q4Data = monthlyData.slice(6);
    const q3Total = monthlyData.slice(6, 9).reduce((sum, d) => sum + d.revenue, 0);
    const q4Total = monthlyData.slice(9, 12).reduce((sum, d) => sum + d.revenue, 0);
    const percentChange = q3Total !== 0 ? ((q4Total - q3Total) / q3Total * 100).toFixed(1) : 'N/A';
    return {
      type: 'line',
      title: percentChange === 'N/A' ? 'Q3 vs Q4 Procurement Spend' : `Q3 vs Q4 Procurement Spend (Q4 was ${percentChange}% ${q4Total > q3Total ? 'higher' : 'lower'})`,
      data: q3q4Data.map(d => ({ ...d, month: shortMonth(d.month), quarter: monthIndex(d.month) <= 9 ? 'Q3' : 'Q4' })),
      xAxis: { dataKey: 'month', label: 'Month' },
      yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
      height: 400,
    };
  }

  return {
    type: 'line', title: 'Quarterly Procurement Spend',
    data: monthlyData.map(d => ({ ...d, month: shortMonth(d.month), quarter: `Q${Math.ceil(monthIndex(d.month) / 3)}` })),
    xAxis: { dataKey: 'month', label: 'Month' },
    yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
    height: 400,
  };
}

function resolveSingleQuarter(
  match: RegExpExecArray,
  shortMonth: (m: string) => string,
  monthIndex: (m: string) => number,
): Record<string, unknown> {
  const qNum = parseInt(match[1]);
  const monthlyData = (chartSamples.monthlyTrend as { data: Array<{ month: string; revenue: number }> }).data;
  const qStart = (qNum - 1) * 3;

  if (qNum > 1) {
    const prevQStart = qStart - 3;
    const currentQ = monthlyData.slice(qStart, qStart + 3);
    const prevQ = monthlyData.slice(prevQStart, prevQStart + 3);
    const currentQTotal = currentQ.reduce((sum, d) => sum + d.revenue, 0);
    const prevQTotal = prevQ.reduce((sum, d) => sum + d.revenue, 0);
    const pctChange = prevQTotal !== 0 ? ((currentQTotal - prevQTotal) / prevQTotal * 100).toFixed(1) : 'N/A';

    return {
      type: 'bar',
      title: pctChange === 'N/A' ? `Q${qNum - 1} vs Q${qNum} Monthly Procurement Spend` : `Q${qNum - 1} vs Q${qNum} Monthly Procurement Spend (${Number(pctChange) > 0 ? '+' : ''}${pctChange}%)`,
      data: [...prevQ, ...currentQ].map(d => ({
        ...d, month: shortMonth(d.month),
        quarter: `Q${Math.ceil(monthIndex(d.month) / 3)}`,
      })),
      xAxis: { dataKey: 'month', label: 'Month' },
      yAxis: { dataKey: 'revenue', label: 'Spend ($)' },
      height: 400,
    };
  }

  const q1Data = monthlyData.slice(0, 3);
  return {
    type: 'bar', title: 'Q1 Monthly Procurement Spend',
    data: q1Data.map(d => ({ ...d, month: shortMonth(d.month) })),
    xAxis: { dataKey: 'month', label: 'Month' },
    yAxis: { dataKey: 'revenue', label: 'Spend ($)' },
    height: 400,
  };
}

function resolveDeliveryChart(query: string, sources: Source[]): Record<string, unknown> {
  if (query.includes('region')) {
    const otdByRegion = sources
      .filter(s => s.metadata?.type === 'region_summary' && s.metadata?.otd_rate !== undefined)
      .map(s => ({ name: String(s.metadata.region), value: Number(s.metadata.otd_rate) }))
      .filter(d => d.name && d.value > 0)
      .sort((a, b) => b.value - a.value);
    if (otdByRegion.length >= 2) {
      return {
        type: 'bar', title: 'On-Time Delivery Rate by Region',
        data: otdByRegion,
        xAxis: { dataKey: 'name', label: 'Region' },
        yAxis: { dataKey: 'value', label: 'OTD Rate (%)' },
        height: 400,
      };
    }
  }
  return { ...(chartSamples.supplierPerformance as Record<string, unknown>), sampleData: true };
}

function resolveQualityChart(query: string, sources: Source[]): Record<string, unknown> | null {
  const defectData = sources
    .filter(s => s.metadata?.type === 'category_summary' && s.metadata?.defect_rate !== undefined)
    .map(s => ({ name: String(s.metadata.category), value: Number(s.metadata.defect_rate) }))
    .filter(d => d.name && d.value >= 0);

  if (defectData.length >= 3) {
    return {
      type: 'bar',
      title: query.includes('quality') ? 'Quality Score by Product Line' : 'Defect Rate by Product Line',
      data: query.includes('quality')
        ? defectData.map(d => ({ ...d, value: Math.round(Math.max(0, Math.min(100, 100 - d.value)) * 10) / 10 })).sort((a, b) => b.value - a.value)
        : defectData.sort((a, b) => b.value - a.value),
      xAxis: { dataKey: 'name', label: 'Product Line' },
      yAxis: { dataKey: 'value', label: query.includes('quality') ? 'Quality Score' : 'Defect Rate (%)' },
      height: 400,
    };
  }
  return null;
}

function resolveLeadTimeChart(sources: Source[]): Record<string, unknown> | null {
  const leadTimeData = sources
    .filter(s => s.metadata?.type === 'region_summary' && s.metadata?.avg_lead_time !== undefined)
    .map(s => ({ name: String(s.metadata.region), value: Number(s.metadata.avg_lead_time) }))
    .filter(d => d.name && d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (leadTimeData.length >= 3) {
    return {
      type: 'bar', title: 'Average Lead Time by Region',
      data: leadTimeData,
      xAxis: { dataKey: 'name', label: 'Region' },
      yAxis: { dataKey: 'value', label: 'Avg Lead Time (Days)' },
      height: 400,
    };
  }
  return null;
}

function resolveCategoryChart(sources: Source[]): Record<string, unknown> {
  const catData = sources
    .filter(s => s.metadata?.type === 'category_summary')
    .map(s => ({ name: String(s.metadata.category), revenue: Number(s.metadata.revenue), orders: Number(s.metadata.orders) }))
    .filter(d => d.name && d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (catData.length >= 3) {
    return {
      type: 'bar', title: 'Spend by Product Line',
      data: catData,
      xAxis: { dataKey: 'name', label: 'Product Line' },
      yAxis: { dataKey: 'revenue', label: 'Spend ($)' },
      height: 400,
    };
  }
  return { ...(chartSamples.categoryBreakdown as Record<string, unknown>), sampleData: true };
}

function resolveGenericRegionChart(sources: Source[], wantsBarChart: boolean): Record<string, unknown> {
  const regData = sources
    .filter(s => s.metadata?.type === 'region_summary')
    .map(s => ({ name: String(s.metadata.region), revenue: Number(s.metadata.revenue), orders: Number(s.metadata.orders) }))
    .filter(d => d.name && d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (regData.length >= 3) {
    if (wantsBarChart) {
      return {
        type: 'bar', title: 'Procurement Spend by Region',
        data: regData,
        xAxis: { dataKey: 'name', label: 'Region' },
        yAxis: { dataKey: 'revenue', label: 'Spend ($)' },
        height: 400,
      };
    }
    return {
      type: 'pie', title: 'Procurement Spend by Region',
      data: regData,
      xAxis: { dataKey: 'name' },
      yAxis: { dataKey: 'revenue' },
      height: 400,
    };
  }

  if (wantsBarChart) {
    return { ...(chartSamples.regionPie as Record<string, unknown>), type: 'bar', title: 'Procurement Spend by Region', yAxis: { dataKey: 'revenue', label: 'Spend ($)' }, sampleData: true };
  }
  return { ...(chartSamples.regionPie as Record<string, unknown>), sampleData: true };
}

function resolveScatterChart(sources: Source[]): Record<string, unknown> | null {
  // Build scatter data from supplier metrics: cost vs quality
  const supplierData = sources
    .filter(s => s.metadata?.type === 'supplier_summary' && s.metadata?.avg_cost !== undefined && s.metadata?.quality_score !== undefined)
    .map(s => ({
      name: String(s.metadata.supplier_name),
      x: Number(s.metadata.avg_cost),
      y: Number(s.metadata.quality_score),
    }))
    .filter(d => d.x > 0 && d.y > 0);

  if (supplierData.length >= 3) {
    return {
      type: 'scatter',
      title: 'Cost vs Quality Score by Supplier',
      data: supplierData,
      xAxis: { dataKey: 'x', label: 'Avg Cost ($)' },
      yAxis: { dataKey: 'y', label: 'Quality Score' },
      height: 400,
    };
  }

  // Fallback: use category data for revenue vs orders
  const catData = sources
    .filter(s => s.metadata?.type === 'category_summary')
    .map(s => ({
      name: String(s.metadata.category),
      x: Number(s.metadata.orders),
      y: Number(s.metadata.revenue),
    }))
    .filter(d => d.x > 0 && d.y > 0);

  if (catData.length >= 3) {
    return {
      type: 'scatter',
      title: 'Orders vs Revenue by Product Line',
      data: catData,
      xAxis: { dataKey: 'x', label: 'Orders' },
      yAxis: { dataKey: 'y', label: 'Revenue ($)' },
      height: 400,
    };
  }

  return null;
}

function resolveWaterfallChart(): Record<string, unknown> {
  const monthlyData = (chartSamples.monthlyTrend as { data: Array<{ month: string; revenue: number }> }).data;

  // Build month-over-month changes
  const waterfallData = monthlyData.map((d, i) => {
    if (i === 0) return { name: SHORT_MONTH_NAMES[0], value: d.revenue };
    const change = d.revenue - monthlyData[i - 1].revenue;
    return { name: SHORT_MONTH_NAMES[i] || d.month, value: change };
  });

  return {
    type: 'waterfall' as const,
    title: 'Month-over-Month Revenue Changes',
    data: waterfallData,
    xAxis: { dataKey: 'name', label: 'Month' },
    yAxis: { dataKey: 'value', label: 'Change ($)' },
    height: 400,
    sampleData: true,
  };
}

function resolveDefaultChart(sources: Source[]): Record<string, unknown> {
  const defaultCatData = sources
    .filter(s => s.metadata?.type === 'category_summary')
    .map(s => ({ name: String(s.metadata.category), revenue: Number(s.metadata.revenue), orders: Number(s.metadata.orders) }))
    .filter(d => d.name && d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (defaultCatData.length >= 3) {
    return {
      type: 'bar', title: 'Spend by Product Line',
      data: defaultCatData,
      xAxis: { dataKey: 'name', label: 'Product Line' },
      yAxis: { dataKey: 'revenue', label: 'Spend ($)' },
      height: 400,
    };
  }
  return { ...(chartSamples.categoryBreakdown as Record<string, unknown>), sampleData: true };
}
