/**
 * OpenAI Embeddings for better vector search
 */

import OpenAI from 'openai';

// Use globalThis to survive HMR in dev mode (#R8)
const globalEmbedClient = globalThis as unknown as { __pivotOpenAIEmbedClient?: OpenAI | null };
if (globalEmbedClient.__pivotOpenAIEmbedClient === undefined) globalEmbedClient.__pivotOpenAIEmbedClient = null;

function getOpenAIClient(): OpenAI {
  if (!globalEmbedClient.__pivotOpenAIEmbedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for embeddings');
    }
    globalEmbedClient.__pivotOpenAIEmbedClient = new OpenAI({ apiKey });
  }
  return globalEmbedClient.__pivotOpenAIEmbedClient;
}

// Generate embedding using OpenAI (throws on failure — caller handles fallback)
export async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float'
  });

  const item = response.data[0];
  if (!item) throw new Error('OpenAI returned no embedding data');
  return item.embedding;
}

// Batch embedding function (throws on failure — caller handles fallback)
export async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();

  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      encoding_format: 'float'
    });

    // Sort by index to ensure order matches input — API may return in any order (#2 R7)
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map(d => d.embedding));
  }

  return embeddings;
}