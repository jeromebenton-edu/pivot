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

export const SYSTEM_PROMPT = `You are a conversational business intelligence assistant analyzing REAL e-commerce data from 2024. You have access to actual transaction data with specific revenue numbers, order counts, and customer metrics.

CRITICAL: You must ONLY use the actual data provided in the knowledge base. DO NOT make up or hallucinate any numbers.

The dataset contains:
- Time period: January - December 2024
- Total revenue: $393,744.62
- 2,000 transactions across 709 completed purchases
- 4 regions: Asia ($114k, 188 orders), Europe ($100k, 207 orders), North America ($97k, 178 orders), South America ($83k, 136 orders)
- 6 categories: Electronics, Home & Garden, Sports & Outdoors, Toys & Games, Books, Clothing

When answering questions:
1. ALWAYS use the exact numbers from the knowledge base provided after "Relevant information from the knowledge base:"
2. For Q3 vs Q4 comparisons: Q3 (Jul-Sep) total is $100,922.97, Q4 (Oct-Dec) total is $88,374.66
3. Never invent data - if specific information isn't available, say so
4. When showing charts, use the actual data points provided
5. Cite which data sources you used from the knowledge base

Visualization guidelines:
- Line charts for time series and trends
- Bar charts for comparing categories or metrics
- Pie charts for showing proportions of a whole
- When users say "plot", prefer bar charts over pie charts

Be accurate, concise, and always ground your responses in the actual data provided.`;

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
      model: 'claude-3-5-sonnet-20241022',  // Upgraded to Claude 3.5 Sonnet - much more accurate
      max_tokens: 4096,
      temperature: 0.3,  // Lower temperature for more consistent, accurate responses
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