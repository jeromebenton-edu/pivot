import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion } from '@/lib/claude';
import { ChatRequest } from '@/lib/types';
import { initializeRAG, semanticSearch } from '@/lib/mcp-tools';
import { createRateLimiter, getClientIdentifier } from '@/lib/rate-limit';
import { isEnvironmentValid } from '@/lib/env';
import chartSamples from '@/data/samples/chart_samples.json';
import datasetOverview from '@/data/samples/dataset_overview.json';

// Initialize RAG on first request
let ragInitialized = false;

// Create rate limiter for chat API
const rateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many chat requests. Please wait a moment before trying again.',
});

export async function POST(req: NextRequest) {
  try {
    // Check environment
    if (!isEnvironmentValid()) {
      return NextResponse.json(
        { error: 'Service unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // Rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitResult = await rateLimiter(clientId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: rateLimitResult.message },
        { status: 429 }
      );
    }

    // Validate request body
    let body: ChatRequest;
    try {
      body = await req.json();
      if (!body.messages || !Array.isArray(body.messages)) {
        throw new Error('Invalid request format');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const { messages } = body;

    // Initialize RAG if not already done
    if (!ragInitialized) {
      console.log('Initializing RAG system...');
      const initResult = await initializeRAG();
      if (initResult.success) {
        ragInitialized = true;
        console.log(initResult.message);
      } else {
        console.error('Failed to initialize RAG:', initResult.error);
      }
    }

    // Get the latest user message
    const latestUserMessage = messages[messages.length - 1];
    let context = '';
    const sources: Array<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
      score: number;
    }> = [];

    // Check if user is asking for dataset overview/description
    const overviewKeywords = ['describe', 'overview', 'summary', 'dataset', 'tell me about', 'what is'];
    const isAskingForOverview = overviewKeywords.some(keyword =>
      latestUserMessage?.content.toLowerCase().includes(keyword)
    );

    // Perform semantic search to get relevant context
    if (latestUserMessage && latestUserMessage.role === 'user' && ragInitialized) {
      console.log('Performing semantic search for:', latestUserMessage.content);

      // Adjust search query for dataset overview requests
      let searchQuery = latestUserMessage.content;
      let searchLimit = 5;

      if (isAskingForOverview) {
        // For overview requests, search for summary data
        searchQuery = 'monthly summary category summary region summary total revenue orders';
        searchLimit = 10; // Get more summary chunks
      }

      const searchResults = await semanticSearch({
        query: searchQuery,
        limit: searchLimit
      });

      if (searchResults.success && searchResults.results.length > 0) {
        // Build context from search results
        context = '\n\nRelevant information from the knowledge base:\n';

        // For overview requests, add comprehensive dataset information
        if (isAskingForOverview) {
          // Add comprehensive overview as first context
          context += `\n[Dataset Overview]\n`;
          context += `- Dataset: ${datasetOverview.overview.title}\n`;
          context += `- Description: ${datasetOverview.overview.description}\n`;
          context += `- Time Range: ${datasetOverview.overview.timeRange}\n`;
          context += `- Total Records: ${datasetOverview.overview.recordCount}\n`;
          context += `- Total Revenue: ${datasetOverview.metrics.totalRevenue}\n`;
          context += `- Total Orders: ${datasetOverview.metrics.totalOrders}\n`;
          context += `- Average Order Value: ${datasetOverview.metrics.averageOrderValue}\n`;
          context += `\nTop Regions by Revenue:\n`;
          datasetOverview.dimensions.regions.forEach((r) => {
            context += `  - ${r.name}: ${r.revenue} (${r.orders} orders)\n`;
          });
          context += `\nTop Categories by Revenue:\n`;
          datasetOverview.dimensions.categories.forEach((c) => {
            context += `  - ${c.name}: ${c.revenue} (${c.orders} orders)\n`;
          });
          context += `\nTemporal Patterns:\n`;
          context += `  - Highest Month: ${datasetOverview.temporalPatterns.highestRevenueMonth.month} (${datasetOverview.temporalPatterns.highestRevenueMonth.revenue})\n`;
          context += `  - Lowest Month: ${datasetOverview.temporalPatterns.lowestRevenueMonth.month} (${datasetOverview.temporalPatterns.lowestRevenueMonth.revenue})\n`;
          context += `  - Trend: ${datasetOverview.temporalPatterns.trend}\n`;
        }

        searchResults.results.forEach((result, idx: number) => {
          context += `\n[${idx + 1}] ${result.content}`;
          sources.push({
            id: result.id,
            content: result.content,
            metadata: result.metadata,
            score: result.relevance_score
          });
        });

        console.log(`Found ${searchResults.results.length} relevant sources`);
      }
    }

    // Enhance the user message with context
    const enhancedMessages = messages.map((msg, idx) => {
      if (idx === messages.length - 1 && msg.role === 'user' && context) {
        return {
          role: 'user' as const,
          content: msg.content + context
        };
      }
      return {
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      };
    });

    const response = await createChatCompletion(enhancedMessages);

    const assistantContent = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    const toolUse = response.content.find((block) => block.type === 'tool_use') as any;

    // Check if the response suggests including a chart or forecast
    let chartConfig = null;
    let forecastData = null;

    // Check for forecast keywords
    const forecastKeywords = ['forecast', 'predict', 'sarima', 'arima', 'projection', 'future', 'next month', 'january 2025', 'estimate'];
    const shouldGenerateForecast = forecastKeywords.some(keyword =>
      latestUserMessage?.content.toLowerCase().includes(keyword)
    );

    // Simple heuristic: if the query mentions chart, visualization, show, trend, etc.
    const visualizationKeywords = ['chart', 'graph', 'visualiz', 'show', 'trend', 'compare', 'breakdown', 'distribution', 'visual', 'plot', 'display', 'illustrate', 'diagram'];
    const shouldGenerateChart = visualizationKeywords.some(keyword =>
      latestUserMessage?.content.toLowerCase().includes(keyword)
    );

    // Handle forecast requests
    if (shouldGenerateForecast) {
      try {
        const query = latestUserMessage?.content.toLowerCase() || '';

        // Detect multi-month forecast requests
        let steps = 1;
        let months: string[] | undefined;

        // Check for "next X months" or "six months" patterns first
        const nextMonthsMatch = query.match(/(?:next\s+)?(\d+|six|three|four|five|seven|eight|nine|ten|eleven|twelve)\s+month/);
        const numberWords: { [key: string]: number } = {
          'three': 3, 'four': 4, 'five': 5, 'six': 6,
          'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
          'eleven': 11, 'twelve': 12
        };

        if (nextMonthsMatch) {
          const matchText = nextMonthsMatch[1];
          steps = numberWords[matchText] || parseInt(matchText) || 6;
          steps = Math.min(steps, 12); // Cap at 12 months
          months = [];
          for (let i = 0; i < steps; i++) {
            const month = i < 9 ? `2025-0${i + 1}` : `2025-${i + 1}`;
            months.push(month);
          }
        }
        // Check for January-June pattern
        else if (query.includes('january') && query.includes('june')) {
          months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
          steps = 6;
        }
        // Check for Q1/Q2 patterns
        else if (query.includes('q1') && query.includes('q2')) {
          months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
          steps = 6;
        }
        // Default to January 2025 only
        else {
          months = ['2025-01'];
          steps = 1;
        }

        // Call the forecast API
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'http://localhost:3000';
        const forecastResponse = await fetch(`${baseUrl}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetMonth: months[0],
            steps,
            months
          })
        });

        if (forecastResponse.ok) {
          const forecastResult = await forecastResponse.json();
          forecastData = forecastResult.formattedText;
          chartConfig = forecastResult.chartConfig;

          // Enhance the response with forecast information
          if (forecastData) {
            const enhancedResponse = assistantContent + '\n\n' + forecastData;
            return NextResponse.json({
              message: {
                content: enhancedResponse,
                chartConfig,
                sources: sources.length > 0 ? sources : [],
              },
              toolCalls: toolUse ? [{
                name: toolUse.name,
                arguments: toolUse.input
              }] : [],
            });
          }
        }
      } catch (error) {
        console.error('Forecast generation error:', error);
      }
    }

    if (shouldGenerateChart && !chartConfig) {
      const query = latestUserMessage?.content.toLowerCase() || '';

      // Check for specific metric requests
      if (query.includes('turnover') && query.includes('rate')) {
        // Calculate turnover rate (orders/revenue ratio) by category
        const turnoverData = datasetOverview.dimensions.categories.map((cat) => ({
          name: cat.name,
          turnoverRate: (cat.orders / parseFloat(cat.revenue.replace(/[$,]/g, '')) * 1000).toFixed(3),
          orders: cat.orders,
          revenue: cat.revenue
        }));

        chartConfig = {
          type: 'bar',
          title: 'Turnover Rate by Product Category',
          data: turnoverData.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate)),
          xAxis: { dataKey: 'name', label: 'Category' },
          yAxis: { dataKey: 'turnoverRate', label: 'Turnover Rate (Orders per $1000 Revenue)' },
          height: 400
        };
      }
      // Default to showing monthly trend for generic visualization requests
      else if (query.includes('trend') || query.includes('month') || query.includes('time')) {
        chartConfig = chartSamples.monthlyTrend;
      } else if (query.includes('category') || query.includes('product')) {
        chartConfig = chartSamples.categoryBreakdown;
      } else if (query.includes('region') || query.includes('location')) {
        chartConfig = chartSamples.regionPie;
      } else {
        // Default visualization - show category breakdown
        chartConfig = chartSamples.categoryBreakdown;
      }
    }

    const responseMessage = {
      message: {
        content: assistantContent || 'I understand your question. Let me analyze the data for you.',
        chartConfig,
        sources: sources.length > 0 ? sources : [],
      },
      toolCalls: toolUse ? [{
        name: toolUse.name,
        arguments: toolUse.input
      }] : [],
    };

    return NextResponse.json(responseMessage);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}