/**
 * Circuit breaker for LLM providers.
 *
 * A pre-flight availability probe cannot detect the failure that matters most:
 * OpenAI's `GET /v1/models` returns 200 on a key whose completions quota is
 * exhausted. Only a real completion call surfaces `insufficient_quota`. So
 * instead of probing before each request, we learn from actual failures —
 * a provider that fails with a terminal, account-level error is skipped for a
 * cooldown window, after which one request is let through to test recovery.
 */

import { createLogger } from '@/lib/logger';
import { getErrorInfo } from '@/lib/types';
import type { LLMProvider } from '@/lib/llm-client';

const log = createLogger('llm-health');

// How long a provider stays open (skipped) after a terminal failure.
export const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

interface ProviderState {
  /** Timestamp (ms) the cooldown expires; 0 when the provider is healthy. */
  openUntil: number;
  /** Reason the breaker opened — surfaced via /api/health. */
  reason: string | null;
}

// globalThis so state survives HMR in dev, matching the env cache pattern (#R8)
const globalHealth = globalThis as unknown as {
  __pivotLLMHealth?: Record<LLMProvider, ProviderState>;
};

function states(): Record<LLMProvider, ProviderState> {
  if (!globalHealth.__pivotLLMHealth) {
    globalHealth.__pivotLLMHealth = {
      openai: { openUntil: 0, reason: null },
      anthropic: { openUntil: 0, reason: null },
    };
  }
  return globalHealth.__pivotLLMHealth;
}

/**
 * Terminal errors are account-level: retrying costs a round-trip and cannot
 * succeed until a human intervenes (top up billing, rotate the key). Transient
 * errors (5xx, timeouts, network blips) must NOT open the breaker — the request
 * may well succeed next time.
 */
export function isTerminalError(error: unknown): boolean {
  const { message, status } = getErrorInfo(error);

  if (status === 401 || status === 403 || status === 429) return true;

  // Providers wrap errors in a new Error before throwing, dropping the status
  // code (lib/openai.ts, lib/claude.ts) — fall back to matching the message.
  return /insufficient_quota|exceeded your current quota|rate limited|invalid[_ ]api[_ ]key|authentication[_ ]error/i.test(
    message,
  );
}

/** True when the provider is worth calling right now. */
export function isProviderAvailable(provider: LLMProvider, now = Date.now()): boolean {
  return now >= states()[provider].openUntil;
}

/** Record a failed call; opens the breaker only for terminal errors. */
export function recordFailure(provider: LLMProvider, error: unknown, now = Date.now()): void {
  if (!isTerminalError(error)) return;

  const { message } = getErrorInfo(error);
  states()[provider] = { openUntil: now + COOLDOWN_MS, reason: message };
  log.warn('Provider circuit opened', {
    provider,
    cooldownMs: COOLDOWN_MS,
    error: message,
  });
}

/** Record a successful call; closes the breaker if it was open. */
export function recordSuccess(provider: LLMProvider, now = Date.now()): void {
  const state = states()[provider];
  if (state.openUntil === 0) return;
  if (state.openUntil > now) {
    // A probe request slipped through during cooldown and worked — trust it.
    log.info('Provider recovered early, circuit closed', { provider });
  } else {
    log.info('Provider recovered, circuit closed', { provider });
  }
  states()[provider] = { openUntil: 0, reason: null };
}

export interface ProviderHealth {
  available: boolean;
  cooldownRemainingMs: number;
  reason: string | null;
}

/** Snapshot for /api/health. */
export function getProviderHealth(now = Date.now()): Record<LLMProvider, ProviderHealth> {
  const s = states();
  const snapshot = (p: LLMProvider): ProviderHealth => ({
    available: isProviderAvailable(p, now),
    cooldownRemainingMs: Math.max(0, s[p].openUntil - now),
    reason: s[p].openUntil > now ? s[p].reason : null,
  });
  return { openai: snapshot('openai'), anthropic: snapshot('anthropic') };
}

/** Test helper — clears all breaker state. */
export function resetProviderHealth(): void {
  globalHealth.__pivotLLMHealth = undefined;
}
