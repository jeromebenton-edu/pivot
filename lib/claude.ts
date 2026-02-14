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
  const client = getAnthropicClient();

  // Try Claude 3.5 Sonnet first, fall back to Claude 3 Sonnet if not available
  const models = [
    'claude-3-5-sonnet-20240620',  // Claude 3.5 Sonnet (correct model ID)
    'claude-3-opus-20240229',       // Claude 3 Opus (most capable)
    'claude-3-sonnet-20240229',     // Claude 3 Sonnet (balanced)
    'claude-3-haiku-20240307'       // Claude 3 Haiku (fastest, fallback)
  ];

  for (const model of models) {
    try {
      console.log(`Attempting to use model: ${model}`);

      // Set temperature based on model - lower for better accuracy
      let temperature = 0.3;
      if (model.includes('haiku')) {
        temperature = 0.5;  // Haiku needs slightly higher temp
      } else if (model.includes('opus')) {
        temperature = 0.2;  // Opus works best with very low temp for factual tasks
      }

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature,
        system: SYSTEM_PROMPT,
        messages,
        // Tools will be implemented in Phase 2 with proper schema
      });

      console.log(`Successfully used model: ${model}`);
      return response;
    } catch (error: any) {
      console.error(`Failed with model ${model}:`, error?.message || error);

      // If it's the last model, throw the error
      if (model === models[models.length - 1]) {
        console.error('All models failed. Final error:', error);
        throw new Error(`Failed to get response from Anthropic API: ${error?.message || 'Unknown error'}`);
      }

      // Otherwise, try the next model
      console.log(`Falling back to next model...`);
    }
  }

  throw new Error('Failed to get response from any available model');
}

export { getAnthropicClient as getAnthropic };