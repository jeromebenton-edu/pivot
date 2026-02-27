// Test the chat endpoint with a simple question
const fetch = require('node-fetch');

async function testChat(question) {
  console.log(`\nQuestion: "${question}"\n`);

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
      console.log('Error:', data.error);
    } else {
      console.log('Response from Haiku:');
      console.log('-'.repeat(50));
      console.log(data.message);
      console.log('-'.repeat(50));

      // Check if it's hallucinating or giving correct data
      if (data.message.includes('$393,744')) {
        console.log('✅ Correctly referenced total revenue');
      }
      if (data.message.includes('hallucin') || data.message.includes('make up')) {
        console.log('⚠️  Model acknowledges potential inaccuracy');
      }
    }
  } catch (error) {
    console.error('Failed:', error.message);
  }
}

async function main() {
  console.log('Testing Claude 3 Haiku accuracy with business data...\n');

  // Test questions
  await testChat('What is the total revenue?');
  await testChat('What is the monthly revenue for January 2024?');
  await testChat('Compare Q3 vs Q4 revenue');
  await testChat('What are the top performing regions?');
}

// Wait a moment for server to be ready
setTimeout(main, 2000);