const fs = require('fs');
const path = require('path');

// Load the chunks we created
const chunksPath = path.join(__dirname, '../samples/data_chunks.json');
const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

// For now, we'll just validate the chunks are ready for embedding
// In production, this would actually load them into Chroma Cloud

console.log('Validating chunks for embedding...');
console.log(`Total chunks to embed: ${chunks.length}`);

// Check chunk structure
const sampleChunk = chunks[0];
console.log('\nSample chunk structure:');
console.log('- ID:', sampleChunk.id);
console.log('- Content length:', sampleChunk.content.length, 'characters');
console.log('- Metadata keys:', Object.keys(sampleChunk.metadata || {}).join(', '));

// Analyze content distribution
const contentLengths = chunks.map(c => c.content.length);
const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length;
const minLength = Math.min(...contentLengths);
const maxLength = Math.max(...contentLengths);

console.log('\nContent statistics:');
console.log(`- Average length: ${avgLength.toFixed(0)} characters`);
console.log(`- Min length: ${minLength} characters`);
console.log(`- Max length: ${maxLength} characters`);

// Group by metadata type
const typeGroups = {};
chunks.forEach(chunk => {
  const type = chunk.metadata?.type || 'transaction';
  typeGroups[type] = (typeGroups[type] || 0) + 1;
});

console.log('\nChunks by type:');
Object.entries(typeGroups).forEach(([type, count]) => {
  console.log(`- ${type}: ${count}`);
});

console.log('\n✅ Chunks are ready for embedding!');
console.log('Next step: When Voyage AI and Chroma Cloud are configured, run the embedding pipeline.');

module.exports = { chunks };