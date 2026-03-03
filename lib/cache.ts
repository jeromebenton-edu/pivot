import { createHash } from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('cache');

export class LRUCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private maxSize: number;
  private defaultTTLMs: number;

  constructor(opts: { maxSize: number; defaultTTLMs: number }) {
    this.maxSize = opts.maxSize;
    this.defaultTTLMs = opts.defaultTTLMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Delete first so re-insert goes to end
    this.cache.delete(key);
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs),
    });
  }

  // Peek without LRU promotion (#12)
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /** Delete all entries whose key starts with the given prefix (skips already-expired) */
  deleteByPrefix(prefix: string): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (key.startsWith(prefix)) {
        if (now <= entry.expiresAt) removed++; // Only count live entries (#31)
        this.cache.delete(key);
      }
    }
    return removed;
  }

  // Approximate count — includes expired entries not yet lazily evicted.
  // Use liveSize() when accuracy matters (e.g., capacity decisions).
  get size(): number {
    return this.cache.size;
  }

  // Count only non-expired entries — O(n) scan, use sparingly (#1 review R6)
  liveSize(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.cache.values()) {
      if (now <= entry.expiresAt) count++;
    }
    return count;
  }
}

// SHA-256 hash truncated to 32 hex chars (128-bit) — collision-safe for expected workloads (#19)
// Use null byte delimiter to prevent ambiguous joins (#30)
export function cacheKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\x00')).digest('hex').slice(0, 32);
}

// --- Pre-configured cache instances on globalThis to survive HMR (#37) ---
// Note: in-process only — no benefit in serverless cold-starts (#13, documented)

const globalCaches = globalThis as unknown as {
  __pivotSearchCache?: LRUCache<{ results: Array<{ id: string; content: string; metadata: Record<string, unknown>; score: number }>; context: string }>;
  __pivotChartCache?: LRUCache<Record<string, unknown> | null>;
  __pivotLLMCache?: LRUCache<{ text: string; chartConfig: Record<string, unknown> | null; sources: Array<{ id: string; content: string; metadata: Record<string, unknown>; score: number }> }>;
};

// RAG search results: 200 entries, 1 hour TTL
if (!globalCaches.__pivotSearchCache) {
  globalCaches.__pivotSearchCache = new LRUCache({ maxSize: 200, defaultTTLMs: 60 * 60 * 1000 });
}
export const searchCache = globalCaches.__pivotSearchCache;

// Chart configs: 100 entries, 1 hour TTL
if (!globalCaches.__pivotChartCache) {
  globalCaches.__pivotChartCache = new LRUCache({ maxSize: 100, defaultTTLMs: 60 * 60 * 1000 });
}
export const chartCache = globalCaches.__pivotChartCache;

// Full LLM responses: 50 entries, 30 min TTL
if (!globalCaches.__pivotLLMCache) {
  globalCaches.__pivotLLMCache = new LRUCache({ maxSize: 50, defaultTTLMs: 30 * 60 * 1000 });
}
export const llmCache = globalCaches.__pivotLLMCache;

// Invalidate all caches on data change (#14/#15)
// Prefix-based invalidation is not feasible because cache keys are hashed from
// multiple parts — the dataset ID is not recoverable as a key prefix. Full clear
// is the correct approach since uploaded data can affect cross-dataset queries.
// Clears ALL cache instances. The `datasetId` parameter is for log context only —
// prefix-based invalidation is infeasible because keys are hashed (#3 review R6).
export function invalidateDatasetCaches(datasetId?: string): void {
  const total = searchCache.size + chartCache.size + llmCache.size;
  searchCache.clear();
  chartCache.clear();
  llmCache.clear();
  log.info('Invalidated cache entries', { count: total, datasetId });
}
