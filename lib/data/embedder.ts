import { DataChunk } from './chunker';
import { generateEmbeddings } from '@/lib/embeddings';
import { VectorStore, createVectorStore } from '@/lib/chroma';
import { invalidateDatasetCaches } from '@/lib/cache';

// Use globalThis to survive HMR in dev mode (#6)
const globalStores = globalThis as unknown as {
  __pivotDatasetStores?: Map<string, VectorStore>;
  __pivotDatasetOwners?: Map<string, string>;
  __pivotProcessingDatasets?: Set<string>;
};
if (!globalStores.__pivotDatasetStores) {
  globalStores.__pivotDatasetStores = new Map();
}
if (!globalStores.__pivotDatasetOwners) {
  globalStores.__pivotDatasetOwners = new Map();
}
if (!globalStores.__pivotProcessingDatasets) {
  globalStores.__pivotProcessingDatasets = new Set();
}
const datasetStores = globalStores.__pivotDatasetStores;
const datasetOwners = globalStores.__pivotDatasetOwners;
const processingDatasets = globalStores.__pivotProcessingDatasets;

// Maximum chunks to process — prevents OOM on large uploads (#24)
const MAX_CHUNKS = 10000;

// Maximum concurrent datasets in memory — LRU eviction when exceeded (#13)
const MAX_DATASETS = 50;

export async function embedAndStoreChunks(
  datasetId: string,
  chunks: DataChunk[],
  ownerId?: string,
): Promise<{ success: boolean; chunksStored: number; chunksAttempted: number; failedBatches: number }> {
  // Reject concurrent uploads for the same datasetId (#12)
  // Set immediately after check to prevent race (#R9-3, #20 R6)
  if (processingDatasets.has(datasetId)) {
    return { success: false, chunksStored: 0, chunksAttempted: chunks.length, failedBatches: 0 };
  }
  processingDatasets.add(datasetId);

  // Enforce max chunk count — use local var to avoid mutating parameter (#19 R6)
  let effectiveChunks = chunks;
  if (effectiveChunks.length > MAX_CHUNKS) {
    console.warn(`[Embedder] Truncating ${effectiveChunks.length} chunks to ${MAX_CHUNKS}`);
    effectiveChunks = effectiveChunks.slice(0, MAX_CHUNKS);
  }
  const store = createVectorStore(`dataset-${datasetId}`);

  // Store ownership for IDOR checks (#7)
  if (ownerId) {
    datasetOwners.set(datasetId, ownerId);
  }

  // Process chunks in batches — matches chroma.ts batch size (#33)
  const batchSize = 50;
  let totalStored = 0;
  let failedBatches = 0;

  try {
    for (let i = 0; i < effectiveChunks.length; i += batchSize) {
      const batch = effectiveChunks.slice(i, i + batchSize);
      try {
        const texts = batch.map(c => c.content);
        const embeddings = await generateEmbeddings(texts);

        const ids = batch.map((_, j) => `${datasetId}-chunk-${i + j}`);
        const metadatas = batch.map(c => c.metadata);
        const documents = batch.map(c => c.content);

        await store.addDocuments(ids, embeddings, metadatas, documents);
        totalStored += ids.length;
      } catch (error) {
        failedBatches++;
        console.error(`Failed to embed batch starting at chunk ${i}:`, error);
      }
    }
  } finally {
    // Always clear processing flag, even on unexpected errors (#39)
    processingDatasets.delete(datasetId);
  }

  // Report failure if all batches failed (#6)
  const success = totalStored > 0;
  if (success) {
    // Evict oldest datasets if at capacity — check processingDatasets to avoid evicting in-flight (#13, #R8)
    if (datasetStores.size >= MAX_DATASETS && !datasetStores.has(datasetId)) {
      // Find oldest that isn't currently being processed
      for (const key of datasetStores.keys()) {
        if (!processingDatasets.has(key)) {
          datasetStores.delete(key);
          datasetOwners.delete(key);
          console.log(`[Embedder] Evicted dataset ${key} (at capacity ${MAX_DATASETS})`);
          break;
        }
      }
    }
    // Register store only after all batches complete (#40)
    datasetStores.set(datasetId, store);
  } else {
    datasetOwners.delete(datasetId);
  }
  return { success, chunksStored: totalStored, chunksAttempted: effectiveChunks.length, failedBatches }; // (#11)
}

export function getDatasetStore(datasetId: string): VectorStore | undefined {
  const store = datasetStores.get(datasetId);
  if (store) {
    // LRU promotion — move to end to prevent eviction of active datasets (#R7)
    datasetStores.delete(datasetId);
    datasetStores.set(datasetId, store);
  }
  return store;
}

export function getDatasetOwner(datasetId: string): string | undefined {
  return datasetOwners.get(datasetId);
}

export function isDatasetProcessing(datasetId: string): boolean {
  return processingDatasets.has(datasetId);
}

export function hasDatasetStore(datasetId: string): boolean {
  return datasetStores.has(datasetId);
}

export function listDatasetStores(): string[] {
  return Array.from(datasetStores.keys());
}

// Delete a dataset — ownership-verified (#3 from review)
// Deny if owner is unknown (undefined) — safe direction for cold start (#17 R6)
export function deleteDatasetStore(datasetId: string, requestingUserId: string): boolean {
  const owner = datasetOwners.get(datasetId);
  if (!owner || owner !== requestingUserId) {
    return false; // Not authorized — also blocks when no owner recorded
  }
  datasetStores.delete(datasetId);
  datasetOwners.delete(datasetId);
  processingDatasets.delete(datasetId);
  invalidateDatasetCaches(datasetId); // Clear stale cached results (#21 R6)
  return true;
}
