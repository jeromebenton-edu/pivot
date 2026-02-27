// Test script to verify which Anthropic models are accessible
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '.env.local' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Latest models as of Feb 2026
const models = [
  // Claude 3.5 models (newest)
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',

  // Claude 3 models
  'claude-3-opus-latest',
  'claude-3-sonnet-latest',
  'claude-3-haiku-latest',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',

  // Possible alternate IDs
  'claude-3.5-sonnet',
  'claude-3.5-haiku',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
];

async function testModel(model) {
  try {
    console.log(`Testing ${model}...`);
    const response = await anthropic.messages.create({
      model,
      max_tokens: 50,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: 'Say "yes" if you work',
        },
      ],
    });
    console.log(`✅ ${model} WORKS`);
    return true;
  } catch (error) {
    const errorMsg = error.message.includes('404') ? 'Not found' :
                     error.message.includes('401') ? 'Unauthorized' :
                     error.message.includes('403') ? 'Forbidden' :
                     error.message.substring(0, 50);
    console.log(`❌ ${model} - ${errorMsg}`);
    return false;
  }
}

async function main() {
  console.log('Testing all possible Anthropic model IDs...\n');

  const results = [];
  for (const model of models) {
    const success = await testModel(model);
    results.push({ model, success });
    if (success) {
      // Test a bit more to confirm it really works
      console.log(`   Confirming ${model}...`);
      const confirm = await testModel(model);
      if (!confirm) {
        console.log(`   Warning: ${model} worked once but failed on retry`);
      }
    }
  }

  console.log('\n=== RESULTS ===');
  const working = results.filter(r => r.success);

  if (working.length > 0) {
    console.log('\n✅ WORKING MODELS:');
    working.forEach(r => console.log(`   ${r.model}`));
    console.log(`\n🎉 You have access to ${working.length} model(s)`);
    console.log(`   Best available: ${working[0].model}`);
  } else {
    console.log('\n❌ No models are currently accessible with this API key');
  }
}

main().catch(console.error);