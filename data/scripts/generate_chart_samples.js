// Generate sample chart data for testing

const fs = require('fs');
const path = require('path');

// Load the data chunks
const chunks = require('../samples/data_chunks.json');

// Extract monthly revenue data
const monthlyRevenue = [];
chunks.filter(c => c.metadata?.type === 'monthly_summary').forEach(chunk => {
  const monthMatch = chunk.content.match(/Monthly summary for (\d{4}-\d{2}): Total revenue was \$([0-9.]+)/);
  if (monthMatch) {
    monthlyRevenue.push({
      month: monthMatch[1],
      revenue: parseFloat(monthMatch[2])
    });
  }
});

// Extract category data
const categoryData = [];
chunks.filter(c => c.metadata?.type === 'category_summary').forEach(chunk => {
  categoryData.push({
    name: chunk.metadata.category,
    revenue: chunk.metadata.revenue,
    orders: chunk.metadata.orders
  });
});

// Extract regional data
const regionData = [];
chunks.filter(c => c.metadata?.type === 'region_summary').forEach(chunk => {
  regionData.push({
    name: chunk.metadata.region,
    revenue: chunk.metadata.revenue,
    orders: chunk.metadata.orders
  });
});

// Create sample chart configs
const chartSamples = {
  monthlyTrend: {
    type: 'line',
    title: 'Monthly Revenue Trend',
    data: monthlyRevenue.sort((a, b) => a.month.localeCompare(b.month)),
    xAxis: { dataKey: 'month', label: 'Month' },
    yAxis: { dataKey: 'revenue', label: 'Revenue ($)' }
  },
  categoryBreakdown: {
    type: 'bar',
    title: 'Revenue by Category',
    data: categoryData.sort((a, b) => b.revenue - a.revenue),
    xAxis: { dataKey: 'name', label: 'Category' },
    yAxis: { dataKey: 'revenue', label: 'Revenue ($)' }
  },
  regionPie: {
    type: 'pie',
    title: 'Orders by Region',
    data: regionData,
    xAxis: { dataKey: 'name' },
    yAxis: { dataKey: 'orders' }
  }
};

// Save the chart samples
const outputPath = path.join(__dirname, '../samples/chart_samples.json');
fs.writeFileSync(outputPath, JSON.stringify(chartSamples, null, 2));

console.log('Generated chart samples:');
console.log('- Monthly Trend:', monthlyRevenue.length, 'data points');
console.log('- Category Breakdown:', categoryData.length, 'categories');
console.log('- Regional Distribution:', regionData.length, 'regions');
console.log('\nSaved to:', outputPath);