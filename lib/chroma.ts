import { ChromaClient, Collection } from 'chromadb';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import * as fs from 'fs';
import * as path from 'path';

// For development, we'll use an in-memory store
// In production, this would connect to Chroma Cloud
class InMemoryVectorStore {
  private documents: Array<{
    id: string;
    embedding: number[];
    metadata: any;
    document: string;
  }> = [];

  async addDocuments(
    ids: string[],
    embeddings: number[][],
    metadatas: any[],
    documents: string[]
  ) {
    for (let i = 0; i < ids.length; i++) {
      this.documents.push({
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
    whereFilter?: any
  ) {
    // Filter documents if where filter is provided
    let filteredDocs = this.documents;
    if (whereFilter) {
      filteredDocs = this.documents.filter(doc => {
        for (const [key, value] of Object.entries(whereFilter)) {
          if (doc.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Calculate similarities with boost for summary chunks
    const similarities = filteredDocs.map(doc => {
      let baseSimilarity = cosineSimilarity(queryEmbedding, doc.embedding);

      // Boost score for summary chunks (monthly, category, regional summaries)
      if (doc.metadata?.type === 'monthly_summary') {
        baseSimilarity *= 1.5; // 50% boost for monthly summaries
      } else if (doc.metadata?.type === 'category_summary' || doc.metadata?.type === 'regional_summary') {
        baseSimilarity *= 1.3; // 30% boost for category/regional summaries
      }

      return {
        ...doc,
        similarity: Math.min(baseSimilarity, 1.0) // Cap at 1.0
      };
    });

    // Sort by similarity and return top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topResults = similarities.slice(0, nResults);

    return {
      ids: [topResults.map(r => r.id)],
      distances: [topResults.map(r => 1 - r.similarity)], // Convert similarity to distance
      metadatas: [topResults.map(r => r.metadata)],
      documents: [topResults.map(r => r.document)]
    };
  }

  async reset() {
    this.documents = [];
  }

  async count() {
    return this.documents.length;
  }
}

// Initialize the vector store
let vectorStore: InMemoryVectorStore | null = null;

export async function initializeVectorStore() {
  if (!vectorStore) {
    vectorStore = new InMemoryVectorStore();
    console.log('Initialized in-memory vector store');
  }
  return vectorStore;
}

export async function getVectorStore() {
  if (!vectorStore) {
    await initializeVectorStore();
  }
  return vectorStore!;
}

// Cache file path for embeddings
const EMBEDDINGS_CACHE_FILE = path.join(process.cwd(), '.embeddings-cache.json');

// Load cached embeddings if they exist
async function loadCachedEmbeddings(): Promise<Record<string, number[]>> {
  try {
    if (fs.existsSync(EMBEDDINGS_CACHE_FILE)) {
      const data = fs.readFileSync(EMBEDDINGS_CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Could not load embedding cache:', error);
  }
  return {};
}

// Save embeddings to cache
async function saveCachedEmbeddings(cache: Record<string, number[]>): Promise<void> {
  try {
    fs.writeFileSync(EMBEDDINGS_CACHE_FILE, JSON.stringify(cache));
  } catch (error) {
    console.error('Could not save embedding cache:', error);
  }
}

// Create a hash of content to detect changes
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Add chunks to the vector store
export async function addChunksToVectorStore(chunks: any[]) {
  const store = await getVectorStore();

  const ids: string[] = [];
  const embeddings: number[][] = [];
  const metadatas: any[] = [];
  const documents: string[] = [];

  console.log(`Processing ${chunks.length} chunks with cached embeddings...`);

  // Load existing cache
  const cache = await loadCachedEmbeddings();
  let cacheUpdated = false;

  // Generate embeddings for all chunks (with caching)
  for (const chunk of chunks) {
    const contentHash = hashContent(chunk.content);
    const cacheKey = `${chunk.id}_${contentHash}`;

    let embedding: number[];

    if (cache[cacheKey]) {
      // Use cached embedding
      embedding = cache[cacheKey];
    } else {
      // Generate new embedding and cache it
      embedding = await generateEmbedding(chunk.content);
      cache[cacheKey] = embedding;
      cacheUpdated = true;
    }

    ids.push(chunk.id);
    embeddings.push(embedding);
    metadatas.push(chunk.metadata || {});
    documents.push(chunk.content);
  }

  // Save updated cache if we generated new embeddings
  if (cacheUpdated) {
    await saveCachedEmbeddings(cache);
    console.log('Updated embedding cache');
  }

  await store.addDocuments(ids, embeddings, metadatas, documents);
  console.log(`Added ${chunks.length} chunks to vector store`);
}

// Search for relevant chunks
export async function searchChunks(
  query: string,
  limit: number = 5,
  filters?: any
): Promise<Array<{
  id: string;
  content: string;
  metadata: any;
  score: number;
}>> {
  const store = await getVectorStore();

  // Load cache and check for query embedding
  const cache = await loadCachedEmbeddings();
  const queryHash = hashContent(query);
  const queryCacheKey = `query_${queryHash}`;

  let queryEmbedding: number[];
  if (cache[queryCacheKey]) {
    queryEmbedding = cache[queryCacheKey];
  } else {
    // Generate embedding for the query and cache it
    queryEmbedding = await generateEmbedding(query);
    cache[queryCacheKey] = queryEmbedding;
    await saveCachedEmbeddings(cache);
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

  return {
    totalDocuments: count,
    indexType: 'in-memory',
    embeddingDimension: 384
  };
}

// Production Chroma Cloud integration (commented out for now)
/*
export async function initializeChromaCloud() {
  const client = new ChromaClient({
    path: process.env.CHROMA_CLOUD_URL,
    auth: {
      provider: 'token',
      credentials: process.env.CHROMA_API_KEY
    }
  });

  const collection = await client.getOrCreateCollection({
    name: process.env.CHROMA_COLLECTION_NAME || 'pivot-embeddings',
    metadata: {
      description: 'Pivot conversational AI embeddings'
    }
  });

  return collection;
}
*/