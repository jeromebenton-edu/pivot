import { ChromaClient, Collection } from 'chromadb';
import { generateEmbedding, cosineSimilarity } from './embeddings';

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

    // Calculate similarities
    const similarities = filteredDocs.map(doc => ({
      ...doc,
      similarity: cosineSimilarity(queryEmbedding, doc.embedding)
    }));

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

// Add chunks to the vector store
export async function addChunksToVectorStore(chunks: any[]) {
  const store = await getVectorStore();

  const ids: string[] = [];
  const embeddings: number[][] = [];
  const metadatas: any[] = [];
  const documents: string[] = [];

  // Generate embeddings for all chunks
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);
    ids.push(chunk.id);
    embeddings.push(embedding);
    metadatas.push(chunk.metadata || {});
    documents.push(chunk.content);
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

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

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