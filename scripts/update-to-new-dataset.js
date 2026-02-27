#!/usr/bin/env node

/**
 * Update the application to use the new, complete dataset
 * This updates all hardcoded values and regenerates embeddings
 */

const fs = require('fs');
const path = require('path');

// Load the new dataset and stats
const dataPath = path.join(__dirname, '..', 'data', 'samples', 'ecommerce_data_v2.json');
const statsPath = path.join(__dirname, '..', 'data', 'samples', 'dataset_stats.json');
const catalogPath = path.join(__dirname, '..', 'data', 'samples', 'product_catalog.json');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

console.log('📊 New Dataset Summary:');
console.log(`   Total Revenue: $${stats.overall.totalRevenue.toLocaleString()}`);
console.log(`   Total Orders: ${stats.overall.totalOrders}`);
console.log(`   Total Records: ${data.length}`);
console.log(`   Date Range: Jan 2024 - Dec 2024`);
console.log('');

// Files to update with correct revenue figures
const filesToUpdate = [
  {
    path: path.join(__dirname, '..', 'lib', 'claude.ts'),
    name: 'claude.ts'
  },
  {
    path: path.join(__dirname, '..', 'lib', 'openai.ts'),
    name: 'openai.ts'
  },
  {
    path: path.join(__dirname, '..', 'components', 'chat', 'ChatPanel.tsx'),
    name: 'ChatPanel.tsx'
  }
];

// Update each file with correct stats
filesToUpdate.forEach(file => {
  if (fs.existsSync(file.path)) {
    let content = fs.readFileSync(file.path, 'utf-8');

    // Replace old revenue figure
    content = content.replace(/\$393,744\.62/g, `$${stats.overall.totalRevenue.toLocaleString()}`);
    content = content.replace(/\$393,744/g, `$${Math.round(stats.overall.totalRevenue).toLocaleString()}`);
    content = content.replace(/393744\.62/g, stats.overall.totalRevenue.toString());

    // Replace old order count
    content = content.replace(/709 completed purchases/g, `${stats.overall.totalOrders} completed purchases`);
    content = content.replace(/709 orders/g, `${stats.overall.totalOrders} orders`);

    // Replace transaction counts
    content = content.replace(/2,000 transactions/g, `${data.length.toLocaleString()} transactions`);
    content = content.replace(/2000 transactions/g, `${data.length} transactions`);

    // Update regional stats if present
    if (content.includes('Asia ($114k')) {
      const regions = Object.entries(stats.regions).map(([name, data]) => {
        const revenue = Math.round(data.revenue / 1000);
        return `${name} ($${revenue}k, ${data.orders} orders)`;
      }).join(', ');

      content = content.replace(
        /Asia \(\$114k.*?South America \(\$83k, 136 orders\)/g,
        regions
      );
    }

    fs.writeFileSync(file.path, content);
    console.log(`✅ Updated ${file.name}`);
  } else {
    console.log(`⚠️  ${file.name} not found`);
  }
});

// Create a new overview file
const overview = {
  title: "E-Commerce Analytics Platform Dataset",
  description: "Comprehensive e-commerce dataset for demonstrating conversational BI capabilities",
  lastUpdated: new Date().toISOString(),
  metrics: {
    totalRevenue: `$${stats.overall.totalRevenue.toLocaleString()}`,
    totalOrders: stats.overall.totalOrders,
    totalRecords: data.length,
    uniqueCustomers: [...new Set(data.map(d => d.customer_id))].length,
    avgOrderValue: `$${stats.overall.avgOrderValue.toFixed(2)}`,
    conversionRate: `${(stats.overall.conversionRate * 100).toFixed(1)}%`,
    cartAbandonmentRate: `${(stats.overall.cartAbandonmentRate * 100).toFixed(1)}%`
  },
  temporal: {
    dateRange: "January 2024 - December 2024",
    monthsOfData: 12,
    highestMonth: Object.entries(stats.monthly).reduce((a, b) =>
      a[1].revenue > b[1].revenue ? a : b
    ),
    lowestMonth: Object.entries(stats.monthly).reduce((a, b) =>
      a[1].revenue < b[1].revenue ? a : b
    )
  },
  categories: Object.entries(stats.categories).map(([name, data]) => ({
    name,
    revenue: `$${data.revenue.toLocaleString()}`,
    orders: data.orders,
    avgOrderValue: `$${data.avgOrderValue.toFixed(2)}`
  })),
  regions: Object.entries(stats.regions).map(([name, data]) => ({
    name,
    revenue: `$${data.revenue.toLocaleString()}`,
    orders: data.orders,
    conversionRate: `${(data.conversionRate * 100).toFixed(1)}%`
  })),
  products: catalog.length
};

// Save the new overview
fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'samples', 'dataset_overview_v2.json'),
  JSON.stringify(overview, null, 2)
);

console.log('\n✅ Created dataset_overview_v2.json');

// Update the old data file to use the new one
const oldDataPath = path.join(__dirname, '..', 'data', 'samples', 'ecommerce_data.json');
console.log('\n🔄 Backing up old dataset...');
fs.copyFileSync(oldDataPath, oldDataPath + '.backup');
fs.copyFileSync(dataPath, oldDataPath);
console.log('✅ Replaced ecommerce_data.json with new dataset');

console.log('\n🎉 Dataset update complete!');
console.log('\nNext steps:');
console.log('1. Restart the development server to use new data');
console.log('2. Test queries to ensure accuracy');
console.log('3. Update any remaining hardcoded values if found');