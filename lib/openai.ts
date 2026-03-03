import OpenAI from 'openai';
import { getEnvironmentConfig } from './env';
import { createLogger } from './logger';
import { SYSTEM_PROMPT } from './prompts';
import type { ChatMessage } from './types';
import { getErrorInfo } from './types';

const log = createLogger('openai');

// Use globalThis to survive HMR in dev mode (#R8)
const globalOpenAI = globalThis as unknown as { __pivotOpenAIClient?: OpenAI | null };
if (globalOpenAI.__pivotOpenAIClient === undefined) globalOpenAI.__pivotOpenAIClient = null;

function getOpenAIClient(): OpenAI {
  if (!globalOpenAI.__pivotOpenAIClient) {
    const config = getEnvironmentConfig();
    // NEVER fall back to Anthropic key — that would leak credentials to OpenAI (#1)
    if (!config.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    globalOpenAI.__pivotOpenAIClient = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
  }
  return globalOpenAI.__pivotOpenAIClient;
}

// Consolidate system messages: merge SYSTEM_PROMPT + any system messages from array (#23)
function buildOpenAIMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const systemParts: string[] = [SYSTEM_PROMPT];
  const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return [
    { role: 'system' as const, content: systemParts.join('\n\n') },
    ...chatMessages,
  ];
}

// tools parameter removed — not passed to API (#12)
export async function createChatCompletion(messages: ChatMessage[]) {
  const client = getOpenAIClient();

  // Model priority for OpenAI - using best available models
  const models = [
    'gpt-4o',              // GPT-4 Omni model (best available)
    'gpt-4-turbo',         // GPT-4 Turbo (excellent alternative)
    'gpt-4',               // Original GPT-4
    'gpt-3.5-turbo',       // Fallback
  ];

  const messagesWithSystem = buildOpenAIMessages(messages);

  for (const model of models) {
    try {
      log.info(`Attempting model: ${model}`);

      const response = await client.chat.completions.create({
        model,
        messages: messagesWithSystem,
        temperature: 0.2, // Low temperature for factual accuracy
        max_tokens: 4096,
        frequency_penalty: 0.5, // Reduce repetition
        presence_penalty: 0.1,  // Encourage covering new topics
      });

      log.info(`Successfully used model: ${model}`);

      // Transform OpenAI response to match Anthropic format
      return {
        content: [
          {
            type: 'text',
            text: response.choices[0]?.message?.content || ''
          }
        ]
      };
    } catch (error: unknown) {
      const { message, status } = getErrorInfo(error);
      log.error(`Failed with model ${model}`, { error: message });

      // Don't retry on non-retryable client errors (#2)
      if (status === 400 || status === 401 || status === 403) {
        throw new Error(`OpenAI API error (${status}): ${message}`);
      }

      // 404 = model not found — skip to next model, don't throw (#R8)
      if (status === 404) {
        log.info(`Model ${model} not found (404), trying next`);
        if (model === models[models.length - 1]) {
          throw new Error(`No available OpenAI models found`);
        }
        continue;
      }

      // 429 (rate limit) is account-level — don't try other models, just throw (#30)
      if (status === 429) {
        throw new Error(`OpenAI rate limited: ${message}`);
      }

      // If it's the last model, throw the error
      if (model === models[models.length - 1]) {
        log.error('All models failed', { error: message });
        throw new Error(`Failed to get response from OpenAI API: ${message}`);
      }

      // Otherwise, try the next model
      log.info('Falling back to next model');
    }
  }

  throw new Error('Failed to get response from any available OpenAI model');
}

// Streaming version — calls onChunk for each text token, onDone when complete
export async function createStreamingChatCompletion(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void | Promise<void>,
  onError: (error: Error) => void
): Promise<void> {
  const client = getOpenAIClient();

  const messagesWithSystem = buildOpenAIMessages(messages);

  const models = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
  let lastError: Error | null = null;
  let chunksSent = false; // Track whether we've sent data to the client (#10)

  for (const model of models) {
    try {
      log.info(`Streaming with model: ${model}`);
      const stream = await client.chat.completions.create({
        model,
        messages: messagesWithSystem,
        temperature: 0.2,
        max_tokens: 4096,
        frequency_penalty: 0.5,
        presence_penalty: 0.1,
        stream: true,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          chunksSent = true;
          onChunk(delta);
        }
      }
      await onDone(fullText);
      return;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      log.error(`Stream failed with model ${model}`, { error: err.message });

      // If we already sent chunks, don't retry — would garble output (#10)
      if (chunksSent) {
        onError(err);
        return;
      }

      // Don't retry on non-retryable client errors (#2)
      const { status } = getErrorInfo(error);
      if (status === 400 || status === 401 || status === 403 || status === 429) {
        onError(err);
        return;
      }

      if (model === models[models.length - 1]) break;
    }
  }
  onError(lastError || new Error('All models failed'));
}

export { getOpenAIClient as getOpenAI };