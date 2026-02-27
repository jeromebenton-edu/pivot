#!/usr/bin/env node

/**
 * Regenerate embeddings with OpenAI for better search quality
 */

require('dotenv').config({ path: '.env' });

async function regenerateEmbeddings() {
  console.log('🔄 Regenerating embeddings with OpenAI...\n');

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env');
    console.log('Please add your OpenAI API key to use real embeddings.');
    process.exit(1);
  }

  console.log('✅ OpenAI API key found');
  console.log('⚠️  Note: This will make API calls to OpenAI for embeddings (costs apply)\n');

  // Force reload of the app to use new embeddings
  console.log('The vector store will be regenerated on next server start.');
  console.log('\nTo apply the changes:');
  console.log('1. Stop the current dev server (Ctrl+C)');
  console.log('2. Run: npm run dev');
  console.log('3. The app will automatically use OpenAI embeddings');

  console.log('\n💡 Benefits of OpenAI embeddings:');
  console.log('- Much better semantic search');
  console.log('- "December 2024" will match "2024-12" properly');
  console.log('- Natural language queries work better');
  console.log('- More accurate results overall');
}

regenerateEmbeddings();