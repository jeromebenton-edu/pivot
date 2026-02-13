const fs = require('fs');
const path = require('path');

// Sample product categories and products
const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports & Outdoors', 'Books', 'Toys & Games'];
const products = {
  'Electronics': ['Laptop', 'Smartphone', 'Tablet', 'Headphones', 'Smart Watch', 'Camera'],
  'Clothing': ['T-Shirt', 'Jeans', 'Dress', 'Jacket', 'Shoes', 'Hat'],
  'Home & Garden': ['Coffee Maker', 'Blender', 'Vacuum', 'Plant Pot', 'Lamp', 'Rug'],
  'Sports & Outdoors': ['Yoga Mat', 'Dumbbells', 'Tennis Racket', 'Bicycle', 'Running Shoes', 'Water Bottle'],
  'Books': ['Fiction Novel', 'Cookbook', 'Business Book', 'Self-Help', 'Biography', 'Science Book'],
  'Toys & Games': ['Board Game', 'Puzzle', 'Action Figure', 'LEGO Set', 'Doll', 'Video Game']
};

const regions = ['North America', 'Europe', 'Asia', 'South America'];
const eventTypes = ['view', 'cart', 'purchase'];

// Generate random data
function generateRandomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateRandomPrice(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

function generateSampleData(numRecords = 1000) {
  const data = [];
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-31');

  for (let i = 0; i < numRecords; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const product = products[category][Math.floor(Math.random() * products[category].length)];
    const region = regions[Math.floor(Math.random() * regions.length)];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const date = generateRandomDate(startDate, endDate);

    // Price ranges based on category
    const priceRanges = {
      'Electronics': [50, 2000],
      'Clothing': [15, 200],
      'Home & Garden': [10, 500],
      'Sports & Outdoors': [20, 1000],
      'Books': [5, 50],
      'Toys & Games': [10, 150]
    };

    const [minPrice, maxPrice] = priceRanges[category];
    const price = generateRandomPrice(minPrice, maxPrice);

    data.push({
      order_id: `ORD-${String(i + 1).padStart(6, '0')}`,
      user_id: `USER-${String(Math.floor(Math.random() * 500) + 1).padStart(4, '0')}`,
      event_type: eventType,
      product_id: `PROD-${category.substring(0, 3).toUpperCase()}-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
      product_name: product,
      category: category,
      price: parseFloat(price),
      quantity: eventType === 'purchase' ? Math.floor(Math.random() * 3) + 1 : 1,
      region: region,
      date: date.toISOString().split('T')[0],
      timestamp: date.toISOString(),
      session_id: `SESSION-${String(Math.floor(Math.random() * 1000) + 1).padStart(4, '0')}`,
      conversion_rate: eventType === 'purchase' ? 1 : 0
    });
  }

  return data;
}

// Generate and save sample data
const sampleData = generateSampleData(2000);

// Save as JSON
const jsonPath = path.join(__dirname, '../samples/ecommerce_data.json');
fs.writeFileSync(jsonPath, JSON.stringify(sampleData, null, 2));

// Save as CSV
const csvPath = path.join(__dirname, '../samples/ecommerce_data.csv');
const csvHeader = Object.keys(sampleData[0]).join(',');
const csvRows = sampleData.map(row => Object.values(row).join(','));
const csvContent = [csvHeader, ...csvRows].join('\n');
fs.writeFileSync(csvPath, csvContent);

console.log(`Generated ${sampleData.length} sample records`);
console.log(`Saved to: ${jsonPath}`);
console.log(`Saved to: ${csvPath}`);

// Generate some statistics for verification
const stats = {
  totalOrders: sampleData.filter(d => d.event_type === 'purchase').length,
  totalRevenue: sampleData
    .filter(d => d.event_type === 'purchase')
    .reduce((sum, d) => sum + (d.price * d.quantity), 0)
    .toFixed(2),
  categoryCounts: {},
  regionCounts: {}
};

categories.forEach(cat => {
  stats.categoryCounts[cat] = sampleData.filter(d => d.category === cat && d.event_type === 'purchase').length;
});

regions.forEach(region => {
  stats.regionCounts[region] = sampleData.filter(d => d.region === region && d.event_type === 'purchase').length;
});

console.log('\nDataset Statistics:');
console.log('-------------------');
console.log(`Total Purchase Events: ${stats.totalOrders}`);
console.log(`Total Revenue: $${stats.totalRevenue}`);
console.log('\nPurchases by Category:');
Object.entries(stats.categoryCounts).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count}`);
});
console.log('\nPurchases by Region:');
Object.entries(stats.regionCounts).forEach(([region, count]) => {
  console.log(`  ${region}: ${count}`);
});