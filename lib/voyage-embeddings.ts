/**
 * Voyage AI Embeddings — Anthropic's recommended embeddings provider
 * https://docs.voyageai.com/docs/embeddings
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';

function getVoyageApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error('VOYAGE_API_KEY not configured');
  }
  return key;
}

// inputType defaults to 'document'; pass 'query' for search queries (#25 R6)
export async function generateVoyageEmbedding(text: string, inputType: 'document' | 'query' = 'document'): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getVoyageApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage AI embedding failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  const item = data.data?.[0];
  if (!item) throw new Error('Voyage AI returned no embedding data');
  return item.embedding;
}

export async function generateVoyageEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 128; // Voyage supports up to 128 inputs per request
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getVoyageApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: 'document',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage AI batch embedding failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Voyage AI returned no batch embedding data');
    }
    // Sort by index to ensure order matches input — API may return in any order (#3 R7)
    const sorted = [...data.data].sort((a: { index: number }, b: { index: number }) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d: { embedding: number[] }) => d.embedding));
  }

  return allEmbeddings;
}
