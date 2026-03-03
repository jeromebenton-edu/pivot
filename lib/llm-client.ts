// Unified LLM client that can switch between OpenAI and Anthropic

import { createLogger } from '@/lib/logger';
import { createChatCompletion as createAnthropicChat, createStreamingChatCompletion as streamAnthropic } from './claude';
import { createChatCompletion as createOpenAIChat, createStreamingChatCompletion as streamOpenAI } from './openai';
import { getEnvironmentConfig } from './env';
import type { ChatMessage } from './types';
import { getErrorInfo } from './types';

const log = createLogger('llm-client');

export type LLMProvider = 'openai' | 'anthropic';

// LLM call timeout — prevents indefinite hangs (#32)
const LLM_TIMEOUT_MS = 60_000; // 60 seconds

// Use validated config for provider selection to stay consistent with env validation (#25)
function getLLMProvider(): LLMProvider {
  const config = getEnvironmentConfig();
  if (config.OPENAI_API_KEY) {
    return 'openai';
  }
  return 'anthropic';
}

function getFallbackProvider(): LLMProvider | null {
  const config = getEnvironmentConfig();
  const primary = getLLMProvider();
  if (primary === 'openai' && config.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (primary === 'anthropic' && config.OPENAI_API_KEY) {
    return 'openai';
  }
  return null;
}

function chatForProvider(provider: LLMProvider) {
  return provider === 'openai' ? createOpenAIChat : createAnthropicChat;
}

function streamForProvider(provider: LLMProvider) {
  return provider === 'openai' ? streamOpenAI : streamAnthropic;
}

// tools parameter removed — neither provider passes it to the API (#12)
export async function createChatCompletion(messages: ChatMessage[]) {
  const primary = getLLMProvider();
  const fallback = getFallbackProvider();

  try {
    log.info('Using LLM provider', { provider: primary });
    return await chatForProvider(primary)(messages);
  } catch (error: unknown) {
    if (fallback) {
      const { message } = getErrorInfo(error);
      log.warn('Primary LLM failed, falling back', { primary, fallback, error: message });
      return await chatForProvider(fallback)(messages);
    }
    throw error;
  }
}

// Streaming version — routes to the correct provider with fallback
// Tracks whether primary sent data to avoid garbled partial+full output (#20)
// Wraps calls with a timeout to prevent indefinite hangs (#32)
export async function createStreamingChatCompletion(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void | Promise<void>,
  onError: (error: Error) => void
): Promise<void> {
  const primary = getLLMProvider();
  const fallback = getFallbackProvider();

  let chunksSent = false;
  let errorCalled = false; // Track if onError was already called by the provider (#10)
  let doneCalled = false;  // Track if onDone was already called (#16 R6)

  const trackingOnChunk = (text: string) => {
    chunksSent = true;
    onChunk(text);
  };

  const trackingOnDone = async (fullText: string) => {
    if (doneCalled) return; // Prevent double invocation (#16 R6)
    doneCalled = true;
    await onDone(fullText);
  };

  const trackingOnError = (error: Error) => {
    if (errorCalled) return; // Prevent double invocation
    errorCalled = true;
    onError(error);
  };

  // Wrap a streaming call with a timeout + AbortController, clearing timer on completion (#32, #11 R6, #R8)
  const withTimeout = (fn: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('LLM streaming timed out'));
      }, LLM_TIMEOUT_MS);
    });
    return Promise.race([
      fn(controller.signal).finally(() => clearTimeout(timer)),
      timeoutPromise,
    ]);
  };

  try {
    log.info('Streaming with provider', { provider: primary });
    await withTimeout((_signal) => streamForProvider(primary)(messages, trackingOnChunk, trackingOnDone, trackingOnError));

    // If the provider called onError internally (non-throwing path), try fallback (#10)
    if (errorCalled && fallback && !chunksSent && !doneCalled) {
      log.warn('Primary reported error without throwing, falling back', { primary, fallback });
      errorCalled = false;
      // Use tracked callbacks for fallback too (#17 R6)
      await withTimeout((_signal) => streamForProvider(fallback)(messages, trackingOnChunk, trackingOnDone, trackingOnError));
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (fallback && !chunksSent && !errorCalled && !doneCalled) {
      // Safe to fall back — no data sent to client yet
      log.warn('Stream failed before sending data, falling back', { primary, fallback });
      try {
        await withTimeout((_signal) => streamForProvider(fallback)(messages, trackingOnChunk, trackingOnDone, trackingOnError));
      } catch (fallbackError: unknown) {
        trackingOnError(fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
      }
    } else if (!errorCalled) {
      // Primary already sent partial data — report error rather than garbling (#20)
      trackingOnError(err);
    }
  }
}

// Export provider info for debugging
export function getCurrentProvider() {
  return getLLMProvider();
}
