import Anthropic from '@anthropic-ai/sdk';
import { getEnvironmentConfig } from './env';
import { createLogger } from './logger';
import { SYSTEM_PROMPT } from './prompts';
import type { ChatMessage } from './types';
import { getErrorInfo } from './types';

const log = createLogger('anthropic');

// Use globalThis to survive HMR in dev mode (#R8)
const globalAnthropic = globalThis as unknown as { __pivotAnthropicClient?: Anthropic | null };
if (globalAnthropic.__pivotAnthropicClient === undefined) globalAnthropic.__pivotAnthropicClient = null;

function getAnthropicClient(): Anthropic {
  if (!globalAnthropic.__pivotAnthropicClient) {
    const config = getEnvironmentConfig();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key is not configured');
    }
    globalAnthropic.__pivotAnthropicClient = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
    });
  }
  return globalAnthropic.__pivotAnthropicClient;
}

// SYSTEM_PROMPT available via import from './prompts' directly

// Anthropic API uses a separate `system` param — extract system messages from the array
function separateSystemMessages(messages: ChatMessage[]): { systemContent: string; chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const systemParts: string[] = [];
  const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return { systemContent: systemParts.join('\n\n'), chatMessages };
}

// tools parameter removed — not passed to API (#12)
export async function createChatCompletion(messages: ChatMessage[]) {
  const client = getAnthropicClient();
  const { systemContent, chatMessages } = separateSystemMessages(messages);
  const fullSystem = systemContent ? `${SYSTEM_PROMPT}\n\n${systemContent}` : SYSTEM_PROMPT;

  // Start with Haiku (user's tier) to avoid wasted 404s on unavailable models (#31)
  // If higher-tier access is added, prepend opus/sonnet to this list
  const models = [
    'claude-haiku-4-5-20251001',    // Claude Haiku 4.5 (user's tier)
    'claude-sonnet-4-6',            // Claude Sonnet 4.6 (if available)
  ];

  for (const model of models) {
    try {
      log.info(`Attempting model: ${model}`);

      const temperature = model.includes('haiku') ? 0.2 : 0.1;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature,
        system: fullSystem,
        messages: chatMessages,
      });

      log.info(`Successfully used model: ${model}`);
      return response;
    } catch (error: unknown) {
      const { message, status } = getErrorInfo(error);
      log.error(`Failed with model ${model}`, { error: message });

      // Don't retry on non-retryable client errors (#21, #R9 429 consistency)
      if (status === 400 || status === 401 || status === 403 || status === 429) {
        throw new Error(`Anthropic API error (${status}): ${message}`);
      }

      // If it's the last model, throw the error
      if (model === models[models.length - 1]) {
        log.error('All models failed', { error: message });
        throw new Error(`Failed to get response from Anthropic API: ${message}`);
      }

      // Otherwise, try the next model (model-not-found, server errors)
      log.info('Falling back to next model');
    }
  }

  throw new Error('Failed to get response from any available model');
}

// Streaming version — calls onChunk for each text token, onDone when complete
// Model fallback for streaming (#22), await async onDone (#9)
export async function createStreamingChatCompletion(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void | Promise<void>,
  onError: (error: Error) => void
): Promise<void> {
  const client = getAnthropicClient();

  const { systemContent, chatMessages } = separateSystemMessages(messages);
  const fullSystem = systemContent ? `${SYSTEM_PROMPT}\n\n${systemContent}` : SYSTEM_PROMPT;

  // Start with Haiku to avoid wasted calls (#31)
  const models = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
  ];

  let chunksSent = false; // Track whether we've sent data (#10)

  for (const model of models) {
    try {
      log.info(`Streaming with model: ${model}`);
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        temperature: model.includes('haiku') ? 0.2 : 0.1,
        system: fullSystem,
        messages: chatMessages,
      });

      let fullText = '';
      // Handle stream error events to prevent unhandled rejection (#R8)
      stream.on('error', (err) => {
        log.error(`Stream error event for ${model}`, { error: err?.message || String(err) });
      });
      stream.on('text', (text) => {
        fullText += text;
        chunksSent = true;
        onChunk(text);
      });

      await stream.finalMessage();
      await onDone(fullText);
      return;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Stream failed with model ${model}`, { error: err.message });

      // If we already sent chunks, don't retry — would garble output (#10)
      if (chunksSent) {
        onError(err);
        return;
      }

      // Don't retry on non-retryable client errors (#21, #24 R6 — consistent 429 handling)
      const { status } = getErrorInfo(error);
      if (status === 400 || status === 401 || status === 403 || status === 429) {
        onError(err);
        return;
      }

      if (model === models[models.length - 1]) {
        onError(err);
        return;
      }
    }
  }

  onError(new Error('All Anthropic models failed for streaming'));
}

export { getAnthropicClient as getAnthropic };