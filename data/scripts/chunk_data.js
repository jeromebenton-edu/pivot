const fs = require('fs');
const path = require('path');

/**
 * Convert tabular data into semantic chunks for embedding
 * Each chunk represents a meaningful piece of information with context
 */

function loadData() {
  const dataPath = path.join(__dirname, '../samples/ecommerce_data.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(rawData);
}

function createContextString(record) {
  // Create a human-readable context string for each record
  let context = '';

  if (record.event_type === 'purchase') {
    context = `Purchase event: Customer ${record.user_id} bought ${record.quantity} ${record.product_name} ` +
              `(${record.category}) for $${record.price} each on ${record.date} in ${record.region}. ` +
              `Order ID: ${record.order_id}. Total value: $${(record.price * record.quantity).toFixed(2)}.`;
  } else if (record.event_type === 'cart') {
    context = `Cart event: Customer ${record.user_id} added ${record.product_name} ` +
              `(${record.category}) priced at $${record.price} to their cart on ${record.date} in ${record.region}.`;
  } else {
    context = `View event: Customer ${record.user_id} viewed ${record.product_name} ` +
              `(${record.category}) priced at $${record.price} on ${record.date} in ${record.region}.`;
  }

  return context;
}

function createChunks(data) {
  const chunks = [];

  // Create individual chunks for each record
  data.forEach((record, index) => {
    const chunk = {
      id: `chunk_${index + 1}`,
      content: createContextString(record),
      metadata: {
        order_id: record.order_id,
        user_id: record.user_id,
        event_type: record.event_type,
        product_id: record.product_id,
        product_name: record.product_name,
        category: record.category,
        price: record.price,
        quantity: record.quantity,
        region: record.region,
        date: record.date,
        timestamp: record.timestamp,
        revenue: record.event_type === 'purchase' ? record.price * record.quantity : 0
      },
      raw_data: record
    };
    chunks.push(chunk);
  });

  // Also create aggregated chunks for better semantic search
  // These help answer questions about trends and summaries

  // Monthly summaries
  const monthlyData = {};
  data.filter(r => r.event_type === 'purchase').forEach(record => {
    const monthKey = record.date.substring(0, 7); // YYYY-MM
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        revenue: 0,
        orders: 0,
        categories: {}
      };
    }
    monthlyData[monthKey].revenue += record.price * record.quantity;
    monthlyData[monthKey].orders += 1;
    monthlyData[monthKey].categories[record.category] =
      (monthlyData[monthKey].categories[record.category] || 0) + 1;
  });

  Object.entries(monthlyData).forEach(([month, stats]) => {
    const topCategory = Object.entries(stats.categories)
      .sort((a, b) => b[1] - a[1])[0];

    chunks.push({
      id: `chunk_monthly_${month}`,
      content: `Monthly summary for ${month}: Total revenue was $${stats.revenue.toFixed(2)} ` +
               `from ${stats.orders} orders. The top category was ${topCategory[0]} ` +
               `with ${topCategory[1]} purchases.`,
      metadata: {
        type: 'monthly_summary',
        month: month,
        revenue: stats.revenue,
        orders: stats.orders,
        top_category: topCategory[0]
      }
    });
  });

  // Category summaries
  const categoryData = {};
  data.filter(r => r.event_type === 'purchase').forEach(record => {
    if (!categoryData[record.category]) {
      categoryData[record.category] = {
        revenue: 0,
        orders: 0,
        products: new Set(),
        avgPrice: 0,
        prices: []
      };
    }
    categoryData[record.category].revenue += record.price * record.quantity;
    categoryData[record.category].orders += 1;
    categoryData[record.category].products.add(record.product_name);
    categoryData[record.category].prices.push(record.price);
  });

  Object.entries(categoryData).forEach(([category, stats]) => {
    const avgPrice = stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length;

    chunks.push({
      id: `chunk_category_${category.toLowerCase().replace(/\s+/g, '_')}`,
      content: `Category summary for ${category}: Generated $${stats.revenue.toFixed(2)} ` +
               `in revenue from ${stats.orders} orders. Average price: $${avgPrice.toFixed(2)}. ` +
               `${stats.products.size} different products sold.`,
      metadata: {
        type: 'category_summary',
        category: category,
        revenue: stats.revenue,
        orders: stats.orders,
        avg_price: avgPrice,
        product_count: stats.products.size
      }
    });
  });

  // Regional summaries
  const regionData = {};
  data.filter(r => r.event_type === 'purchase').forEach(record => {
    if (!regionData[record.region]) {
      regionData[record.region] = {
        revenue: 0,
        orders: 0,
        topCategories: {}
      };
    }
    regionData[record.region].revenue += record.price * record.quantity;
    regionData[record.region].orders += 1;
    regionData[record.region].topCategories[record.category] =
      (regionData[record.region].topCategories[record.category] || 0) + 1;
  });

  Object.entries(regionData).forEach(([region, stats]) => {
    const topCategory = Object.entries(stats.topCategories)
      .sort((a, b) => b[1] - a[1])[0];

    chunks.push({
      id: `chunk_region_${region.toLowerCase().replace(/\s+/g, '_')}`,
      content: `Regional summary for ${region}: Total revenue of $${stats.revenue.toFixed(2)} ` +
               `from ${stats.orders} orders. Most popular category: ${topCategory[0]} ` +
               `with ${topCategory[1]} purchases.`,
      metadata: {
        type: 'region_summary',
        region: region,
        revenue: stats.revenue,
        orders: stats.orders,
        top_category: topCategory[0]
      }
    });
  });

  return chunks;
}

// Process the data
const data = loadData();
const chunks = createChunks(data);

// Save chunks
const chunksPath = path.join(__dirname, '../samples/data_chunks.json');
fs.writeFileSync(chunksPath, JSON.stringify(chunks, null, 2));

console.log(`Created ${chunks.length} chunks from ${data.length} records`);
console.log(`Saved to: ${chunksPath}`);

// Show statistics
const chunkTypes = {
  transaction: chunks.filter(c => !c.metadata.type).length,
  monthly: chunks.filter(c => c.metadata.type === 'monthly_summary').length,
  category: chunks.filter(c => c.metadata.type === 'category_summary').length,
  region: chunks.filter(c => c.metadata.type === 'region_summary').length
};

console.log('\nChunk Statistics:');
console.log('-----------------');
console.log(`Transaction chunks: ${chunkTypes.transaction}`);
console.log(`Monthly summary chunks: ${chunkTypes.monthly}`);
console.log(`Category summary chunks: ${chunkTypes.category}`);
console.log(`Regional summary chunks: ${chunkTypes.region}`);

module.exports = { createChunks, createContextString };