#!/usr/bin/env node

/**
 * Pre-compute OpenAI embeddings for indexable chunks and write a committed cache
 * to data/embeddings-cache.json. Eliminates the ~2 minute cold-start delay where
 * initializeRAG would otherwise embed all chunks on first request (#cold-start).
 *
 * Cache key format MUST match lib/chroma.ts: `${provider}_${chunk.id}_${hash}`
 * Hash MUST match lib/chroma.ts hashContent: sha256 truncated to 32 hex chars.
 */

require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// Mirrors lib/chroma.ts hashContent — keep in sync (#cold-start)
function hashContent(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

// Mirrors lib/mcp-tools.ts isIndexableChunk — keep in sync (#cold-start)
function isIndexableChunk(chunk) {
  const type = chunk.metadata && chunk.metadata.type;
  if (!type) return false;
  const t = String(type);
  return t.includes('summary') || t.includes('overview') || t.includes('insights');
}

const PROVIDER = 'openai';
const MODEL = 'text-embedding-3-small'; // Must match lib/openai-embeddings.ts
const BATCH_SIZE = 128;

async function embedBatch(apiKey, inputs) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: inputs,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${body}`);
  }

  const data = await response.json();
  // Sort by index to preserve input order — API may return in any order
  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function main() {
  console.log('Pre-computing embeddings for indexable chunks...');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not found in .env');
    process.exit(1);
  }

  const chunksPath = path.join(__dirname, '..', 'data', 'samples', 'data_chunks.json');
  if (!fs.existsSync(chunksPath)) {
    console.error(`ERROR: ${chunksPath} not found`);
    process.exit(1);
  }

  const allChunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  const chunks = allChunks.filter(isIndexableChunk);
  console.log(`Found ${allChunks.length} total chunks, ${chunks.length} indexable`);

  const outFile = path.join(__dirname, '..', 'data', 'embeddings-cache.json');
  const cache = {};

  let processed = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((c) => c.content);
    const embeddings = await embedBatch(apiKey, inputs);

    if (embeddings.length !== batch.length) {
      throw new Error(`Batch size mismatch: expected ${batch.length}, got ${embeddings.length}`);
    }

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const key = `${PROVIDER}_${chunk.id}_${hashContent(chunk.content)}`;
      cache[key] = embeddings[j];
    }

    processed += batch.length;
    console.log(`  ${processed}/${chunks.length} embedded`);
  }

  fs.writeFileSync(outFile, JSON.stringify(cache));
  const sizeBytes = fs.statSync(outFile).size;
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`\nDone. Wrote ${Object.keys(cache).length} entries to ${outFile} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
