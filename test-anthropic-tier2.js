// Test script to verify which Anthropic models are accessible with Tier 2 API key
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '.env.local' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Models to test - ordered by preference for Tier 2
const models = [
  'claude-3-5-sonnet-20241022',   // Latest Claude 3.5 Sonnet (Tier 2+)
  'claude-3-5-sonnet-20240620',   // Previous Claude 3.5 Sonnet
  'claude-3-sonnet-20240229',     // Claude 3 Sonnet fallback
  'claude-3-5-haiku-20241022',    // Latest Claude 3.5 Haiku
  'claude-3-haiku-20240307',      // Claude 3 Haiku (base tier)
  'claude-3-opus-20240229',       // Opus (usually Tier 3+)
];

async function testModel(model) {
  try {
    console.log(`Testing ${model}...`);
    const response = await anthropic.messages.create({
      model,
      max_tokens: 100,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: 'What is 2+2? Just give the number.',
        },
      ],
    });
    console.log(`✅ ${model} WORKS - Response: ${response.content[0].text.trim()}`);
    return true;
  } catch (error) {
    console.log(`❌ ${model} FAILED - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing Anthropic models with your Tier 2 API key...\n');

  const results = [];
  for (const model of models) {
    const success = await testModel(model);
    results.push({ model, success });
  }

  console.log('\n=== SUMMARY ===');
  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (working.length > 0) {
    console.log('\nWorking models:');
    working.forEach(r => console.log(`  ✅ ${r.model}`));
  }

  if (failed.length > 0) {
    console.log('\nFailed models:');
    failed.forEach(r => console.log(`  ❌ ${r.model}`));
  }

  if (working.length > 0) {
    console.log(`\n🎉 Best available model: ${working[0].model}`);
  }
}

main().catch(console.error);