/**
 * Embeddings service for generating vector representations of text
 * Uses Voyage AI in production, mock embeddings for development
 */

// Mock embedding function for development
// In production, this would use Voyage AI
export async function generateEmbedding(text: string): Promise<number[]> {
  // For development: generate a consistent mock embedding based on text content
  // This ensures similar texts get similar embeddings

  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(384).fill(0); // Standard embedding size

  // Define keyword weights for better semantic matching
  const keywordWeights: Record<string, number> = {
    'total': 5, 'revenue': 5, 'sales': 4, 'orders': 4,
    'summary': 3, 'monthly': 3, 'category': 3, 'regional': 3,
    'generated': 2, 'average': 2, 'count': 2, 'top': 2,
    'purchase': 2, 'bought': 2, 'sold': 2, 'price': 2
  };

  // Create embedding with keyword emphasis
  words.forEach((word, idx) => {
    const weight = keywordWeights[word] || 1;
    const hash = word.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);

    // Distribute word features across embedding dimensions with weight
    for (let i = 0; i < 10 && (idx * 10 + i) < 384; i++) {
      embedding[(hash + i) % 384] += weight / (idx + 1);
    }
  });

  // Add special dimensions for summary types
  if (text.includes('total revenue')) embedding[0] += 10;
  if (text.includes('monthly summary')) embedding[1] += 8;
  if (text.includes('category summary')) embedding[2] += 8;
  if (text.includes('regional summary')) embedding[3] += 8;
  if (text.includes('$')) embedding[4] += 5; // Currency indicator

  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }

  return embedding;
}

// Batch embedding function
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // In production, this would batch requests to Voyage AI
  return Promise.all(texts.map(text => generateEmbedding(text)));
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
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

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Voyage AI integration (commented out for now)
/*
import axios from 'axios';

export async function generateEmbeddingVoyage(text: string): Promise<number[]> {
  const response = await axios.post(
    'https://api.voyageai.com/v1/embeddings',
    {
      input: text,
      model: 'voyage-3',
      input_type: 'document'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.data[0].embedding;
}

export async function generateEmbeddingsVoyage(texts: string[]): Promise<number[][]> {
  const response = await axios.post(
    'https://api.voyageai.com/v1/embeddings',
    {
      input: texts,
      model: 'voyage-3',
      input_type: 'document'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.data.map((item: any) => item.embedding);
}
*/