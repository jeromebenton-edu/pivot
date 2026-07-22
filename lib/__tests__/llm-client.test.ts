import { describe, it, expect, vi, beforeEach } from 'vitest';

const streamOpenAI = vi.fn();
const streamAnthropic = vi.fn();

vi.mock('../openai', () => ({
  createChatCompletion: vi.fn(),
  createStreamingChatCompletion: (...args: unknown[]) => streamOpenAI(...args),
}));

vi.mock('../claude', () => ({
  createChatCompletion: vi.fn(),
  createStreamingChatCompletion: (...args: unknown[]) => streamAnthropic(...args),
}));

const envConfig: Record<string, string | undefined> = {
  OPENAI_API_KEY: 'sk-test',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  LLM_PROVIDER: undefined,
};

vi.mock('../env', () => ({
  getEnvironmentConfig: () => envConfig,
}));

import { createStreamingChatCompletion } from '../llm-client';
import { recordFailure, resetProviderHealth } from '../llm-health';

const messages = [{ role: 'user' as const, content: 'hi' }];

const quotaError = () => Object.assign(new Error('insufficient_quota'), { status: 429 });

describe('createStreamingChatCompletion fallback', () => {
  beforeEach(() => {
    streamOpenAI.mockReset();
    streamAnthropic.mockReset();
    resetProviderHealth();
    envConfig.OPENAI_API_KEY = 'sk-test';
    envConfig.ANTHROPIC_API_KEY = 'sk-ant-test';
    envConfig.LLM_PROVIDER = undefined;
  });

  it('does not surface the primary error when the fallback succeeds', async () => {
    // OpenAI reports a quota error via onError without throwing
    streamOpenAI.mockImplementation(async (_m, _onChunk, _onDone, onError) => {
      onError(new Error('OpenAI rate limited: insufficient_quota'));
    });
    streamAnthropic.mockImplementation(async (_m, onChunk, onDone) => {
      onChunk('fallback answer');
      await onDone('fallback answer');
    });

    const chunks: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    await createStreamingChatCompletion(messages, (t) => chunks.push(t), onDone, onError);

    expect(streamAnthropic).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(chunks.join('')).toBe('fallback answer');
    expect(onDone).toHaveBeenCalledWith('fallback answer');
  });

  it('falls back when the primary throws', async () => {
    streamOpenAI.mockRejectedValue(new Error('boom'));
    streamAnthropic.mockImplementation(async (_m, onChunk, onDone) => {
      onChunk('ok');
      await onDone('ok');
    });

    const onError = vi.fn();
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), onError);

    expect(streamAnthropic).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the error when both providers fail', async () => {
    streamOpenAI.mockImplementation(async (_m, _c, _d, onError) => onError(new Error('primary down')));
    streamAnthropic.mockImplementation(async (_m, _c, _d, onError) => onError(new Error('fallback down')));

    const onError = vi.fn();
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), onError);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe('fallback down');
  });

  it('does not retry once the primary has streamed data', async () => {
    streamOpenAI.mockImplementation(async (_m, onChunk, _d, onError) => {
      onChunk('partial');
      onError(new Error('died mid-stream'));
    });

    const onError = vi.fn();
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), onError);

    expect(streamAnthropic).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('provider selection', () => {
  beforeEach(() => {
    streamOpenAI.mockReset();
    streamAnthropic.mockReset();
    resetProviderHealth();
    envConfig.OPENAI_API_KEY = 'sk-test';
    envConfig.ANTHROPIC_API_KEY = 'sk-ant-test';
    envConfig.LLM_PROVIDER = undefined;

    const ok = async (_m: unknown, _c: unknown, onDone: (t: string) => Promise<void>) => { await onDone('ok'); };
    streamOpenAI.mockImplementation(ok);
    streamAnthropic.mockImplementation(ok);
  });

  it('defaults to OpenAI when both providers are healthy', async () => {
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    expect(streamOpenAI).toHaveBeenCalledOnce();
    expect(streamAnthropic).not.toHaveBeenCalled();
  });

  it('skips a provider whose circuit is open, avoiding the wasted call', async () => {
    recordFailure('openai', quotaError());

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());

    expect(streamOpenAI).not.toHaveBeenCalled();
    expect(streamAnthropic).toHaveBeenCalledOnce();
  });

  it('opens the circuit after a terminal failure so the next call skips it', async () => {
    streamOpenAI.mockImplementationOnce(async (_m, _c, _d, onError) => onError(quotaError()));

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    expect(streamOpenAI).toHaveBeenCalledOnce();

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    expect(streamOpenAI).toHaveBeenCalledOnce(); // not retried
    expect(streamAnthropic).toHaveBeenCalledTimes(2);
  });

  it('does not open the circuit on a transient failure', async () => {
    streamOpenAI.mockImplementationOnce(async (_m, _c, _d, onError) =>
      onError(Object.assign(new Error('upstream 503'), { status: 503 })),
    );

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());

    expect(streamOpenAI).toHaveBeenCalledTimes(2); // retried on the next request
  });

  it('honours the LLM_PROVIDER pin', async () => {
    envConfig.LLM_PROVIDER = 'anthropic';

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());

    expect(streamAnthropic).toHaveBeenCalledOnce();
    expect(streamOpenAI).not.toHaveBeenCalled();
  });

  it('still falls back past a pinned provider that fails', async () => {
    envConfig.LLM_PROVIDER = 'anthropic';
    streamAnthropic.mockImplementationOnce(async (_m, _c, _d, onError) => onError(quotaError()));

    const onError = vi.fn();
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), onError);

    expect(streamOpenAI).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('attempts a call even when every provider is in cooldown', async () => {
    recordFailure('openai', quotaError());
    recordFailure('anthropic', quotaError());

    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());

    expect(streamOpenAI).toHaveBeenCalledOnce();
  });

  it('closes the circuit again once a provider recovers', async () => {
    streamOpenAI.mockImplementationOnce(async (_m, _c, _d, onError) => onError(quotaError()));
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    expect(streamOpenAI).toHaveBeenCalledOnce();

    // Anthropic serves the next call; force OpenAI back in via a recovery success
    resetProviderHealth();
    await createStreamingChatCompletion(messages, () => {}, vi.fn(), vi.fn());
    expect(streamOpenAI).toHaveBeenCalledTimes(2);
  });
});
