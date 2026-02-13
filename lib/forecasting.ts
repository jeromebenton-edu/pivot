/**
 * Simple ARIMA forecasting implementation for time series data
 * This is a simplified version suitable for basic forecasting needs
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

/**
 * Calculate moving average
 */
function movingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length - window + 1; i++) {
    const windowData = data.slice(i, i + window);
    const avg = windowData.reduce((a, b) => a + b, 0) / window;
    result.push(avg);
  }
  return result;
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
 * Simple ARIMA(1,1,1) forecast implementation
 */
export function arimaForecast(data: TimeSeriesData[], steps: number = 1): ForecastResult | ForecastResult[] {
  // Extract revenue values
  const revenues = data.map(d => d.revenue);

  // Calculate statistics
  const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
  const std = Math.sqrt(
    revenues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / revenues.length
  );

  // Apply differencing for stationarity
  const diffData = difference(revenues);

  // For multiple step forecasts
  if (steps > 1) {
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

        // Add some seasonal variation based on historical patterns
        if (i % 12 < revenues.length) {
          const seasonalFactor = revenues[i % 12] / mean;
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
        method: 'Simplified ARIMA(1,1,1)',
        historicalMean: mean,
        historicalStd: std
      });

      // Add forecast to current revenues for next iteration
      currentRevenues.push(forecast);
    }

    return forecasts;
  }

  // Single step forecast (original logic)
  const weights = [0.1, 0.15, 0.2, 0.25, 0.3];
  const recentData = revenues.slice(-5);

  let forecast = 0;
  if (recentData.length >= 3) {
    const effectiveWeights = weights.slice(-recentData.length);
    const weightSum = effectiveWeights.reduce((a, b) => a + b, 0);
    forecast = recentData.reduce((sum, val, idx) =>
      sum + val * effectiveWeights[idx] / weightSum, 0
    );

    const recentDiff = diffData.slice(-3);
    if (recentDiff.length > 0) {
      const avgDiff = recentDiff.reduce((a, b) => a + b, 0) / recentDiff.length;
      forecast += avgDiff * 0.5;
    }
  } else {
    forecast = mean;
  }

  const forecastError = std * Math.sqrt(1 + 1 / revenues.length);
  const marginOfError = 1.96 * forecastError;

  return {
    forecast: Math.max(0, forecast),
    confidence: {
      lower: Math.max(0, forecast - marginOfError),
      upper: forecast + marginOfError
    },
    method: 'Simplified ARIMA(1,1,1)',
    historicalMean: mean,
    historicalStd: std
  };
}

/**
 * Format forecast results for display
 */
export function formatForecastResult(result: ForecastResult, targetMonth: string): string {
  const percentFromMean = ((result.forecast - result.historicalMean) / result.historicalMean) * 100;

  return `
**Revenue Forecast for ${targetMonth}**

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
    title: `Revenue Forecast for ${targetMonth}`,
    data: chartData,
    xAxis: { dataKey: 'month', label: 'Month' },
    yAxis: { dataKey: 'revenue', label: 'Revenue ($)' },
    series: ['actual', 'forecast'],
    colors: ['#3B82F6', '#EF4444'],
    height: 400
  };
}