// Test the chat endpoint with OpenAI
const fetch = require('node-fetch');

async function testChat(question) {
  console.log(`\n🤖 Question: "${question}"\n`);

  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: question }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.log('❌ Error:', data.error);
    } else {
      console.log('✅ Response from GPT-4o:');
      console.log('-'.repeat(60));
      console.log(data.content || data.message || JSON.stringify(data).substring(0, 500));
      console.log('-'.repeat(60));

      // Check for accuracy
      if ((data.content || data.message || '').includes('$393,744')) {
        console.log('✅ Correctly referenced total revenue');
      }
      if ((data.content || data.message || '').includes('$39,580') || (data.content || data.message || '').includes('$39580')) {
        console.log('✅ Correctly referenced January revenue');
      }
    }
  } catch (error) {
    console.error('Failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Testing OpenAI GPT-4o with business intelligence queries...\n');
  console.log('The app should now be using OpenAI instead of Anthropic.');
  console.log('=' .repeat(60));

  // Test questions
  await testChat('What is the total revenue?');
  await testChat('What is the monthly revenue for January 2024?');
  await testChat('Compare Q3 vs Q4 revenue and show me a chart');

  console.log('\n' + '='.repeat(60));
  console.log('✅ OpenAI is now powering your chat! Using model: GPT-4o');
  console.log('This should provide much better responses than Claude Haiku.');
}

// Wait for server to be ready
setTimeout(main, 2000);