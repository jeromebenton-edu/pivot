#!/usr/bin/env node

/**
 * Add average order value (AOV) data by category
 */

const fs = require('fs');
const path = require('path');

// Load existing chunks
const chunksPath = path.join(__dirname, '../data/samples/data_chunks.json');
const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

// Category AOV data based on realistic e-commerce patterns
// Higher AOV for electronics/home, lower for books/toys
const categoryAOVData = {
  'Electronics': {
    totalRevenue: 193083.72,
    orderCount: 99,
    aov: 1950.34,  // High-ticket items like TVs, laptops
    topProducts: ['Samsung 65" OLED TV ($2,500+)', 'MacBook Pro ($1,800+)', 'iPad Pro ($1,200+)']
  },
  'Home & Garden': {
    totalRevenue: 60984.62,
    orderCount: 120,
    aov: 508.21,  // Mid-range furniture and appliances
    topProducts: ['Smart Home Hub ($300+)', 'Garden Tool Set ($250+)', 'Outdoor Furniture ($400+)']
  },
  'Sports & Outdoors': {
    totalRevenue: 90021.36,
    orderCount: 101,
    aov: 891.30,  // Premium sports equipment
    topProducts: ['Mountain Bike ($1,200+)', 'Camping Gear Set ($500+)', 'Fitness Equipment ($600+)']
  },
  'Clothing': {
    totalRevenue: 26840.24,
    orderCount: 126,
    aov: 213.02,  // Moderate fashion items
    topProducts: ['Designer Jeans ($120+)', 'Winter Jacket ($200+)', 'Running Shoes ($150+)']
  },
  'Toys & Games': {
    totalRevenue: 17312.42,
    orderCount: 110,
    aov: 157.39,  // Lower-priced items for kids
    topProducts: ['LEGO Sets ($100+)', 'Board Games ($50+)', 'Action Figures ($30+)']
  },
  'Books': {
    totalRevenue: 5502.26,
    orderCount: 103,
    aov: 53.42,  // Lowest AOV category
    topProducts: ['Hardcover Bestsellers ($25+)', 'Technical Books ($60+)', 'Book Sets ($80+)']
  }
};

// Calculate overall statistics
const overallStats = {
  totalRevenue: Object.values(categoryAOVData).reduce((sum, cat) => sum + cat.totalRevenue, 0),
  totalOrders: Object.values(categoryAOVData).reduce((sum, cat) => sum + cat.orderCount, 0),
  overallAOV: 0
};
overallStats.overallAOV = (overallStats.totalRevenue / overallStats.totalOrders).toFixed(2);

// Create new AOV chunks
const aovChunks = [];

// Add individual category AOV chunks
Object.entries(categoryAOVData).forEach(([category, data]) => {
  const chunkId = `chunk_aov_${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  aovChunks.push({
    id: chunkId,
    content: `Average Order Value for ${category}: $${data.aov.toFixed(2)} based on ${data.orderCount} orders totaling $${data.totalRevenue.toFixed(2)}. This represents an AOV that is ${data.aov > parseFloat(overallStats.overallAOV) ? 'above' : 'below'} the overall average of $${overallStats.overallAOV}. Top selling products in this category include: ${data.topProducts.join(', ')}.`,
    metadata: {
      type: 'category_aov',
      category: category,
      aov: data.aov,
      total_revenue: data.totalRevenue,
      order_count: data.orderCount,
      top_products: data.topProducts
    }
  });
});

// Add AOV comparison chunk
const sortedByAOV = Object.entries(categoryAOVData)
  .sort((a, b) => b[1].aov - a[1].aov)
  .map(([cat, data]) => `${cat}: $${data.aov.toFixed(2)}`);

aovChunks.push({
  id: 'chunk_aov_comparison',
  content: `Average Order Value comparison across all categories: ${sortedByAOV.join(', ')}. Electronics has the highest AOV at $${categoryAOVData.Electronics.aov.toFixed(2)}, driven by high-ticket items like TVs and laptops. Books has the lowest AOV at $${categoryAOVData.Books.aov.toFixed(2)}. The overall average order value across all categories is $${overallStats.overallAOV}.`,
  metadata: {
    type: 'aov_comparison',
    highest_aov_category: 'Electronics',
    highest_aov: categoryAOVData.Electronics.aov,
    lowest_aov_category: 'Books',
    lowest_aov: categoryAOVData.Books.aov,
    overall_aov: parseFloat(overallStats.overallAOV)
  }
});

// Add AOV insights chunk
aovChunks.push({
  id: 'chunk_aov_insights',
  content: `Key AOV insights: Electronics ($${categoryAOVData.Electronics.aov.toFixed(2)}) and Sports & Outdoors ($${categoryAOVData['Sports & Outdoors'].aov.toFixed(2)}) have the highest average order values, indicating customers make larger purchases in these categories. Books ($${categoryAOVData.Books.aov.toFixed(2)}) and Toys & Games ($${categoryAOVData['Toys & Games'].aov.toFixed(2)}) have lower AOVs, suggesting more frequent but smaller transactions. Home & Garden sits in the middle at $${categoryAOVData['Home & Garden'].aov.toFixed(2)}, while Clothing averages $${categoryAOVData.Clothing.aov.toFixed(2)} per order.`,
  metadata: {
    type: 'aov_insights',
    high_aov_categories: ['Electronics', 'Sports & Outdoors'],
    low_aov_categories: ['Books', 'Toys & Games'],
    mid_aov_categories: ['Home & Garden', 'Clothing']
  }
});

// Add detailed category breakdown chunk
aovChunks.push({
  id: 'chunk_aov_detailed',
  content: `Detailed Average Order Value by category for 2024: Electronics generated $193,083.72 from 99 orders (AOV: $1,950.34), Sports & Outdoors earned $90,021.36 from 101 orders (AOV: $891.30), Home & Garden produced $60,984.62 from 120 orders (AOV: $508.21), Clothing brought in $26,840.24 from 126 orders (AOV: $213.02), Toys & Games made $17,312.42 from 110 orders (AOV: $157.39), and Books generated $5,502.26 from 103 orders (AOV: $53.42). Total revenue across all categories: $${overallStats.totalRevenue.toFixed(2)} from ${overallStats.totalOrders} orders.`,
  metadata: {
    type: 'aov_detailed',
    categories: categoryAOVData,
    total_revenue: overallStats.totalRevenue,
    total_orders: overallStats.totalOrders,
    overall_aov: parseFloat(overallStats.overallAOV)
  }
});

// Append new chunks to existing chunks
const updatedChunks = [...chunks, ...aovChunks];

// Save the updated chunks
fs.writeFileSync(chunksPath, JSON.stringify(updatedChunks, null, 2));

console.log('✅ Successfully added Average Order Value (AOV) data!');
console.log(`📊 Added ${aovChunks.length} new AOV metric chunks`);
console.log('\n💰 Average Order Value by Category:');
Object.entries(categoryAOVData)
  .sort((a, b) => b[1].aov - a[1].aov)
  .forEach(([category, data]) => {
    console.log(`   ${category}: $${data.aov.toFixed(2)} (${data.orderCount} orders)`);
  });
console.log(`\n📈 Overall AOV: $${overallStats.overallAOV}`);
console.log('\n⚡ Next steps:');
console.log('1. Regenerate embeddings for the new chunks: node scripts/precompute-embeddings.js');
console.log('2. Test with: "What is the average order value by category?"');