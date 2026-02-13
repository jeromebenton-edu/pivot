import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getEnvironmentConfig } from './env';

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    const config = getEnvironmentConfig();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key is not configured');
    }
    anthropic = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

export const SYSTEM_PROMPT = `You are a conversational business intelligence assistant with access to powerful data analysis and forecasting tools. You help users analyze e-commerce data through natural language queries.

When users ask questions about data:
1. Use the relevant information provided from the knowledge base
2. Look for summary chunks (monthly, category, or regional summaries) for aggregate questions
3. When users ask for visualizations, generate chart configurations using appropriate chart types
4. For trend questions, suggest line or area charts
5. For comparisons between categories, suggest bar or pie charts
6. For period comparisons, use the compare_periods tool
7. Always cite which sources you used

Forecasting Capabilities:
- You can generate revenue forecasts using ARIMA time series models
- When users ask about future predictions, forecasts, or projections, the system will automatically generate them
- Forecasts include confidence intervals and comparisons with historical averages
- Mention that forecasts are based on historical patterns and actual results may vary

You can suggest helpful visualizations even when not explicitly asked, if they would help illustrate the data better.

Important: The knowledge base context is provided after "Relevant information from the knowledge base:" in the user's message. Use this information to answer their questions accurately.

Be conversational but concise. Focus on insights and visualizations.`;

export const toolDefinitions = [
  {
    name: 'semantic_search',
    description: 'Search for relevant data based on a natural language query',
    parameters: z.object({
      query: z.string().describe('The search query'),
      limit: z.number().optional().default(5).describe('Number of results to return'),
      filters: z.record(z.string(), z.any()).optional().describe('Metadata filters to apply'),
    }),
  },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function createChatCompletion(messages: ChatMessage[], tools?: any[]) {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages,
      // Tools will be implemented in Phase 2 with proper schema
    });

    return response;
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

export { getAnthropicClient as getAnthropic };