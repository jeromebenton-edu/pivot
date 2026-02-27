/**
 * OpenAI Embeddings for better vector search
 */

import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for embeddings');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Generate embedding using OpenAI
export async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient();

    const response = await client.embeddings.create({
      model: 'text-embedding-3-small', // Fast, cheap, and good quality
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error);
    // Fallback to mock embedding if OpenAI fails
    return generateMockEmbedding(text);
  }
}

// Batch embedding function for efficiency
export async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const client = getOpenAIClient();

    // OpenAI can handle up to 2048 inputs in a single request
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
        encoding_format: 'float'
      });

      embeddings.push(...response.data.map(d => d.embedding));
    }

    return embeddings;
  } catch (error) {
    console.error('OpenAI batch embedding error:', error);
    // Fallback to mock embeddings
    return Promise.all(texts.map(text => generateMockEmbedding(text)));
  }
}

// Fallback mock embedding (same as before but simpler)
function generateMockEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(1536).fill(0); // OpenAI embedding size

  // Simple hash-based embedding for consistency
  words.forEach((word, idx) => {
    const hash = word.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);

    for (let i = 0; i < 10 && (idx * 10 + i) < 1536; i++) {
      embedding[(Math.abs(hash) + i) % 1536] += 1 / (idx + 1);
    }
  });

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }

  return embedding;
}