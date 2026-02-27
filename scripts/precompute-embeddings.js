#!/usr/bin/env node

/**
 * Pre-compute embeddings for all chunks to eliminate real-time generation delays
 */

require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');

// Simple OpenAI client
class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async createEmbedding(text) {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}

// Hash function for content (same as in chroma.ts)
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

async function precomputeEmbeddings() {
  console.log('🚀 Pre-computing embeddings for all chunks...\n');

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env');
    console.log('Please add your OpenAI API key to use real embeddings.');
    process.exit(1);
  }

  console.log('✅ OpenAI API key found');

  const client = new OpenAIClient(process.env.OPENAI_API_KEY);

  // Load chunks
  const chunksPath = path.join(__dirname, '../data/samples/data_chunks.json');
  if (!fs.existsSync(chunksPath)) {
    console.error('❌ data_chunks.json not found');
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  console.log(`📊 Found ${chunks.length} chunks to process`);

  // Cache file path
  const cacheFile = path.join(__dirname, '../.embeddings-cache.json');

  // Load existing cache
  let cache = {};
  if (fs.existsSync(cacheFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      console.log(`📦 Loaded existing cache with ${Object.keys(cache).length} entries`);
    } catch (error) {
      console.log('⚠️  Could not load existing cache, starting fresh');
      cache = {};
    }
  }

  let generated = 0;
  let cached = 0;
  let errors = 0;

  console.log('\n🔄 Processing chunks...');

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const contentHash = hashContent(chunk.content);
    const cacheKey = `${chunk.id}_${contentHash}`;

    process.stdout.write(`\r[${i + 1}/${chunks.length}] Processing chunk ${chunk.id}...`);

    if (cache[cacheKey]) {
      cached++;
      continue;
    }

    try {
      // Generate embedding
      const embedding = await client.createEmbedding(chunk.content);
      cache[cacheKey] = embedding;
      generated++;

      // Save cache every 10 chunks to avoid losing progress
      if (generated % 10 === 0) {
        fs.writeFileSync(cacheFile, JSON.stringify(cache));
      }

      // Rate limit: wait 100ms between requests to avoid hitting API limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`\n❌ Error processing chunk ${chunk.id}:`, error.message);
      errors++;

      // If we hit rate limits, wait longer
      if (error.message.includes('rate') || error.message.includes('429')) {
        console.log('⏱️  Rate limit hit, waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  // Save final cache
  fs.writeFileSync(cacheFile, JSON.stringify(cache));

  console.log('\n\n✅ Pre-computation completed!');
  console.log(`📈 Statistics:`);
  console.log(`   - New embeddings generated: ${generated}`);
  console.log(`   - Already cached: ${cached}`);
  console.log(`   - Errors: ${errors}`);
  console.log(`   - Total cache entries: ${Object.keys(cache).length}`);
  console.log(`\n💾 Cache saved to: ${cacheFile}`);

  if (errors === 0) {
    console.log('\n🎉 All embeddings are ready! The app will now respond much faster.');
  } else {
    console.log('\n⚠️  Some embeddings failed to generate. You may want to run this script again.');
  }
}

precomputeEmbeddings().catch(console.error);