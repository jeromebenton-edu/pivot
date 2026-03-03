/**
 * Rate limiting middleware for API routes.
 *
 * Uses a Supabase RPC function for atomic distributed rate limiting when
 * configured (production / serverless), falling back to an in-memory store
 * for local development.
 */

import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

// Use globalThis to survive HMR in dev mode (#R7)
const globalRL = globalThis as unknown as { __pivotRateLimitStore?: RateLimitStore };
if (!globalRL.__pivotRateLimitStore) {
  globalRL.__pivotRateLimitStore = {};
}
const memoryStore: RateLimitStore = globalRL.__pivotRateLimitStore;

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
}

/**
 * Atomic distributed rate limit check via Postgres RPC.
 *
 * The `check_rate_limit` function (see migration 006) performs an
 * INSERT ... ON CONFLICT DO UPDATE in a single statement, eliminating
 * the TOCTOU race of a separate SELECT + UPDATE.
 *
 * Cleanup of expired rows is triggered probabilistically (~5% of calls)
 * via the `cleanup_rate_limits` function.
 */
async function checkDistributed(
  key: string,
  config: RateLimitConfig,
): Promise<{ success: boolean; message?: string }> {
  const db = getSupabaseAdmin();
  if (!db) return checkMemory(key, config);

  try {
    // Atomic increment-or-reset via Postgres function
    const { data, error } = await db.rpc('check_rate_limit', {
      p_key: key,
      p_max: config.max,
      p_window_ms: config.windowMs,
    });

    if (error) {
      // RPC not available (migration not run yet) — fall back to memory
      return checkMemory(key, config);
    }

    const newCount = data as number;

    // Probabilistic cleanup — ~5% of requests trigger expired-row deletion
    if (Math.random() < 0.05) {
      Promise.resolve(db.rpc('cleanup_rate_limits')).catch(() => {});
    }

    if (newCount > config.max) {
      return {
        success: false,
        message: config.message || 'Too many requests. Please try again later.',
      };
    }

    return { success: true };
  } catch {
    // On any failure, fall back to in-memory
    return checkMemory(key, config);
  }
}

/**
 * In-memory rate limiter (local dev / fallback).
 */
function checkMemory(
  key: string,
  config: RateLimitConfig,
): { success: boolean; message?: string } {
  const now = Date.now();

  // Probabilistic cleanup — only scan 10% of the time to avoid O(n) on every call (#R7)
  // Also cap total keys to prevent unbounded store growth (#R8)
  const MAX_KEYS = 10000;
  const keys = Object.keys(memoryStore);
  if (Math.random() < 0.1 || keys.length > MAX_KEYS) {
    for (const k of keys) {
      if (memoryStore[k] && memoryStore[k].resetTime < now) {
        delete memoryStore[k];
      }
    }
    // If still over capacity after cleanup, evict oldest entries
    if (Object.keys(memoryStore).length > MAX_KEYS) {
      const sorted = Object.entries(memoryStore).sort((a, b) => a[1].resetTime - b[1].resetTime);
      const toRemove = sorted.slice(0, sorted.length - MAX_KEYS);
      for (const [k] of toRemove) delete memoryStore[k];
    }
  }

  if (!memoryStore[key] || memoryStore[key].resetTime < now) {
    memoryStore[key] = { count: 1, resetTime: now + config.windowMs };
    return { success: true };
  }

  if (memoryStore[key].count >= config.max) {
    return {
      success: false,
      message: config.message || 'Too many requests. Please try again later.',
    };
  }

  memoryStore[key].count++;
  return { success: true };
}

/**
 * Create a rate limiter that uses Supabase when configured, in-memory otherwise.
 */
export function createRateLimiter(config: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
}) {
  const useDistributed = isSupabaseConfigured();

  return async function rateLimit(identifier: string): Promise<{ success: boolean; message?: string }> {
    if (useDistributed) {
      return checkDistributed(identifier, config);
    }
    return checkMemory(identifier, config);
  };
}
