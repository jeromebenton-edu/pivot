import { describe, it, expect, beforeEach } from 'vitest';
import {
  COOLDOWN_MS,
  isTerminalError,
  isProviderAvailable,
  recordFailure,
  recordSuccess,
  getProviderHealth,
  resetProviderHealth,
} from '../llm-health';

const T0 = 1_700_000_000_000;

describe('isTerminalError', () => {
  it('treats auth and quota status codes as terminal', () => {
    expect(isTerminalError(Object.assign(new Error('x'), { status: 401 }))).toBe(true);
    expect(isTerminalError(Object.assign(new Error('x'), { status: 403 }))).toBe(true);
    expect(isTerminalError(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
  });

  it('treats server errors and timeouts as transient', () => {
    expect(isTerminalError(Object.assign(new Error('x'), { status: 500 }))).toBe(false);
    expect(isTerminalError(Object.assign(new Error('x'), { status: 503 }))).toBe(false);
    expect(isTerminalError(new Error('LLM streaming timed out'))).toBe(false);
    expect(isTerminalError(new Error('socket hang up'))).toBe(false);
  });

  it('matches on message when the status code was lost in wrapping', () => {
    // lib/openai.ts rethrows as a plain Error, dropping the status code
    expect(isTerminalError(new Error('OpenAI rate limited: quota'))).toBe(true);
    expect(isTerminalError(new Error('429 You exceeded your current quota'))).toBe(true);
    expect(isTerminalError(new Error('invalid_api_key'))).toBe(true);
  });
});

describe('circuit breaker', () => {
  beforeEach(() => resetProviderHealth());

  it('starts with all providers available', () => {
    expect(isProviderAvailable('openai', T0)).toBe(true);
    expect(isProviderAvailable('anthropic', T0)).toBe(true);
  });

  it('opens the circuit on a terminal failure', () => {
    recordFailure('openai', Object.assign(new Error('quota'), { status: 429 }), T0);
    expect(isProviderAvailable('openai', T0)).toBe(false);
    expect(isProviderAvailable('anthropic', T0)).toBe(true);
  });

  it('leaves the circuit closed on a transient failure', () => {
    recordFailure('openai', Object.assign(new Error('boom'), { status: 500 }), T0);
    expect(isProviderAvailable('openai', T0)).toBe(true);
  });

  it('reopens the provider after the cooldown expires', () => {
    recordFailure('openai', Object.assign(new Error('quota'), { status: 429 }), T0);
    expect(isProviderAvailable('openai', T0 + COOLDOWN_MS - 1)).toBe(false);
    expect(isProviderAvailable('openai', T0 + COOLDOWN_MS)).toBe(true);
  });

  it('closes the circuit on a success', () => {
    recordFailure('openai', Object.assign(new Error('quota'), { status: 429 }), T0);
    recordSuccess('openai', T0 + 1000);
    expect(isProviderAvailable('openai', T0 + 1000)).toBe(true);
  });

  it('reports cooldown and reason via getProviderHealth', () => {
    recordFailure('openai', Object.assign(new Error('insufficient_quota'), { status: 429 }), T0);
    const health = getProviderHealth(T0 + 60_000);

    expect(health.openai.available).toBe(false);
    expect(health.openai.cooldownRemainingMs).toBe(COOLDOWN_MS - 60_000);
    expect(health.openai.reason).toBe('insufficient_quota');

    expect(health.anthropic.available).toBe(true);
    expect(health.anthropic.cooldownRemainingMs).toBe(0);
    expect(health.anthropic.reason).toBeNull();
  });
});
