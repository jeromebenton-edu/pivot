#!/usr/bin/env node

/**
 * Add quarterly summary data for Q1-Q4 2024
 */

const fs = require('fs');
const path = require('path');

// Load existing chunks
const chunksPath = path.join(__dirname, '../data/samples/data_chunks.json');
const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

// Quarterly data based on monthly summaries
const quarterlyData = {
  'Q1': {
    months: ['January', 'February', 'March'],
    monthlyRevenue: {
      'January': 70217.21,
      'February': 90034.35,
      'March': 90571.37
    },
    monthlyOrders: {
      'January': 69,
      'February': 67,
      'March': 79
    },
    totalRevenue: 250822.93,
    totalOrders: 215,
    topCategories: ['Home & Garden', 'Toys & Games', 'Health & Wellness']
  },
  'Q2': {
    months: ['April', 'May', 'June'],
    monthlyRevenue: {
      'April': 98409.04,
      'May': 91291.40,
      'June': 88282.15
    },
    monthlyOrders: {
      'April': 103,
      'May': 110,
      'June': 84
    },
    totalRevenue: 277982.59,
    totalOrders: 297,
    topCategories: ['Electronics', 'Sports & Outdoors', 'Electronics']
  },
  'Q3': {
    months: ['July', 'August', 'September'],
    monthlyRevenue: {
      'July': 83151.89,
      'August': 87462.76,
      'September': 100922.97
    },
    monthlyOrders: {
      'July': 74,
      'August': 76,
      'September': 100
    },
    totalRevenue: 271537.62,
    totalOrders: 250,
    topCategories: ['Home & Garden', 'Electronics', 'Fashion']
  },
  'Q4': {
    months: ['October', 'November', 'December'],
    monthlyRevenue: {
      'October': 75364.14,
      'November': 83677.34,
      'December': 94547.39
    },
    monthlyOrders: {
      'October': 92,
      'November': 88,
      'December': 91
    },
    totalRevenue: 253588.87,
    totalOrders: 271,
    topCategories: ['Electronics', 'Toys & Games', 'Electronics']
  }
};

// Create quarterly summary chunks
const quarterlyChunks = [];

// Add individual quarter chunks
Object.entries(quarterlyData).forEach(([quarter, data]) => {
  const chunkId = `chunk_quarterly_${quarter}_2024`;

  // Format monthly breakdown
  const monthlyBreakdown = data.months.map(month =>
    `${month}: $${data.monthlyRevenue[month].toLocaleString()} (${data.monthlyOrders[month]} orders)`
  ).join(', ');

  quarterlyChunks.push({
    id: chunkId,
    content: `${quarter} 2024 quarterly summary: Total revenue of $${data.totalRevenue.toLocaleString()} from ${data.totalOrders} orders. Monthly breakdown: ${monthlyBreakdown}. Average monthly revenue: $${(data.totalRevenue / 3).toFixed(2)}. Top performing categories in ${quarter}: ${data.topCategories.join(', ')}.`,
    metadata: {
      type: 'quarterly_summary',
      quarter: quarter,
      year: 2024,
      total_revenue: data.totalRevenue,
      total_orders: data.totalOrders,
      months: data.months,
      monthly_revenue: data.monthlyRevenue,
      monthly_orders: data.monthlyOrders,
      top_categories: data.topCategories
    }
  });
});

// Add year-over-year quarterly comparison chunk
quarterlyChunks.push({
  id: 'chunk_quarterly_comparison_2024',
  content: `2024 Quarterly Revenue Comparison: Q1 generated $250,822.93 (215 orders), Q2 achieved $277,982.59 (297 orders) - the highest quarter, Q3 earned $271,537.62 (250 orders), and Q4 brought in $253,588.87 (271 orders). Q2 was the strongest quarter with 10.8% more revenue than Q1. Q3 was 2.3% lower than Q2 but 8.2% higher than Q1. Q4 finished 6.6% lower than Q3 but still 1.1% higher than Q1. Total annual revenue: $1,053,931.91 from 1,033 orders.`,
  metadata: {
    type: 'quarterly_comparison',
    year: 2024,
    q1_revenue: 250822.93,
    q2_revenue: 277982.59,
    q3_revenue: 271537.62,
    q4_revenue: 253588.87,
    total_annual_revenue: 1053931.91,
    total_annual_orders: 1033,
    best_quarter: 'Q2',
    worst_quarter: 'Q1'
  }
});

// Add Q1 vs Q4 specific comparison chunk
quarterlyChunks.push({
  id: 'chunk_q1_vs_q4_2024',
  content: `Q1 vs Q4 2024 Comparison: Q1 2024 generated $250,822.93 in revenue from 215 orders (January: $70,217.21, February: $90,034.35, March: $90,571.37). Q4 2024 generated $253,588.87 from 271 orders (October: $75,364.14, November: $83,677.34, December: $94,547.39). Q4 outperformed Q1 by $2,765.94 (1.1% increase) with 56 more orders (26% increase in order volume). Q4 had a lower average order value ($935.38) compared to Q1 ($1,166.62), suggesting higher volume but lower ticket sales in Q4.`,
  metadata: {
    type: 'quarter_comparison',
    quarters: ['Q1', 'Q4'],
    year: 2024,
    q1_revenue: 250822.93,
    q4_revenue: 253588.87,
    revenue_difference: 2765.94,
    percentage_difference: 1.1,
    q1_orders: 215,
    q4_orders: 271,
    order_difference: 56,
    q1_aov: 1166.62,
    q4_aov: 935.38
  }
});

// Append new chunks to existing chunks
const updatedChunks = [...chunks, ...quarterlyChunks];

// Save the updated chunks
fs.writeFileSync(chunksPath, JSON.stringify(updatedChunks, null, 2));

console.log('✅ Successfully added quarterly summary data!');
console.log(`📊 Added ${quarterlyChunks.length} new quarterly chunks`);
console.log('\n📈 Quarterly Revenue Summary:');
Object.entries(quarterlyData).forEach(([quarter, data]) => {
  console.log(`   ${quarter} 2024: $${data.totalRevenue.toLocaleString()} (${data.totalOrders} orders)`);
});
console.log('\n⚡ Next steps:');
console.log('1. Regenerate embeddings: node scripts/precompute-embeddings.js');
console.log('2. Test with: "Compare Q1 vs Q4 2024 revenue"');