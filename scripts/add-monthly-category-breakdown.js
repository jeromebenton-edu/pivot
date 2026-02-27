#!/usr/bin/env node

/**
 * Add monthly revenue breakdown by category for all months in 2024
 */

const fs = require('fs');
const path = require('path');

// Load existing chunks
const chunksPath = path.join(__dirname, '../data/samples/data_chunks.json');
const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));

// Monthly category revenue distribution (realistic e-commerce patterns)
// Based on seasonal trends and category performance
const monthlyBreakdown = {
  'January': {
    total: 70217.21,
    categories: {
      'Electronics': 14043.44,  // 20% - Post-holiday returns affect sales
      'Home & Garden': 16851.73,  // 24% - New year home improvement
      'Sports & Outdoors': 11234.75,  // 16%
      'Clothing': 10532.58,  // 15%
      'Toys & Games': 9128.24,  // 13%
      'Books': 8426.47  // 12%
    }
  },
  'February': {
    total: 90034.35,
    categories: {
      'Electronics': 23408.93,  // 26% - Tax refund season begins
      'Home & Garden': 14405.50,  // 16%
      'Sports & Outdoors': 12604.81,  // 14%
      'Clothing': 16206.18,  // 18% - Valentine's Day
      'Toys & Games': 11704.47,  // 13%
      'Books': 11704.46  // 13%
    }
  },
  'March': {
    total: 90571.37,
    categories: {
      'Electronics': 18114.27,  // 20%
      'Home & Garden': 19925.70,  // 22% - Spring gardening
      'Sports & Outdoors': 16302.85,  // 18% - Spring sports
      'Clothing': 14491.42,  // 16%
      'Toys & Games': 11774.28,  // 13%
      'Books': 9963.85  // 11%
    }
  },
  'April': {
    total: 98409.04,
    categories: {
      'Electronics': 25586.35,  // 26% - Spring sales
      'Home & Garden': 17713.63,  // 18%
      'Sports & Outdoors': 16729.54,  // 17%
      'Clothing': 13777.27,  // 14%
      'Toys & Games': 14761.36,  // 15%
      'Books': 9840.89  // 10%
    }
  },
  'May': {
    total: 91291.40,
    categories: {
      'Electronics': 21910.00,  // 24% - Mother's Day electronics
      'Home & Garden': 18258.28,  // 20%
      'Sports & Outdoors': 14606.62,  // 16%
      'Clothing': 13693.71,  // 15%
      'Toys & Games': 12780.80,  // 14%
      'Books': 10041.99  // 11%
    }
  },
  'June': {
    total: 88282.15,
    categories: {
      'Electronics': 22953.36,  // 26% - Father's Day electronics
      'Home & Garden': 15891.00,  // 18%
      'Sports & Outdoors': 15006.77,  // 17% - Summer sports
      'Clothing': 12359.50,  // 14%
      'Toys & Games': 13242.32,  // 15%
      'Books': 8829.20  // 10%
    }
  },
  'July': {
    total: 83151.89,
    categories: {
      'Electronics': 16630.38,  // 20% - Summer slowdown
      'Home & Garden': 19956.45,  // 24% - Summer gardening peak
      'Sports & Outdoors': 14967.34,  // 18%
      'Clothing': 11641.26,  // 14%
      'Toys & Games': 11641.27,  // 14%
      'Books': 8315.19  // 10%
    }
  },
  'August': {
    total: 87462.76,
    categories: {
      'Electronics': 22740.32,  // 26% - Back to school
      'Home & Garden': 13994.04,  // 16%
      'Sports & Outdoors': 13119.41,  // 15%
      'Clothing': 15743.30,  // 18% - Back to school clothing
      'Toys & Games': 11370.16,  // 13%
      'Books': 10495.53  // 12% - Textbooks
    }
  },
  'September': {
    total: 100922.97,
    categories: {
      'Electronics': 20184.59,  // 20%
      'Home & Garden': 16147.68,  // 16%
      'Sports & Outdoors': 15138.45,  // 15%
      'Clothing': 20184.60,  // 20% - Fall fashion
      'Toys & Games': 14129.22,  // 14%
      'Books': 15138.43  // 15%
    }
  },
  'October': {
    total: 75364.14,
    categories: {
      'Electronics': 19594.68,  // 26% - Pre-holiday shopping begins
      'Home & Garden': 10551.00,  // 14%
      'Sports & Outdoors': 10551.00,  // 14%
      'Clothing': 13565.55,  // 18% - Halloween costumes
      'Toys & Games': 12058.26,  // 16%
      'Books': 9043.65  // 12%
    }
  },
  'November': {
    total: 83677.34,
    categories: {
      'Electronics': 21755.10,  // 26% - Black Friday
      'Home & Garden': 11714.83,  // 14%
      'Sports & Outdoors': 11714.83,  // 14%
      'Clothing': 13388.37,  // 16%
      'Toys & Games': 15061.92,  // 18% - Holiday toy shopping
      'Books': 10042.29  // 12%
    }
  },
  'December': {
    total: 94547.39,
    categories: {
      'Electronics': 24582.32,  // 26% - Holiday electronics peak
      'Home & Garden': 11345.69,  // 12%
      'Sports & Outdoors': 11345.69,  // 12%
      'Clothing': 14182.11,  // 15%
      'Toys & Games': 20800.42,  // 22% - Holiday toy peak
      'Books': 12291.16  // 13%
    }
  }
};

// Calculate category totals across all months
const categoryTotals = {};
const categories = ['Electronics', 'Home & Garden', 'Sports & Outdoors', 'Clothing', 'Toys & Games', 'Books'];
categories.forEach(cat => {
  categoryTotals[cat] = Object.values(monthlyBreakdown).reduce((sum, month) =>
    sum + month.categories[cat], 0
  );
});

// Create new chunks
const newChunks = [];

// Add monthly category breakdown chunks for each month
Object.entries(monthlyBreakdown).forEach(([month, data]) => {
  const chunkId = `chunk_category_month_${month.toLowerCase()}_2024`;

  // Format category breakdown
  const categoryList = Object.entries(data.categories)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, revenue]) => `${cat}: $${revenue.toFixed(2)} (${((revenue/data.total)*100).toFixed(1)}%)`)
    .join(', ');

  newChunks.push({
    id: chunkId,
    content: `${month} 2024 category revenue breakdown: Total revenue $${data.total.toFixed(2)}. ${categoryList}. Top category: ${Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0][0]} with ${((Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0][1]/data.total)*100).toFixed(1)}% of monthly revenue.`,
    metadata: {
      type: 'monthly_category_breakdown',
      month: month,
      year: 2024,
      total_revenue: data.total,
      categories: data.categories,
      top_category: Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0][0]
    }
  });
});

// Add category-specific monthly performance chunks
categories.forEach(category => {
  const chunkId = `chunk_${category.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_')}_monthly_2024`;

  // Get monthly performance for this category
  const monthlyPerf = Object.entries(monthlyBreakdown).map(([month, data]) => ({
    month,
    revenue: data.categories[category]
  }));

  // Find best and worst months
  const sortedMonths = [...monthlyPerf].sort((a, b) => b.revenue - a.revenue);
  const bestMonth = sortedMonths[0];
  const worstMonth = sortedMonths[sortedMonths.length - 1];

  // Format monthly list
  const monthlyList = monthlyPerf.map(m =>
    `${m.month}: $${m.revenue.toFixed(2)}`
  ).join(', ');

  newChunks.push({
    id: chunkId,
    content: `${category} monthly revenue for 2024: ${monthlyList}. Total annual revenue: $${categoryTotals[category].toFixed(2)}. Best month: ${bestMonth.month} ($${bestMonth.revenue.toFixed(2)}). Worst month: ${worstMonth.month} ($${worstMonth.revenue.toFixed(2)}). Average monthly revenue: $${(categoryTotals[category]/12).toFixed(2)}.`,
    metadata: {
      type: 'category_monthly_performance',
      category: category,
      year: 2024,
      total_revenue: categoryTotals[category],
      best_month: bestMonth.month,
      best_month_revenue: bestMonth.revenue,
      worst_month: worstMonth.month,
      worst_month_revenue: worstMonth.revenue,
      average_monthly: categoryTotals[category]/12,
      monthly_data: monthlyPerf
    }
  });
});

// Add quarterly category performance chunks
const quarters = {
  'Q1': ['January', 'February', 'March'],
  'Q2': ['April', 'May', 'June'],
  'Q3': ['July', 'August', 'September'],
  'Q4': ['October', 'November', 'December']
};

Object.entries(quarters).forEach(([quarter, months]) => {
  const chunkId = `chunk_category_quarterly_${quarter.toLowerCase()}_2024`;

  // Calculate quarterly totals for each category
  const quarterlyTotals = {};
  categories.forEach(cat => {
    quarterlyTotals[cat] = months.reduce((sum, month) =>
      sum + monthlyBreakdown[month].categories[cat], 0
    );
  });

  // Sort by revenue
  const sortedCategories = Object.entries(quarterlyTotals)
    .sort((a, b) => b[1] - a[1]);

  const categoryList = sortedCategories
    .map(([cat, revenue]) => `${cat}: $${revenue.toFixed(2)}`)
    .join(', ');

  const totalQuarterRevenue = Object.values(quarterlyTotals).reduce((a, b) => a + b, 0);

  newChunks.push({
    id: chunkId,
    content: `${quarter} 2024 category revenue breakdown: ${categoryList}. Top performing category: ${sortedCategories[0][0]} with $${sortedCategories[0][1].toFixed(2)} (${((sortedCategories[0][1]/totalQuarterRevenue)*100).toFixed(1)}% of quarter). Total ${quarter} revenue across all categories: $${totalQuarterRevenue.toFixed(2)}.`,
    metadata: {
      type: 'quarterly_category_breakdown',
      quarter: quarter,
      year: 2024,
      categories: quarterlyTotals,
      total_revenue: totalQuarterRevenue,
      top_category: sortedCategories[0][0],
      top_category_revenue: sortedCategories[0][1]
    }
  });
});

// Append new chunks to existing chunks
const updatedChunks = [...chunks, ...newChunks];

// Save the updated chunks
fs.writeFileSync(chunksPath, JSON.stringify(updatedChunks, null, 2));

console.log('✅ Successfully added monthly category revenue breakdowns!');
console.log(`📊 Added ${newChunks.length} new chunks:`);
console.log(`   - 12 monthly category breakdown chunks`);
console.log(`   - 6 category-specific monthly performance chunks`);
console.log(`   - 4 quarterly category performance chunks`);
console.log('\n💰 Category Annual Totals:');
Object.entries(categoryTotals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, total]) => {
    console.log(`   ${cat}: $${total.toFixed(2)}`);
  });
console.log('\n⚡ Next steps:');
console.log('1. Regenerate embeddings: node scripts/precompute-embeddings.js');
console.log('2. Test with: "What was the monthly revenue for Electronics?"');