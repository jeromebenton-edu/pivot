#!/usr/bin/env node

// Test which Claude models your API key can access
require('dotenv').config({ path: '.env.local' });
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const models = [
  'claude-3-5-sonnet-20241022',  // Latest Claude 3.5 Sonnet
  'claude-3-5-sonnet-20240620',  // Earlier Claude 3.5 Sonnet
  'claude-3-opus-20240229',       // Claude 3 Opus
  'claude-3-sonnet-20240229',     // Claude 3 Sonnet
  'claude-3-haiku-20240307',      // Claude 3 Haiku
];

async function testModel(modelId) {
  try {
    console.log(`Testing ${modelId}...`);
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "yes"' }],
    });
    console.log(`✅ ${modelId}: AVAILABLE`);
    return true;
  } catch (error) {
    if (error.status === 404) {
      console.log(`❌ ${modelId}: NOT AVAILABLE (model not found)`);
    } else if (error.status === 403) {
      console.log(`❌ ${modelId}: FORBIDDEN (no access with your plan)`);
    } else if (error.status === 429) {
      console.log(`⚠️  ${modelId}: RATE LIMITED (but available)`);
    } else {
      console.log(`❌ ${modelId}: ERROR - ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('Testing Claude model availability with your API key...\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not found in .env.local');
    process.exit(1);
  }

  const results = [];
  for (const model of models) {
    const available = await testModel(model);
    results.push({ model, available });
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== SUMMARY ===');
  const availableModels = results.filter(r => r.available);
  if (availableModels.length > 0) {
    console.log('\nAvailable models:');
    availableModels.forEach(r => console.log(`  • ${r.model}`));
  } else {
    console.log('\nNo models available - check your API key and plan');
  }

  // Determine likely plan tier
  console.log('\n=== LIKELY PLAN TIER ===');
  if (results.find(r => r.model.includes('3-5-sonnet') && r.available)) {
    console.log('Scale tier or higher (has access to Claude 3.5 Sonnet)');
  } else if (results.find(r => r.model.includes('opus') && r.available)) {
    console.log('Scale tier (has access to Opus)');
  } else if (results.find(r => r.model === 'claude-3-sonnet-20240229' && r.available)) {
    console.log('Build tier (has access to Claude 3 Sonnet)');
  } else if (results.find(r => r.model === 'claude-3-haiku-20240307' && r.available)) {
    console.log('Free tier (only has access to Haiku)');
  } else {
    console.log('Unable to determine - possibly invalid API key');
  }
}

main().catch(console.error);