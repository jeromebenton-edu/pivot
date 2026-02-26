// Test script to verify OpenAI integration
const OpenAI = require('openai');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function testOpenAI() {
  console.log('\n🔍 Testing OpenAI Integration...\n');

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('Please add your OpenAI API key to .env.local:\n');
    console.log('OPENAI_API_KEY=your-api-key-here\n');
    return;
  }

  console.log('✅ OpenAI API key found');

  const client = new OpenAI({ apiKey });

  // Test models in priority order
  const models = [
    'gpt-5.2',
    'gpt-5',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
  ];

  console.log('\n📊 Testing available models:\n');

  for (const model of models) {
    try {
      console.log(`Testing ${model}...`);

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Hello" in one word.' }
        ],
        max_tokens: 10,
        temperature: 0
      });

      console.log(`✅ ${model} - AVAILABLE`);
      console.log(`   Response: ${response.choices[0].message.content}\n`);
    } catch (error) {
      if (error.status === 404) {
        console.log(`❌ ${model} - NOT AVAILABLE (404)\n`);
      } else if (error.status === 401) {
        console.log(`❌ ${model} - AUTHENTICATION ERROR (401)`);
        console.log('   Your API key may be invalid\n');
      } else if (error.status === 429) {
        console.log(`⚠️  ${model} - RATE LIMITED (429)\n`);
      } else {
        console.log(`❌ ${model} - ERROR: ${error.message}\n`);
      }
    }
  }

  console.log('✅ OpenAI integration test complete!\n');
}

testOpenAI().catch(console.error);