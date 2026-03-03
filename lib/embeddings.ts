/**
 * Embeddings service for generating vector representations of text
 * Fallback chain: OpenAI → Voyage AI (Anthropic recommended) → Mock (with warning)
 *
 * IMPORTANT: Once a provider succeeds, we lock to that provider for the session
 * to prevent mixing embeddings of different dimensions (#22/#24 R6).
 * OpenAI text-embedding-3-small = 1536 dims, Voyage voyage-3 = 1024 dims, Mock = 1536 dims.
 */

import { createLogger } from '@/lib/logger';
import { generateOpenAIEmbedding } from './openai-embeddings';
import { generateOpenAIEmbeddings } from './openai-embeddings';
import { generateVoyageEmbedding } from './voyage-embeddings';
import { generateVoyageEmbeddings } from './voyage-embeddings';
import { setActualEmbeddingProvider } from './chroma';

const log = createLogger('embeddings');

// Track whether we've already warned about mock embeddings (on globalThis for HMR #R8-10)

// Lock to first successful provider to prevent dimension mismatch (#22 R6)
// Use globalThis to survive HMR in dev mode (#R7)
const globalEmbedLock = globalThis as unknown as {
  __pivotLockedProvider?: 'openai' | 'voyage' | 'mock' | null;
  __pivotLockPromise?: Promise<'openai' | 'voyage' | 'mock'> | null;
  __pivotMockWarningShown?: boolean;
};
if (globalEmbedLock.__pivotLockedProvider === undefined) {
  globalEmbedLock.__pivotLockedProvider = null;
}
if (globalEmbedLock.__pivotLockPromise === undefined) {
  globalEmbedLock.__pivotLockPromise = null;
}
if (globalEmbedLock.__pivotMockWarningShown === undefined) {
  globalEmbedLock.__pivotMockWarningShown = false;
}

function getLockedProvider() { return globalEmbedLock.__pivotLockedProvider!; }
function setLockedProvider(p: 'openai' | 'voyage' | 'mock') { globalEmbedLock.__pivotLockedProvider = p; }

/**
 * Show a prominent warning when falling back to mock embeddings.
 * Mock embeddings use simple keyword hashing — search quality is very poor.
 */
function warnMockEmbeddings(): void {
  if (!globalEmbedLock.__pivotMockWarningShown) {
    log.warn('Using MOCK embeddings — search quality will be very poor! Set OPENAI_API_KEY or VOYAGE_API_KEY in .env for real embeddings.');
    globalEmbedLock.__pivotMockWarningShown = true;
  }
}

// Generate embedding: OpenAI → Voyage AI → Mock
// Once a provider succeeds, all future calls use the same provider (#22/#24 R6)
// inputType: 'document' for indexing, 'query' for search queries (#R8-1)
export async function generateEmbedding(text: string, inputType: 'document' | 'query' = 'document'): Promise<number[]> {
  const locked = getLockedProvider();

  // If locked to a provider, use only that provider
  if (locked === 'openai') {
    return generateOpenAIEmbedding(text);
  }
  if (locked === 'voyage') {
    return generateVoyageEmbedding(text, inputType);
  }
  if (locked === 'mock') {
    return generateMockEmbedding(text);
  }

  // First call — use promise mutex to prevent concurrent provider lock race (#R8-2)
  if (!globalEmbedLock.__pivotLockPromise) {
    globalEmbedLock.__pivotLockPromise = resolveProvider(inputType).then(p => {
      setLockedProvider(p);
      return p;
    }).catch(err => {
      globalEmbedLock.__pivotLockPromise = null;
      throw err;
    });
  }
  await globalEmbedLock.__pivotLockPromise;
  // Now locked — recurse to use the locked path
  return generateEmbedding(text, inputType);
}

// Resolve the embedding provider on first use — just probes, doesn't return embeddings
async function resolveProvider(_inputType: 'document' | 'query'): Promise<'openai' | 'voyage' | 'mock'> {
  if (process.env.OPENAI_API_KEY) {
    try {
      await generateOpenAIEmbedding('test');
      setActualEmbeddingProvider('openai');
      log.info('Locked to OpenAI provider', { dimensions: 1536 });
      return 'openai';
    } catch (error) {
      log.warn('OpenAI embeddings failed, trying Voyage AI', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (process.env.VOYAGE_API_KEY) {
    try {
      await generateVoyageEmbedding('test', _inputType);
      setActualEmbeddingProvider('voyage');
      log.info('Locked to Voyage provider', { dimensions: 1024 });
      return 'voyage';
    } catch (error) {
      log.warn('Voyage AI embeddings failed, falling back to mock', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  warnMockEmbeddings();
  setActualEmbeddingProvider('mock');
  return 'mock';
}

// Batch embedding function — uses provider batch APIs instead of N individual calls (#23 R6)
// Entire batch uses the same provider to prevent dimension mismatch (#24 R6)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Ensure provider is locked by generating a single embedding first if needed
  if (!getLockedProvider()) {
    const first = await generateEmbedding(texts[0]);
    if (texts.length === 1) return [first];
    const rest = await generateEmbeddingsBatch(texts.slice(1));
    return [first, ...rest];
  }

  return generateEmbeddingsBatch(texts);
}

// Internal batch using locked provider's batch API
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const locked = getLockedProvider();
  if (locked === 'openai') {
    return generateOpenAIEmbeddings(texts);
  }
  if (locked === 'voyage') {
    return generateVoyageEmbeddings(texts);
  }
  // Mock — no batch API, but at least it's all same dimension
  return texts.map(t => generateMockEmbedding(t));
}

/**
 * Mock embedding generator — keyword-based hashing.
 * Quality is very poor compared to real embeddings. Only use as a last resort.
 */
function generateMockEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(1536).fill(0);

  const keywordWeights: Record<string, number> = {
    'total': 5, 'revenue': 5, 'spend': 5, 'procurement': 5, 'orders': 4,
    'summary': 3, 'monthly': 3, 'category': 3, 'regional': 3, 'supplier': 4,
    'generated': 2, 'average': 2, 'count': 2, 'top': 2,
    'purchase': 2, 'delivery': 3, 'defect': 3, 'quality': 3, 'lead': 2
  };

  words.forEach((word, idx) => {
    const weight = keywordWeights[word] || 1;
    const hash = word.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);

    for (let i = 0; i < 10 && (idx * 10 + i) < 1536; i++) {
      embedding[(Math.abs(hash) + i) % 1536] += weight / (idx + 1);
    }
  });

  if (text.includes('total') && (text.includes('revenue') || text.includes('spend'))) embedding[0] += 10;
  if (text.includes('monthly summary')) embedding[1] += 8;
  if (text.includes('product line summary') || text.includes('category summary')) embedding[2] += 8;
  if (text.includes('regional summary')) embedding[3] += 8;
  if (text.includes('supplier summary')) embedding[4] += 8;
  if (text.includes('$')) embedding[5] += 5;

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }

  return embedding;
}

// Calculate cosine similarity between two embeddings
// Returns 0 for degenerate inputs (zero-vector, NaN) (#27 R6)
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embeddings must have the same dimension (got ${a.length} vs ${b.length})`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Guard against NaN from corrupted embeddings (#27 R6)
  return Number.isFinite(similarity) ? similarity : 0;
}
