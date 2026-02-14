// Unified LLM client that can switch between OpenAI and Anthropic

import { createChatCompletion as createAnthropicChat } from './claude';
import { createChatCompletion as createOpenAIChat } from './openai';

export type LLMProvider = 'openai' | 'anthropic';

// Check environment to determine which provider to use
function getLLMProvider(): LLMProvider {
  // Check if we have OpenAI key
  if (process.env.OPENAI_API_KEY) {
    console.log('Using OpenAI as LLM provider');
    return 'openai';
  }

  // Fallback to Anthropic
  console.log('Using Anthropic as LLM provider');
  return 'anthropic';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function createChatCompletion(messages: ChatMessage[], tools?: any[]) {
  const provider = getLLMProvider();

  switch (provider) {
    case 'openai':
      return createOpenAIChat(messages, tools);
    case 'anthropic':
      return createAnthropicChat(messages, tools);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// Export provider info for debugging
export function getCurrentProvider() {
  return getLLMProvider();
}