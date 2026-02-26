import OpenAI from 'openai';
import { z } from 'zod';
import { getEnvironmentConfig } from './env';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const config = getEnvironmentConfig();
    const apiKey = config.OPENAI_API_KEY || config.ANTHROPIC_API_KEY; // Fallback to Anthropic key field

    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    openaiClient = new OpenAI({
      apiKey,
    });
  }
  return openaiClient;
}

export const SYSTEM_PROMPT = `You are a conversational business intelligence assistant analyzing REAL e-commerce data from 2024. You have access to actual transaction data with specific revenue numbers, order counts, and customer metrics.

CRITICAL: You must ONLY use the actual data provided in the knowledge base. DO NOT make up or hallucinate any numbers.

The dataset contains:
- Time period: January - December 2024
- Total revenue: $393,744.62
- 2,000 transactions: 663 views, 628 cart adds, 709 completed purchases
- Cart abandonment rate: 68.5% (industry standard, as some purchases bypass cart)
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
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function createChatCompletion(messages: ChatMessage[], tools?: any[]) {
  const client = getOpenAIClient();

  // Model priority for OpenAI - Enterprise tier should have access to all
  const models = [
    'gpt-5.2',             // Latest GPT-5.2 model (most advanced)
    'gpt-5',               // GPT-5 base model
    'gpt-4o',              // GPT-4 Omni model
    'gpt-4-turbo',         // GPT-4 Turbo
    'gpt-4',               // Original GPT-4
    'gpt-3.5-turbo',       // Fallback
  ];

  // Add system message at the beginning
  const messagesWithSystem = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages
  ];

  for (const model of models) {
    try {
      console.log(`Attempting to use OpenAI model: ${model}`);

      const response = await client.chat.completions.create({
        model,
        messages: messagesWithSystem,
        temperature: 0.2, // Low temperature for factual accuracy
        max_tokens: 4096,
        frequency_penalty: 0.5, // Reduce repetition
        presence_penalty: 0.1,  // Encourage covering new topics
      });

      console.log(`Successfully used OpenAI model: ${model}`);

      // Transform OpenAI response to match Anthropic format
      return {
        content: [
          {
            type: 'text',
            text: response.choices[0]?.message?.content || ''
          }
        ]
      };
    } catch (error: any) {
      console.error(`Failed with model ${model}:`, error?.message || error);

      // If it's the last model, throw the error
      if (model === models[models.length - 1]) {
        console.error('All OpenAI models failed. Final error:', error);
        throw new Error(`Failed to get response from OpenAI API: ${error?.message || 'Unknown error'}`);
      }

      // Otherwise, try the next model
      console.log(`Falling back to next model...`);
    }
  }

  throw new Error('Failed to get response from any available OpenAI model');
}

export { getOpenAIClient as getOpenAI };