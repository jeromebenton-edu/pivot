import { createHash } from 'crypto';
import { ChromaClient, type Collection, type Metadata } from 'chromadb';
import { createLogger } from '@/lib/logger';
import type { DataChunk } from '@/lib/types';
import { generateEmbedding, generateEmbeddings, cosineSimilarity } from './embeddings';
import * as fs from 'fs/promises';
import { existsSync, writeFileSync, renameSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

const log = createLogger('chroma');

// Metadata type used throughout the vector store
type ChunkMetadata = Record<string, unknown>;
type WhereFilter = Record<string, unknown>;

// Shared interface for all vector store implementations
export interface VectorStore {
  addDocuments(
    ids: string[],
    embeddings: number[][],
    metadatas: ChunkMetadata[],
    documents: string[],
  ): Promise<void>;
  query(
    queryEmbedding: number[],
    nResults?: number,
    whereFilter?: WhereFilter,
  ): Promise<{
    ids: string[][];
    distances: number[][];
    metadatas: ChunkMetadata[][];
    documents: string[][];
  }>;
  reset(): Promise<void>;
  count(): Promise<number>;
}

export class InMemoryVectorStore implements VectorStore {
  private documentsById = new Map<string, {
    id: string;
    embedding: number[];
    metadata: ChunkMetadata;
    document: string;
  }>();
  private expectedDimension: number | null = null; // Track embedding dimension (#3 R6)

  async addDocuments(
    ids: string[],
    embeddings: number[][],
    metadatas: ChunkMetadata[],
    documents: string[]
  ) {
    // Validate array lengths match to prevent silent misalignment (#3 review)
    const len = ids.length;
    if (embeddings.length !== len || metadatas.length !== len || documents.length !== len) {
      throw new Error(`[VectorStore] Array length mismatch: ids=${len}, embeddings=${embeddings.length}, metadatas=${metadatas.length}, documents=${documents.length}`);
    }

    // Validate embedding dimensions are consistent (#3 R6 Agent 2)
    for (let i = 0; i < len; i++) {
      const dim = embeddings[i].length;
      if (this.expectedDimension === null) {
        this.expectedDimension = dim;
      } else if (dim !== this.expectedDimension) {
        throw new Error(`[VectorStore] Embedding dimension mismatch: expected ${this.expectedDimension}, got ${dim} for id ${ids[i]}. This usually means the embedding provider changed mid-session.`);
      }
    }

    for (let i = 0; i < len; i++) {
      // Upsert by ID to prevent duplicates
      this.documentsById.set(ids[i], {
        id: ids[i],
        embedding: embeddings[i],
        metadata: metadatas[i],
        document: documents[i]
      });
    }
  }

  async query(
    queryEmbedding: number[],
    nResults: number = 10,
    whereFilter?: WhereFilter
  ) {
    // Materialize once to avoid double-allocation (#7 from review)
    const allDocs = Array.from(this.documentsById.values());

    // Filter documents if where filter is provided
    let filteredDocs = allDocs;
    if (whereFilter) {
      filteredDocs = allDocs.filter(doc => {
        for (const [key, value] of Object.entries(whereFilter)) {
          if (doc.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Calculate similarities with additive boost for summary chunks (#28)
    // Boost values tuned so summary chunks (which contain aggregated metrics the LLM
    // needs for accurate answers) rank above raw transaction chunks. Values chosen
    // empirically: monthly summaries are most critical for trend/forecast queries,
    // followed by cross-tab summaries, then category/region summaries. (#31)
    const similarities = filteredDocs.map(doc => {
      const baseSimilarity = cosineSimilarity(queryEmbedding, doc.embedding);

      let boost = 0;
      if (doc.metadata?.type === 'monthly_summary') {
        boost = 0.15; // Highest: needed for trend, forecast, and quarterly queries
      } else if (doc.metadata?.type === 'product_region_summary') {
        boost = 0.12; // Cross-tab: product×region breakdown queries
      } else if (doc.metadata?.type === 'product_monthly_summary' || doc.metadata?.type === 'region_monthly_summary') {
        boost = 0.10; // Per-entity time series
      } else if (doc.metadata?.type === 'category_summary' || doc.metadata?.type === 'regional_summary') {
        boost = 0.08; // Top-level aggregates
      }

      return {
        ...doc,
        similarity: baseSimilarity + boost, // Uncapped for ranking
        rawSimilarity: baseSimilarity, // Original score for reporting
      };
    });

    // Sort by boosted similarity and return top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topResults = similarities.slice(0, nResults);

    return {
      ids: [topResults.map(r => r.id)],
      distances: [topResults.map(r => Math.max(0, 1 - r.rawSimilarity))], // Report unboosted distance
      metadatas: [topResults.map(r => r.metadata)],
      documents: [topResults.map(r => r.document)]
    };
  }

  async reset() {
    this.documentsById.clear();
    this.expectedDimension = null; // Reset so new data can use different dimensions (#R7)
  }

  async count() {
    return this.documentsById.size;
  }
}

// Chroma Cloud vector store — persists embeddings across restarts
export class ChromaCloudVectorStore implements VectorStore {
  private client: ChromaClient;
  private collectionName: string;
  private collection: Collection | null = null;
  private collectionPromise: Promise<Collection> | null = null;

  constructor(cloudUrl: string, apiKey: string, collectionName: string) {
    this.client = new ChromaClient({
      path: cloudUrl,
      auth: { provider: 'token', credentials: apiKey },
    });
    this.collectionName = collectionName;
  }

  // Promise-based singleton to prevent race condition on concurrent getCollection (#14)
  private async getCollection() {
    if (this.collection) return this.collection;
    if (!this.collectionPromise) {
      this.collectionPromise = this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { description: 'Pivot conversational AI embeddings', 'hnsw:space': 'cosine' }, // Explicit cosine distance (#R9-3)
      }).then(col => {
        this.collection = col;
        this.collectionPromise = null;
        return col;
      }).catch(err => {
        this.collectionPromise = null; // Allow retry on next call (#1)
        throw err;
      });
    }
    return this.collectionPromise;
  }

  async addDocuments(
    ids: string[],
    embeddings: number[][],
    metadatas: ChunkMetadata[],
    documents: string[],
  ): Promise<void> {
    const col = await this.getCollection();
    const MAX_BATCH = 500;
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
      await col.upsert({
        ids: ids.slice(i, i + MAX_BATCH),
        embeddings: embeddings.slice(i, i + MAX_BATCH),
        metadatas: metadatas.slice(i, i + MAX_BATCH) as Metadata[],
        documents: documents.slice(i, i + MAX_BATCH),
      });
    }
  }

  async query(
    queryEmbedding: number[],
    nResults: number = 10,
    whereFilter?: WhereFilter,
  ) {
    const col = await this.getCollection();
    // Over-fetch 2x for post-query re-ranking with similarity boosts
    const fetchN = Math.min(nResults * 2, 100);
    const queryOpts: Record<string, unknown> = { queryEmbeddings: [queryEmbedding], nResults: fetchN };
    if (whereFilter) queryOpts.where = whereFilter;

    const raw = await col.query(queryOpts);

    // Re-rank with additive boosts (#28)
    const docs: Array<{ id: string; distance: number; metadata: ChunkMetadata; document: string; boostedSim: number; rawSim: number }> = [];
    for (let i = 0; i < (raw.ids?.[0]?.length || 0); i++) {
      const meta = raw.metadatas?.[0]?.[i] || {};
      // Clamp similarity to [0, 1] — L2 distance can exceed 1.0 producing negative sim (#4 R6)
      const rawSim = Math.max(0, Math.min(1, 1 - (raw.distances?.[0]?.[i] || 0)));

      let boost = 0;
      if (meta.type === 'monthly_summary') boost = 0.15;
      else if (meta.type === 'product_region_summary') boost = 0.12;
      else if (meta.type === 'product_monthly_summary' || meta.type === 'region_monthly_summary') boost = 0.10;
      else if (meta.type === 'category_summary' || meta.type === 'regional_summary') boost = 0.08;

      docs.push({
        id: raw.ids[0][i],
        distance: raw.distances?.[0]?.[i] || 0,
        metadata: meta,
        document: raw.documents?.[0]?.[i] || '',
        boostedSim: rawSim + boost,
        rawSim,
      });
    }

    docs.sort((a, b) => b.boostedSim - a.boostedSim);
    const top = docs.slice(0, nResults);

    return {
      ids: [top.map(d => d.id)],
      distances: [top.map(d => Math.max(0, 1 - d.rawSim))], // Report unboosted distance
      metadatas: [top.map(d => d.metadata)],
      documents: [top.map(d => d.document)],
    };
  }

  async reset(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: this.collectionName });
    } catch {
      // Collection may not exist
    }
    this.collection = null;
    this.collectionPromise = null; // Clear in-flight promise too (#15)
  }

  async count(): Promise<number> {
    const col = await this.getCollection();
    return col.count();
  }
}

// Factory: Chroma Cloud if configured, otherwise in-memory
export function createVectorStore(collectionName?: string): VectorStore {
  const cloudUrl = process.env.CHROMA_CLOUD_URL;
  const apiKey = process.env.CHROMA_API_KEY;
  const name = collectionName || process.env.CHROMA_COLLECTION_NAME || 'pivot-embeddings';

  if (cloudUrl && apiKey) {
    log.info('Using Chroma Cloud vector store', { collection: name });
    return new ChromaCloudVectorStore(cloudUrl, apiKey, name);
  }

  log.info('Using in-memory vector store');
  return new InMemoryVectorStore();
}

// Use globalThis to survive HMR in Next.js dev mode (#14)
const globalVS = globalThis as unknown as { __pivotVectorStorePromise?: Promise<VectorStore> };

export async function initializeVectorStore() {
  if (!globalVS.__pivotVectorStorePromise) {
    globalVS.__pivotVectorStorePromise = Promise.resolve(createVectorStore());
  }
  return globalVS.__pivotVectorStorePromise;
}

// Alias — same as initializeVectorStore, deduplicated (#15)
export const getVectorStore = initializeVectorStore;

// Cache file path — use /tmp on serverless (read-only fs), cwd otherwise (#8)
function getCacheFilePath(): string {
  const cwdPath = path.join(process.cwd(), '.embeddings-cache.json');
  // On Vercel/serverless, process.cwd() is read-only; fall back to /tmp
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), '.pivot-embeddings-cache.json');
  }
  return cwdPath;
}

// Committed read-only cache shipped with the repo for fast cold starts (#cold-start).
// Keyed by `${provider}_${chunkId}_${hash}` — provider prefix forces a clean cache miss
// if the embedding provider changes (e.g. OpenAI→Voyage), which is the correct fail-safe
// against dimension-mismatched embeddings. Never written to at runtime.
function getCommittedCacheFilePath(): string {
  return path.join(process.cwd(), 'data', 'embeddings-cache.json');
}

// In-memory embeddings cache — loaded from disk once, served from memory thereafter
// Capped at MAX_EMBEDDINGS_CACHE entries to prevent unbounded growth
const MAX_EMBEDDINGS_CACHE = 5000; // Lowered from 10000 to reduce memory/serialization spike (#R8)

// Use globalThis for cache state to survive HMR in dev mode (#R9)
const globalCacheState = globalThis as unknown as {
  __pivotEmbeddingsCache?: Map<string, number[]> | null;
  __pivotCacheLoadPromise?: Promise<Map<string, number[]>> | null;
  __pivotPendingSave?: ReturnType<typeof setTimeout> | null;
};
if (globalCacheState.__pivotEmbeddingsCache === undefined) globalCacheState.__pivotEmbeddingsCache = null;
if (globalCacheState.__pivotCacheLoadPromise === undefined) globalCacheState.__pivotCacheLoadPromise = null;
if (globalCacheState.__pivotPendingSave === undefined) globalCacheState.__pivotPendingSave = null;

// Track actual embedding provider used — set by embeddings.ts at generation time (#7)
// Falls back to env-var detection for cache key reads (before first generation)
const globalEmbedState = globalThis as unknown as { __pivotActualEmbeddingProvider?: string };

export function setActualEmbeddingProvider(provider: string): void {
  globalEmbedState.__pivotActualEmbeddingProvider = provider;
}

function getEmbeddingProvider(): string {
  if (globalEmbedState.__pivotActualEmbeddingProvider) return globalEmbedState.__pivotActualEmbeddingProvider;
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.VOYAGE_API_KEY) return 'voyage';
  return 'mock';
}

// Lazy singleton: loads from disk on first call, returns Map from memory after that
async function getEmbeddingsCache(): Promise<Map<string, number[]>> {
  if (globalCacheState.__pivotEmbeddingsCache) return globalCacheState.__pivotEmbeddingsCache;
  if (globalCacheState.__pivotCacheLoadPromise) return globalCacheState.__pivotCacheLoadPromise;

  globalCacheState.__pivotCacheLoadPromise = (async () => {
    const cache = new Map<string, number[]>();

    // Load committed read-only cache FIRST so runtime-generated entries can overwrite on collision (#cold-start)
    try {
      const committedFile = getCommittedCacheFilePath();
      if (existsSync(committedFile)) {
        const loadStart = Date.now();
        const data = await fs.readFile(committedFile, 'utf-8');
        const parsed = JSON.parse(data) as Record<string, number[]>;
        for (const [key, value] of Object.entries(parsed)) {
          cache.set(key, value);
        }
        log.info('Loaded committed embeddings cache', { count: cache.size, durationMs: Date.now() - loadStart });
      }
    } catch (error) {
      log.error('Could not load committed embedding cache', { error: error instanceof Error ? error.message : String(error) });
    }

    // Overlay writable cache — runtime entries (e.g. query embeddings) win on key collision
    try {
      const cacheFile = getCacheFilePath();
      if (existsSync(cacheFile)) {
        const loadStart = Date.now();
        const data = await fs.readFile(cacheFile, 'utf-8'); // Async read (#32)
        const parsed = JSON.parse(data) as Record<string, number[]>;
        let overlaid = 0;
        for (const [key, value] of Object.entries(parsed)) {
          cache.set(key, value);
          overlaid++;
        }
        log.info('Overlaid writable embeddings cache', { count: overlaid, totalAfter: cache.size, durationMs: Date.now() - loadStart });
      }
    } catch (error) {
      log.error('Could not load writable embedding cache', { error: error instanceof Error ? error.message : String(error) });
    }

    globalCacheState.__pivotEmbeddingsCache = cache;
    globalCacheState.__pivotCacheLoadPromise = null;
    return cache;
  })();

  return globalCacheState.__pivotCacheLoadPromise;
}

// Debounced async disk write — coalesces rapid updates, non-blocking (#32)
function scheduleCacheSave(): void {
  if (globalCacheState.__pivotPendingSave) clearTimeout(globalCacheState.__pivotPendingSave);
  globalCacheState.__pivotPendingSave = setTimeout(async () => {
    globalCacheState.__pivotPendingSave = null;
    if (!globalCacheState.__pivotEmbeddingsCache) return;
    try {
      const cacheFile = getCacheFilePath();
      const obj: Record<string, number[]> = {};
      for (const [key, value] of globalCacheState.__pivotEmbeddingsCache.entries()) {
        obj[key] = value;
      }
      const tmpFile = cacheFile + '.tmp';
      await fs.writeFile(tmpFile, JSON.stringify(obj));
      await fs.rename(tmpFile, cacheFile);
      log.info('Saved embeddings to disk cache', { count: globalCacheState.__pivotEmbeddingsCache.size });
    } catch (error) {
      log.error('Could not save embedding cache', { error: error instanceof Error ? error.message : String(error) });
    }
  }, 5000);
}

// Flush pending cache to disk on process exit (#27)
// Guard with globalThis flag to prevent duplicate listeners across HMR reloads (#5 R6)
const globalExitGuard = globalThis as unknown as { __pivotExitHandlersRegistered?: boolean };
if (typeof process !== 'undefined' && process.on && !globalExitGuard.__pivotExitHandlersRegistered) {
  globalExitGuard.__pivotExitHandlersRegistered = true;
  const flushCache = () => {
    if (globalCacheState.__pivotPendingSave) {
      clearTimeout(globalCacheState.__pivotPendingSave);
      globalCacheState.__pivotPendingSave = null;
    }
    if (!globalCacheState.__pivotEmbeddingsCache || globalCacheState.__pivotEmbeddingsCache.size === 0) return;
    try {
      // Use sync write on exit — async won't complete (static imports used, not require #R8)
      const cacheFile = getCacheFilePath();
      const obj: Record<string, number[]> = {};
      for (const [key, value] of globalCacheState.__pivotEmbeddingsCache.entries()) obj[key] = value;
      const tmpFile = cacheFile + '.tmp';
      writeFileSync(tmpFile, JSON.stringify(obj));
      renameSync(tmpFile, cacheFile);
    } catch { /* best-effort */ }
  };
  process.on('beforeExit', flushCache);
  process.on('SIGTERM', () => {
    flushCache();
    // Let the process exit naturally — process.exit(0) skips cleanup handlers (#R8)
  });
}

// SHA-256 hash truncated to 32 hex chars (128-bit) — collision-safe for expected workloads (#19)
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

// LRU-promote: delete and re-insert to move to end of Map iteration order (#35)
function lruPromote(cache: Map<string, number[]>, key: string): number[] | undefined {
  const val = cache.get(key);
  if (val !== undefined) {
    cache.delete(key);
    cache.set(key, val);
  }
  return val;
}

// Add chunks to the vector store
export async function addChunksToVectorStore(chunks: DataChunk[]) {
  const store = await getVectorStore();

  const ids: string[] = [];
  const embeddings: number[][] = [];
  const metadatas: ChunkMetadata[] = [];
  const documents: string[] = [];

  log.info('Processing chunks with cached embeddings', { count: chunks.length });

  // Load existing cache (from memory if already loaded, disk only on first call)
  const cache = await getEmbeddingsCache();
  const provider = getEmbeddingProvider();
  let cacheUpdated = false;

  // Process embeddings in batches for better performance
  const BATCH_SIZE = 50;
  const chunksNeedingEmbeddings: { chunk: DataChunk, index: number }[] = [];

  // First pass: check what needs embedding
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const contentHash = hashContent(chunk.content);
    const ck = `${provider}_${chunk.id}_${contentHash}`; // Include provider (#27)

    const cached = lruPromote(cache, ck); // LRU promote on hit (#35)
    if (cached) {
      ids.push(chunk.id);
      embeddings.push(cached);
      metadatas.push(chunk.metadata || {});
      documents.push(chunk.content);
    } else {
      chunksNeedingEmbeddings.push({ chunk, index: i });
    }
  }

  // Generate embeddings in batches
  if (chunksNeedingEmbeddings.length > 0) {
    log.info('Generating new embeddings', { count: chunksNeedingEmbeddings.length });

    for (let i = 0; i < chunksNeedingEmbeddings.length; i += BATCH_SIZE) {
      const batch = chunksNeedingEmbeddings.slice(i, i + BATCH_SIZE);
      log.info('Processing embedding batch', { batch: Math.floor(i / BATCH_SIZE) + 1, total: Math.ceil(chunksNeedingEmbeddings.length / BATCH_SIZE) });

      const batchTexts = batch.map(({ chunk }) => chunk.content);
      const batchEmbeddings = await generateEmbeddings(batchTexts);

      // Validate batch embedding count matches input (#R7, #R9 throw instead of log)
      if (batchEmbeddings.length !== batch.length) {
        throw new Error(`[VectorStore] Batch embedding count mismatch: expected ${batch.length}, got ${batchEmbeddings.length}`);
      }

      const batchResults = batch.map(({ chunk }, index) => ({
        chunk,
        embedding: batchEmbeddings[index],
        cacheKey: `${provider}_${chunk.id}_${hashContent(chunk.content)}`
      }));

      for (const { chunk, embedding, cacheKey: ck } of batchResults) {
        // Evict oldest entries if at capacity
        if (cache.size >= MAX_EMBEDDINGS_CACHE) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(ck, embedding);
        cacheUpdated = true;

        ids.push(chunk.id);
        embeddings.push(embedding);
        metadatas.push(chunk.metadata || {});
        documents.push(chunk.content);
      }
    }
  }

  // Schedule async disk write if we generated new embeddings
  if (cacheUpdated) {
    scheduleCacheSave();
  }

  await store.addDocuments(ids, embeddings, metadatas, documents);
  log.info('Added chunks to vector store', { count: chunks.length });
}

// Search for relevant chunks
export async function searchChunks(
  query: string,
  limit: number = 5,
  filters?: WhereFilter
): Promise<Array<{
  id: string;
  content: string;
  metadata: ChunkMetadata;
  score: number;
}>> {
  const store = await getVectorStore();

  // Check in-memory cache for query embedding
  const cache = await getEmbeddingsCache();
  const provider = getEmbeddingProvider();
  const queryHash = hashContent(query);
  const queryCacheKey = `query_${provider}_${queryHash}`; // Include provider (#27)

  let queryEmbedding: number[];
  const cached = lruPromote(cache, queryCacheKey); // LRU promote on hit (#35)
  if (cached) {
    queryEmbedding = cached;
  } else {
    queryEmbedding = await generateEmbedding(query, 'query');
    if (cache.size >= MAX_EMBEDDINGS_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(queryCacheKey, queryEmbedding);
    scheduleCacheSave();
  }

  // Search the vector store
  const results = await store.query(queryEmbedding, limit, filters);

  // Format the results
  const formattedResults = [];
  for (let i = 0; i < results.ids[0].length; i++) {
    formattedResults.push({
      id: results.ids[0][i],
      content: results.documents[0][i],
      metadata: results.metadatas[0][i],
      score: 1 - results.distances[0][i] // Convert distance back to similarity score
    });
  }

  return formattedResults;
}

// Get statistics about the vector store
export async function getVectorStoreStats() {
  const store = await getVectorStore();
  const count = await store.count();
  const isCloud = store instanceof ChromaCloudVectorStore;

  // Detect embedding dimension from actual provider rather than env heuristic (#36, #R8)
  const actualProvider = globalEmbedState.__pivotActualEmbeddingProvider;
  let embeddingDimension = 1536; // Default (OpenAI / mock)
  if (actualProvider === 'voyage') {
    embeddingDimension = 1024;
  }

  return {
    totalDocuments: count,
    indexType: isCloud ? 'chroma-cloud' : 'in-memory',
    embeddingDimension,
  };
}
