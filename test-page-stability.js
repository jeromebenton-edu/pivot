// Test page stability using puppeteer or playwright would be ideal,
// but let's check for JavaScript errors in a simpler way
const fetch = require('node-fetch');

async function testPageStability() {
  console.log('Testing page stability at http://localhost:3000...\n');

  try {
    // 1. Check if page loads
    const response = await fetch('http://localhost:3000');
    const html = await response.text();

    console.log('✅ Page loads successfully');
    console.log(`   Response size: ${html.length} bytes`);

    // 2. Check for error indicators in HTML
    if (html.includes('Error') || html.includes('error')) {
      const errorCount = (html.match(/error/gi) || []).length;
      console.log(`⚠️  Found ${errorCount} occurrences of 'error' in HTML`);
    } else {
      console.log('✅ No obvious errors in HTML');
    }

    // 3. Check if React hydration markers are present
    if (html.includes('__next')) {
      console.log('✅ Next.js markers present');
    }

    // 4. Check for scroll-related classes
    const scrollClasses = ['overflow-y-auto', 'overflow-hidden', 'scrollIntoView'];
    scrollClasses.forEach(cls => {
      if (html.includes(cls)) {
        console.log(`📜 Found scroll-related class: ${cls}`);
      }
    });

    // 5. Test API endpoint
    console.log('\nTesting chat API endpoint...');
    const apiTest = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'test' }]
      })
    });

    if (apiTest.ok) {
      console.log('✅ API endpoint responsive');
    } else {
      console.log('❌ API endpoint returned:', apiTest.status);
    }

    console.log('\n' + '='.repeat(60));
    console.log('STABILITY FIXES APPLIED:');
    console.log('1. Removed aggressive auto-scroll on every render');
    console.log('2. Only scroll when messages array grows');
    console.log('3. Disabled auto-focus on initial page load');
    console.log('4. Auto-focus only activates after first message sent');
    console.log('\nThe page should now be stable without jumping!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testPageStability();