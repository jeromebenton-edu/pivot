import { NextRequest, NextResponse } from 'next/server';
import { arimaForecast, formatForecastResult, generateForecastChart, ForecastResult } from '@/lib/forecasting';
import dataChunks from '@/data/samples/data_chunks.json';

interface MonthlyData {
  month: string;
  revenue: number;
}

export async function POST(req: NextRequest) {
  try {
    const { targetMonth = '2025-01', steps = 1, months, chartType = 'line' } = await req.json();

    // Extract monthly summary data from chunks
    const monthlyData: MonthlyData[] = [];

    dataChunks.forEach((chunk: any) => {
      if (chunk.metadata?.type === 'monthly_summary') {
        monthlyData.push({
          month: chunk.metadata.month,
          revenue: chunk.metadata.revenue
        });
      }
    });

    // Sort by month
    monthlyData.sort((a, b) => a.month.localeCompare(b.month));

    if (monthlyData.length < 3) {
      return NextResponse.json(
        { error: 'Insufficient historical data for forecasting' },
        { status: 400 }
      );
    }

    // Determine number of steps
    let forecastSteps = steps;

    // If specific months are requested (e.g., "January-June 2025")
    if (months && months.length > 0) {
      forecastSteps = months.length;
    }

    // Generate forecast
    const forecastResult = arimaForecast(monthlyData, forecastSteps);

    // Format multiple forecasts if needed
    if (Array.isArray(forecastResult)) {
      const monthNames = months || [
        '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'
      ].slice(0, forecastSteps);

      // Create combined formatted text
      let formattedText = `**Revenue Forecast for ${monthNames[0]} - ${monthNames[monthNames.length - 1]}**\n\n`;

      monthNames.forEach((month: string, index: number) => {
        const forecast = forecastResult[index];
        formattedText += `📊 **${month}: $${forecast.forecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n`;
        formattedText += `   95% CI: [$${forecast.confidence.lower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - $${forecast.confidence.upper.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]\n\n`;
      });

      // Add summary statistics
      const totalForecast = forecastResult.reduce((sum, f) => sum + f.forecast, 0);
      const avgForecast = totalForecast / forecastResult.length;
      formattedText += `**Summary:**\n`;
      formattedText += `- Total ${forecastSteps}-month forecast: $${totalForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      formattedText += `- Average monthly forecast: $${avgForecast.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      formattedText += `- Historical monthly average: $${forecastResult[0].historicalMean.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
      formattedText += `*Method: Simplified ARIMA(1,1,1)*`;

      // Generate chart data for multiple forecasts
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
          forecast: forecastResult[index].forecast,
          lowerBound: forecastResult[index].confidence.lower,
          upperBound: forecastResult[index].confidence.upper
        }))
      ];

      // Use the requested chart type, or bar chart for multi-month forecasts
      const useBarChart = chartType === 'bar' || (forecastSteps > 1 && chartData.filter(d => d.forecast !== null).length === chartData.length);
      const finalChartType = useBarChart ? 'bar' as const : (chartType === 'line' ? 'line' as const : 'bar' as const);

      const chartConfig = {
        type: finalChartType,
        title: `Revenue Forecast: ${monthNames[0]} - ${monthNames[monthNames.length - 1]}`,
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
        historicalData: monthlyData
      });
    }

    // Single forecast (original logic)
    const formattedResult = formatForecastResult(forecastResult as any, targetMonth);
    const chartConfig = generateForecastChart(monthlyData, forecastResult as any, targetMonth);

    return NextResponse.json({
      success: true,
      forecast: forecastResult,
      formattedText: formattedResult,
      chartConfig,
      historicalData: monthlyData
    });
  } catch (error) {
    console.error('Forecast API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return available months for forecasting
  const monthlyData: { month: string; revenue: number }[] = [];

  dataChunks.forEach((chunk: any) => {
    if (chunk.metadata?.type === 'monthly_summary') {
      monthlyData.push({
        month: chunk.metadata.month,
        revenue: chunk.metadata.revenue
      });
    }
  });

  monthlyData.sort((a, b) => a.month.localeCompare(b.month));

  return NextResponse.json({
    availableMonths: monthlyData,
    latestMonth: monthlyData[monthlyData.length - 1]?.month || null,
    totalMonths: monthlyData.length
  });
}