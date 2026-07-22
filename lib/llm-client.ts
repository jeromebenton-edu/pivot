// Unified LLM client that can switch between OpenAI and Anthropic

import { createLogger } from '@/lib/logger';
import { createChatCompletion as createAnthropicChat, createStreamingChatCompletion as streamAnthropic } from './claude';
import { createChatCompletion as createOpenAIChat, createStreamingChatCompletion as streamOpenAI } from './openai';
import { getEnvironmentConfig } from './env';
import type { ChatMessage } from './types';
import { getErrorInfo } from './types';
import { isProviderAvailable, recordFailure, recordSuccess } from './llm-health';

const log = createLogger('llm-client');

export type LLMProvider = 'openai' | 'anthropic';

// LLM call timeout — prevents indefinite hangs (#32)
const LLM_TIMEOUT_MS = 60_000; // 60 seconds

// Providers we hold valid keys for, in default preference order (#25: use the
// validated config so selection stays consistent with env validation)
function configuredProviders(): LLMProvider[] {
  const config = getEnvironmentConfig();
  const available: LLMProvider[] = [];
  if (config.OPENAI_API_KEY) available.push('openai');
  if (config.ANTHROPIC_API_KEY) available.push('anthropic');

  // An explicit LLM_PROVIDER pin moves that provider to the front. The other
  // stays as fallback rather than being dropped — a pin is a preference, not a ban.
  const pinned = config.LLM_PROVIDER;
  if (pinned && available.includes(pinned)) {
    return [pinned, ...available.filter(p => p !== pinned)];
  }
  return available;
}

/**
 * Choose the primary provider, skipping any whose circuit breaker is open.
 * If every provider is in cooldown we fall back to plain preference order —
 * attempting a call and failing beats refusing to try at all.
 */
function getLLMProvider(): LLMProvider {
  const providers = configuredProviders();
  const healthy = providers.find(isProviderAvailable);
  if (healthy) return healthy;
  return providers[0] ?? 'anthropic';
}

function getFallbackProvider(): LLMProvider | null {
  const primary = getLLMProvider();
  return configuredProviders().find(p => p !== primary) ?? null;
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
    const result = await chatForProvider(primary)(messages);
    recordSuccess(primary);
    return result;
  } catch (error: unknown) {
    recordFailure(primary, error);
    if (fallback) {
      const { message } = getErrorInfo(error);
      log.warn('Primary LLM failed, falling back', { primary, fallback, error: message });
      try {
        const result = await chatForProvider(fallback)(messages);
        recordSuccess(fallback);
        return result;
      } catch (fallbackError: unknown) {
        recordFailure(fallback, fallbackError);
        throw fallbackError;
      }
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
  let fallbackStarted = false;
  let pendingError: Error | null = null; // Primary's error, withheld while fallback is viable
  let activeProvider = primary;          // Provider whose outcome we're currently recording
  let failureRecorded = false;           // One breaker entry per provider attempt

  const noteFailure = (error: unknown) => {
    if (failureRecorded) return;
    failureRecorded = true;
    recordFailure(activeProvider, error);
  };

  const trackingOnChunk = (text: string) => {
    chunksSent = true;
    onChunk(text);
  };

  const trackingOnDone = async (fullText: string) => {
    if (doneCalled) return; // Prevent double invocation (#16 R6)
    doneCalled = true;
    recordSuccess(activeProvider);
    await onDone(fullText);
  };

  const trackingOnError = (error: Error) => {
    if (errorCalled) return; // Prevent double invocation
    errorCalled = true;
    noteFailure(error);
    // Withhold the primary's error while a fallback can still run — surfacing it
    // here closes the client stream before the fallback gets a chance (#R9)
    if (fallback && !fallbackStarted && !chunksSent && !doneCalled) {
      pendingError = error;
      return;
    }
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

  // Run the fallback provider, reusing the tracked callbacks (#17 R6)
  const runFallback = async (provider: LLMProvider) => {
    fallbackStarted = true;
    errorCalled = false;
    pendingError = null;
    activeProvider = provider;
    failureRecorded = false;
    try {
      await withTimeout((_signal) => streamForProvider(provider)(messages, trackingOnChunk, trackingOnDone, trackingOnError));
    } catch (fallbackError: unknown) {
      trackingOnError(fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
    }
  };

  try {
    log.info('Streaming with provider', { provider: primary });
    await withTimeout((_signal) => streamForProvider(primary)(messages, trackingOnChunk, trackingOnDone, trackingOnError));

    // If the provider reported an error (throwing or not), try fallback (#10)
    if (errorCalled && fallback && !chunksSent && !doneCalled) {
      log.warn('Primary reported error without throwing, falling back', { primary, fallback });
      await runFallback(fallback);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    noteFailure(err);
    if (fallback && !fallbackStarted && !chunksSent && !doneCalled) {
      // Safe to fall back — no data sent to client yet
      log.warn('Stream failed before sending data, falling back', { primary, fallback });
      await runFallback(fallback);
    } else if (!errorCalled) {
      // Primary already sent partial data — report error rather than garbling (#20)
      trackingOnError(err);
    } else if (pendingError) {
      pendingError = err;
    }
  }

  // Flush any error we withheld in case the fallback never ran
  if (pendingError && !doneCalled) {
    onError(pendingError);
  }
}

// Export provider info for debugging
export function getCurrentProvider() {
  return getLLMProvider();
}
