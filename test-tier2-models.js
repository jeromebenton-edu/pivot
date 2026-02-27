// Test Tier 2 models with correct naming as of Feb 2026
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '.env.local' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Current model names as of Feb 2026
// Based on Anthropic's latest naming conventions
const models = [
  // New naming (Jan 2025+)
  'claude-3.5-sonnet',
  'claude-3.5-haiku',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',

  // With version dates
  'claude-3.5-sonnet-20250131',
  'claude-3.5-sonnet-20250115',
  'claude-3.5-haiku-20250131',
  'claude-3.5-haiku-20250115',

  // Legacy names that might still work
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
  'claude-3-sonnet-20240229',

  // Instruct variants
  'claude-instant-1.2',
  'claude-2.1',
  'claude-2.0',
];

async function testModel(model) {
  try {
    console.log(`Testing ${model}...`);
    const response = await anthropic.messages.create({
      model,
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: 'Reply with just "OK"',
        },
      ],
    });
    console.log(`✅ ${model} WORKS - "${response.content[0].text.trim()}"`);
    return model;
  } catch (error) {
    if (error.status === 404) {
      console.log(`❌ ${model} - Not found`);
    } else if (error.status === 403) {
      console.log(`⛔ ${model} - No access (need higher tier)`);
    } else if (error.status === 401) {
      console.log(`🔒 ${model} - Unauthorized`);
    } else {
      console.log(`❌ ${model} - ${error.status || 'Error'}: ${error.message?.substring(0, 40)}`);
    }
    return null;
  }
}

async function main() {
  console.log('Testing Anthropic Tier 2 models...\n');
  console.log('API Key:', process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...\n');

  const working = [];
  for (const model of models) {
    const result = await testModel(model);
    if (result) working.push(result);
  }

  console.log('\n' + '='.repeat(50));
  if (working.length > 0) {
    console.log('✅ ACCESSIBLE MODELS:');
    working.forEach(m => console.log(`   - ${m}`));
    console.log(`\nBest model available: ${working[0]}`);
  } else {
    console.log('❌ No models accessible. Please check:');
    console.log('1. Your API key is correct in .env.local');
    console.log('2. Your account has been upgraded to Tier 2');
    console.log('3. The API key was created AFTER the tier upgrade');
  }
}

main().catch(console.error);