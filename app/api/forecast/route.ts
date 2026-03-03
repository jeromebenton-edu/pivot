import { NextRequest, NextResponse } from 'next/server';
import { smartForecast } from '@/lib/forecasting';
import { getMonthlySummaries } from '@/lib/mcp-tools';
import { auth } from '@/lib/auth';
import { createRateLimiter } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('forecast');

// Rate limiter for forecast API (#R8)
const forecastRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many forecast requests. Please wait a moment.',
});

interface MonthlyData {
  month: string;
  revenue: number;
}

interface ChunkMetadata {
  type?: string;
  month?: string;
  revenue?: number;
  [key: string]: unknown;
}

async function loadMonthlyData(): Promise<MonthlyData[]> {
  // Use pre-extracted summaries if RAG has initialized
  const cached = getMonthlySummaries();
  if (cached) return cached;

  // Fallback: load and scan (only if RAG hasn't initialized yet)
  const dataChunks = (await import('@/data/samples/data_chunks.json')).default;
  const monthlyData: MonthlyData[] = [];
  for (const chunk of dataChunks) {
    const meta = (chunk as { metadata?: ChunkMetadata }).metadata;
    if (meta?.type === 'monthly_summary' && meta.month && typeof meta.revenue === 'number') {
      monthlyData.push({
        month: meta.month,
        revenue: meta.revenue,
      });
    }
  }
  monthlyData.sort((a, b) => a.month.localeCompare(b.month));
  return monthlyData;
}

// Maximum forecast steps to prevent DoS (#25)
const MAX_FORECAST_STEPS = 24;

// Allowed chart types (#30)
const ALLOWED_CHART_TYPES = new Set(['line', 'bar']);

// Validate YYYY-MM format (#31)
function isValidYearMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export async function POST(req: NextRequest) {
  // Require authentication (#23)
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit per user (#R8)
  const rateLimitResult = await forecastRateLimiter(session.user.id);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
  }

  try {
    // Wrap req.json() to return 400 on malformed JSON (#19 R6)
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { targetMonth = '2025-01', steps: rawSteps = 1, months, chartType: rawChartType = 'line' } = body;
    let chartType = rawChartType;
    let steps = rawSteps;

    // Validate chartType (#30)
    if (!ALLOWED_CHART_TYPES.has(chartType)) {
      chartType = 'line';
    }

    // Validate targetMonth format (#31)
    if (typeof targetMonth !== 'string' || !isValidYearMonth(targetMonth)) {
      return NextResponse.json({ error: 'Invalid targetMonth format. Use YYYY-MM.' }, { status: 400 });
    }

    // Validate and clamp steps (#25)
    steps = typeof steps === 'number' ? Math.min(Math.max(1, Math.floor(steps)), MAX_FORECAST_STEPS) : 1;

    // Validate months array (#26)
    if (months !== undefined) {
      if (!Array.isArray(months) || months.length === 0 || months.length > MAX_FORECAST_STEPS) {
        return NextResponse.json(
          { error: `months must be an array of 1-${MAX_FORECAST_STEPS} YYYY-MM strings` },
          { status: 400 },
        );
      }
      // Validate each month string
      for (const m of months) {
        if (typeof m !== 'string' || !isValidYearMonth(m)) {
          return NextResponse.json({ error: `Invalid month format: ${String(m).slice(0, 20)}. Use YYYY-MM.` }, { status: 400 });
        }
      }
    }

    const monthlyData = await loadMonthlyData();

    if (monthlyData.length < 3) {
      return NextResponse.json(
        { error: 'Insufficient historical data for forecasting' },
        { status: 400 }
      );
    }

    // Validate targetMonth is after the historical data period (#18 R6)
    const lastHistoricalMonth = monthlyData[monthlyData.length - 1]?.month;
    if (lastHistoricalMonth && targetMonth <= lastHistoricalMonth) {
      return NextResponse.json(
        { error: `targetMonth must be after historical data (last: ${lastHistoricalMonth}). Use a future month.` },
        { status: 400 },
      );
    }

    // Determine number of steps
    let forecastSteps = steps;

    // If specific months are requested (e.g., "January-June 2025")
    if (months && months.length > 0) {
      forecastSteps = months.length;
    }

    // Generate forecast — prefer Python SARIMAX service, fall back to local weighted-average
    const smartResult = await smartForecast(monthlyData, forecastSteps);
    const forecastResult = smartResult.forecasts;
    const forecastMethod = smartResult.method;

    // Format multiple forecasts
    if (Array.isArray(forecastResult)) {
      // Derive fallback month names dynamically from historical data (#21 R6)
      let fallbackMonths: string[];
      if (lastHistoricalMonth) {
        const [yr, mo] = lastHistoricalMonth.split('-').map(Number);
        // mo is 1-based; first forecast month = mo+1 (or January of next year) (#R7 off-by-one fix)
        fallbackMonths = Array.from({ length: forecastSteps }, (_, i) => {
          const totalMonths = mo + i + 1; // +1 because mo is last historical, not first forecast
          const newYear = yr + Math.floor((totalMonths - 1) / 12);
          const newMonth = ((totalMonths - 1) % 12) + 1;
          return `${newYear}-${String(newMonth).padStart(2, '0')}`;
        });
      } else {
        fallbackMonths = Array.from({ length: forecastSteps }, (_, i) =>
          `2025-${String(i + 1).padStart(2, '0')}`
        );
      }
      const monthNames: string[] = months || fallbackMonths;

      // Create combined formatted text
      const titleRange = monthNames.length === 1 ? monthNames[0] : `${monthNames[0]} - ${monthNames[monthNames.length - 1]}`;
      let formattedText = `**Procurement Spend Forecast for ${titleRange}**\n\n`;

      monthNames.forEach((month: string, index: number) => {
        const forecast = forecastResult[index];
        if (!forecast) return; // Guard against index OOB (#27)
        formattedText += `📊 **${month}: $${forecast.forecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n`;
        formattedText += `   95% CI: [$${forecast.confidence.lower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${forecast.confidence.upper.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]\n\n`;
      });

      // Add summary statistics — use actual valid forecast count, not forecastSteps (#R7)
      const validForecasts = forecastResult.filter((_, i) => i < monthNames.length);
      const totalForecast = validForecasts.reduce((sum, f) => sum + f.forecast, 0);
      const avgForecast = validForecasts.length > 0 ? totalForecast / validForecasts.length : 0;
      formattedText += `**Summary:**\n`;
      formattedText += `- Total ${validForecasts.length}-month forecast: $${totalForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      formattedText += `- Average monthly forecast: $${avgForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      formattedText += `- Historical monthly average: $${forecastResult[0].historicalMean.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
      formattedText += `*Method: ${forecastMethod}${smartResult.fallback ? ' (fallback)' : ''}*`;

      // Generate chart data for multiple forecasts — omit raw historicalData from response (#32)
      const chartData = [
        ...monthlyData.map(d => ({
          month: d.month,
          actual: d.revenue,
          forecast: null,
          lowerBound: null,
          upperBound: null
        })),
        ...monthNames.map((month: string, index: number) => ({
          month,
          actual: null,
          forecast: forecastResult[index]?.forecast ?? null,
          lowerBound: forecastResult[index]?.confidence.lower ?? null,
          upperBound: forecastResult[index]?.confidence.upper ?? null
        }))
      ];

      // Use the requested chart type, or bar chart for multi-month forecasts
      const useBarChart = chartType === 'bar' || (forecastSteps > 1 && chartData.filter(d => d.forecast !== null).length === chartData.length);
      const finalChartType = useBarChart ? 'bar' as const : 'line' as const;

      const chartConfig = {
        type: finalChartType,
        title: monthNames.length === 1 ? `Procurement Spend Forecast for ${monthNames[0]}` : `Procurement Spend Forecast: ${monthNames[0]} - ${monthNames[monthNames.length - 1]}`,
        data: chartData,
        xAxis: { dataKey: 'month', label: 'Month' },
        yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
        series: ['actual', 'forecast'],
        colors: ['#3B82F6', '#EF4444'],
        height: 400
      };

      return NextResponse.json({
        success: true,
        forecast: forecastResult,
        formattedText,
        chartConfig,
        method: forecastMethod,
        fallback: smartResult.fallback,
      });
    }

    // smartForecast().forecasts is always an array — this is unreachable
    return NextResponse.json({ error: 'Unexpected forecast format' }, { status: 500 });
  } catch (error) {
    log.error('Forecast API error', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}

// Require auth on GET endpoint too (#24)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit GET too (#R8)
  const rateLimitResult = await forecastRateLimiter(session.user.id);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
  }

  const monthlyData = await loadMonthlyData();

  return NextResponse.json({
    availableMonths: monthlyData.map(d => d.month),
    latestMonth: monthlyData[monthlyData.length - 1]?.month || null,
    totalMonths: monthlyData.length
  });
}
