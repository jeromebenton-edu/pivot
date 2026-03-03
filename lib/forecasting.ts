/**
 * Forecasting module with Python SARIMAX microservice integration
 * and weighted-average fallback for when the service is unavailable.
 */

interface TimeSeriesData {
  month: string;
  revenue: number;
}

export interface ForecastResult {
  forecast: number;
  confidence: {
    lower: number;
    upper: number;
  };
  method: string;
  historicalMean: number;
  historicalStd: number;
}

export interface SmartForecastResult {
  forecasts: ForecastResult[];
  method: string;
  fallback: boolean;
}

const FORECAST_SERVICE_URL = process.env.FORECAST_SERVICE_URL || 'http://localhost:8001';
const FORECAST_API_KEY = process.env.FORECAST_API_KEY || '';

/**
 * Call the Python SARIMAX microservice, falling back to the local
 * weighted-average implementation when the service is unavailable.
 */
export async function smartForecast(
  data: TimeSeriesData[],
  steps: number = 3,
): Promise<SmartForecastResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (FORECAST_API_KEY) headers['x-api-key'] = FORECAST_API_KEY;

    const res = await fetch(`${FORECAST_SERVICE_URL}/forecast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        monthly_data: data.map(d => ({ month: d.month, revenue: d.revenue })),
        steps,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Forecast service returned ${res.status}`);
    }

    const body = await res.json() as {
      forecasts: Array<{ month: string; forecast: number; lower: number; upper: number }>;
      method: string;
      historical_mean: number;
      historical_std: number;
    };

    return {
      forecasts: body.forecasts.map(f => ({
        forecast: f.forecast,
        confidence: { lower: f.lower, upper: f.upper },
        method: body.method,
        historicalMean: body.historical_mean,
        historicalStd: body.historical_std,
      })),
      method: body.method,
      fallback: false,
    };
  } catch {
    // Fallback to local weighted-average implementation
    const results = weightedAverageForecast(data, steps);
    return {
      forecasts: results,
      method: 'weighted-average',
      fallback: true,
    };
  }
}

/**
 * Calculate differences (for stationarity)
 */
function difference(data: number[], lag: number = 1): number[] {
  const result: number[] = [];
  for (let i = lag; i < data.length; i++) {
    result.push(data[i] - data[i - lag]);
  }
  return result;
}

/**
 * Weighted-average forecast with trend adjustment and seasonal variation.
 */
export function weightedAverageForecast(data: TimeSeriesData[], steps: number = 1): ForecastResult[] {
  if (data.length === 0) throw new Error('No historical data for forecast');

  // Extract and filter finite revenue values (#R9-6)
  const revenues = data.map(d => d.revenue).filter(v => Number.isFinite(v));
  if (revenues.length < 3) throw new Error('Insufficient valid revenue data for forecast');

  // Calculate statistics
  const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
  const std = Math.sqrt(
    revenues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / revenues.length
  );

  // Index of the last historical data point — used to align seasonal factors
  // to the correct calendar month when computing forecasts.
  const lastMonthIndex = revenues.length - 1;

  // Generate forecasts using consistent logic for all step counts
  const forecasts: ForecastResult[] = [];
  const currentRevenues = [...revenues];

  for (let i = 0; i < steps; i++) {
    // Use weighted average of recent values for forecast
    const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // Weights for last 5 months
    const recentData = currentRevenues.slice(-5);

    let forecast = 0;
    if (recentData.length >= 3) {
      // Weighted average forecast
      const effectiveWeights = weights.slice(-recentData.length);
      const weightSum = effectiveWeights.reduce((a, b) => a + b, 0);
      forecast = recentData.reduce((sum, val, idx) =>
        sum + val * effectiveWeights[idx] / weightSum, 0
      );

      // Apply trend adjustment with decay
      const recentDiff = difference(currentRevenues).slice(-3);
      if (recentDiff.length > 0) {
        const avgDiff = recentDiff.reduce((a, b) => a + b, 0) / recentDiff.length;
        // Decay the trend impact for further out forecasts
        forecast += avgDiff * (0.5 * Math.pow(0.8, i));
      }

      // Add seasonal variation using the correct calendar month index.
      // Map the forecast step to the corresponding historical month:
      // step 0 forecasts the month after the last data point.
      const targetHistIndex = (lastMonthIndex + 1 + i) % revenues.length;
      if (revenues.length >= 3) {
        const seasonalFactor = mean !== 0 ? revenues[targetHistIndex] / mean : 1;
        forecast = forecast * (0.7 + 0.3 * seasonalFactor);
      }
    } else {
      forecast = mean;
    }

    // Widen confidence intervals for further out predictions
    const forecastError = std * Math.sqrt(1 + (i + 1) / revenues.length);
    const marginOfError = 1.96 * forecastError;

    forecasts.push({
      forecast: Math.max(0, forecast),
      confidence: {
        lower: Math.max(0, forecast - marginOfError),
        upper: forecast + marginOfError
      },
      method: 'weighted-average',
      historicalMean: mean,
      historicalStd: std
    });

    // Add forecast to current revenues for next iteration
    currentRevenues.push(forecast);
  }

  return forecasts;
}

/**
 * Format forecast results for display
 */
export function formatForecastResult(result: ForecastResult, targetMonth: string): string {
  const percentFromMean = result.historicalMean !== 0
    ? ((result.forecast - result.historicalMean) / result.historicalMean) * 100
    : 0; // Guard division by zero (#R9-5)

  return `
**Procurement Spend Forecast for ${targetMonth}**

📊 **Forecast: $${result.forecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**

**95% Confidence Interval:**
- Lower bound: $${result.confidence.lower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Upper bound: $${result.confidence.upper.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

**Comparison:**
- Historical average: $${result.historicalMean.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Forecast vs average: ${percentFromMean > 0 ? '+' : ''}${percentFromMean.toFixed(1)}%

*Method: ${result.method}*
  `.trim();
}

/**
 * Generate forecast chart configuration
 */
export function generateForecastChart(
  historicalData: TimeSeriesData[],
  forecastResult: ForecastResult,
  targetMonth: string
) {
  // Combine historical and forecast data for visualization
  const chartData = [
    ...historicalData.map(d => ({
      month: d.month,
      actual: d.revenue,
      forecast: null,
      lowerBound: null,
      upperBound: null
    })),
    {
      month: targetMonth,
      actual: null,
      forecast: forecastResult.forecast,
      lowerBound: forecastResult.confidence.lower,
      upperBound: forecastResult.confidence.upper
    }
  ];

  return {
    type: 'line' as const,
    title: `Procurement Spend Forecast for ${targetMonth}`,
    data: chartData,
    xAxis: { dataKey: 'month', label: 'Month' },
    yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
    series: ['actual', 'forecast'],
    colors: ['#3B82F6', '#EF4444'],
    height: 400
  };
}