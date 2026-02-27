#!/usr/bin/env node

/**
 * Generate a rich, complete e-commerce dataset for showcasing conversational BI
 * This creates realistic data with proper seasonality, trends, and no missing months
 */

const fs = require('fs');
const path = require('path');

// Configuration for realistic e-commerce data
const CONFIG = {
  year: 2024,
  targetRevenue: 5000000, // $5M annual revenue (realistic for mid-size e-commerce)
  recordsPerMonth: 500, // ~6000 records total - more data for better analysis
  conversionRate: 0.35, // 35% of carts convert to purchases
  viewToCartRate: 0.45, // 45% of views lead to cart adds
};

// Product catalog with realistic pricing
const PRODUCTS = [
  // Electronics (High value, lower volume)
  { id: 'P001', name: 'MacBook Pro 14"', category: 'Electronics', price: 1999, weight: 0.8 },
  { id: 'P002', name: 'iPhone 15 Pro', category: 'Electronics', price: 1199, weight: 0.9 },
  { id: 'P003', name: 'iPad Air', category: 'Electronics', price: 799, weight: 0.7 },
  { id: 'P004', name: 'AirPods Pro', category: 'Electronics', price: 249, weight: 0.5 },
  { id: 'P005', name: 'Sony WH-1000XM5', category: 'Electronics', price: 399, weight: 0.6 },
  { id: 'P006', name: 'Samsung 65" OLED TV', category: 'Electronics', price: 2499, weight: 0.4 },
  { id: 'P007', name: 'PlayStation 5', category: 'Electronics', price: 499, weight: 0.7 },
  { id: 'P008', name: 'Meta Quest 3', category: 'Electronics', price: 649, weight: 0.5 },

  // Fashion (Medium value, high volume)
  { id: 'P009', name: 'Nike Air Max', category: 'Fashion', price: 179, weight: 1.2 },
  { id: 'P010', name: 'Levi\'s 501 Jeans', category: 'Fashion', price: 98, weight: 1.1 },
  { id: 'P011', name: 'North Face Jacket', category: 'Fashion', price: 299, weight: 0.9 },
  { id: 'P012', name: 'Ray-Ban Wayfarers', category: 'Fashion', price: 168, weight: 0.8 },
  { id: 'P013', name: 'Adidas Ultraboost', category: 'Fashion', price: 189, weight: 1.0 },
  { id: 'P014', name: 'Patagonia Backpack', category: 'Fashion', price: 149, weight: 0.7 },

  // Home & Garden (Medium value, steady demand)
  { id: 'P015', name: 'Dyson V15 Vacuum', category: 'Home & Garden', price: 749, weight: 0.6 },
  { id: 'P016', name: 'Nespresso Machine', category: 'Home & Garden', price: 299, weight: 0.8 },
  { id: 'P017', name: 'Instant Pot Duo', category: 'Home & Garden', price: 129, weight: 0.9 },
  { id: 'P018', name: 'Philips Hue Starter Kit', category: 'Home & Garden', price: 199, weight: 0.7 },
  { id: 'P019', name: 'Weber Grill', category: 'Home & Garden', price: 899, weight: 0.5 },
  { id: 'P020', name: 'KitchenAid Mixer', category: 'Home & Garden', price: 449, weight: 0.7 },

  // Health & Wellness (Growing category)
  { id: 'P021', name: 'Peloton Bike', category: 'Health & Wellness', price: 1895, weight: 0.3 },
  { id: 'P022', name: 'Apple Watch Series 9', category: 'Health & Wellness', price: 429, weight: 0.8 },
  { id: 'P023', name: 'Theragun Prime', category: 'Health & Wellness', price: 299, weight: 0.6 },
  { id: 'P024', name: 'Yoga Mat Premium', category: 'Health & Wellness', price: 89, weight: 0.9 },
  { id: 'P025', name: 'Vitamix Blender', category: 'Health & Wellness', price: 599, weight: 0.5 },

  // Books & Media (Low value, high volume)
  { id: 'P026', name: 'Kindle Paperwhite', category: 'Books & Media', price: 149, weight: 0.7 },
  { id: 'P027', name: 'Bestseller Bundle', category: 'Books & Media', price: 45, weight: 1.5 },
  { id: 'P028', name: 'MasterClass Annual', category: 'Books & Media', price: 180, weight: 0.6 },
  { id: 'P029', name: 'Spotify Premium Gift', category: 'Books & Media', price: 99, weight: 0.8 },
  { id: 'P030', name: 'Audible Subscription', category: 'Books & Media', price: 149, weight: 0.7 },
];

// Regions with realistic distribution
const REGIONS = [
  { name: 'North America', weight: 0.35, timezone: 'America/New_York' },
  { name: 'Europe', weight: 0.28, timezone: 'Europe/London' },
  { name: 'Asia Pacific', weight: 0.22, timezone: 'Asia/Tokyo' },
  { name: 'Latin America', weight: 0.10, timezone: 'America/Mexico_City' },
  { name: 'Middle East & Africa', weight: 0.05, timezone: 'Asia/Dubai' },
];

// Customer segments
const CUSTOMER_SEGMENTS = [
  { type: 'loyal', weight: 0.2, avgOrdersPerMonth: 3 },
  { type: 'regular', weight: 0.3, avgOrdersPerMonth: 1.5 },
  { type: 'occasional', weight: 0.5, avgOrdersPerMonth: 0.5 },
];

// Seasonal factors (1.0 = normal, >1.0 = higher sales)
const SEASONAL_FACTORS = {
  1: 0.9,   // January - Post-holiday slowdown
  2: 0.85,  // February - Slow month
  3: 1.0,   // March - Spring begins
  4: 1.1,   // April - Spring shopping
  5: 1.05,  // May - Mother's Day
  6: 1.0,   // June - Normal
  7: 0.95,  // July - Summer slowdown
  8: 1.05,  // August - Back-to-school
  9: 1.1,   // September - Fall shopping
  10: 1.15, // October - Pre-holiday
  11: 1.35, // November - Black Friday/Cyber Monday
  12: 1.25, // December - Holiday shopping
};

// Generate customer IDs
function generateCustomers(count = 1000) {
  const customers = [];
  for (let i = 1; i <= count; i++) {
    const segment = weightedRandom(CUSTOMER_SEGMENTS);
    customers.push({
      id: `CUST${i.toString().padStart(4, '0')}`,
      segment: segment.type,
      region: weightedRandom(REGIONS).name,
      joinDate: randomDate(new Date(2023, 0, 1), new Date(2024, 0, 1)),
    });
  }
  return customers;
}

// Weighted random selection
function weightedRandom(items) {
  const weights = items.map(item => item.weight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Random date generator
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate transaction data
function generateTransactions() {
  const customers = generateCustomers();
  const transactions = [];
  let transactionId = 1;

  // Generate data for each month
  for (let month = 1; month <= 12; month++) {
    const seasonalFactor = SEASONAL_FACTORS[month];
    const monthlyRecords = Math.floor(CONFIG.recordsPerMonth * seasonalFactor);

    // Days in month
    const daysInMonth = new Date(CONFIG.year, month, 0).getDate();

    for (let i = 0; i < monthlyRecords; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const day = Math.floor(Math.random() * daysInMonth) + 1;
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);

      const date = new Date(CONFIG.year, month - 1, day, hour, minute);
      const dateStr = date.toISOString().split('T')[0];
      const timestamp = date.toISOString();

      // Adjust price with small variations (±10%)
      const priceVariation = 0.9 + Math.random() * 0.2;
      const finalPrice = Math.round(product.price * priceVariation * 100) / 100;

      // Generate event sequence (view -> cart -> purchase)
      const eventRandom = Math.random();
      let eventType;

      if (eventRandom < CONFIG.viewToCartRate * CONFIG.conversionRate) {
        // Full funnel: view -> cart -> purchase
        eventType = 'purchase';
      } else if (eventRandom < CONFIG.viewToCartRate) {
        // Abandoned cart: view -> cart
        eventType = 'cart';
      } else {
        // Just browsing: view only
        eventType = 'view';
      }

      // Add the main event
      transactions.push({
        transaction_id: `TXN${transactionId.toString().padStart(6, '0')}`,
        date: dateStr,
        timestamp: timestamp,
        customer_id: customer.id,
        customer_segment: customer.segment,
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        price: finalPrice,
        quantity: eventType === 'purchase' ? Math.floor(Math.random() * 3) + 1 : 1,
        event_type: eventType,
        region: customer.region,
        channel: Math.random() > 0.7 ? 'mobile' : 'web',
        payment_method: eventType === 'purchase' ?
          (Math.random() > 0.6 ? 'credit_card' : Math.random() > 0.5 ? 'paypal' : 'apple_pay') : null,
        discount_applied: eventType === 'purchase' && Math.random() > 0.7,
        discount_amount: eventType === 'purchase' && Math.random() > 0.7 ?
          Math.round(finalPrice * 0.1 * 100) / 100 : 0,
      });

      transactionId++;
    }
  }

  return transactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// Generate summary statistics
function generateSummaryStats(transactions) {
  const purchases = transactions.filter(t => t.event_type === 'purchase');
  const carts = transactions.filter(t => t.event_type === 'cart');
  const views = transactions.filter(t => t.event_type === 'view');

  // Monthly summaries
  const monthlyStats = {};
  for (let month = 1; month <= 12; month++) {
    const monthStr = `2024-${month.toString().padStart(2, '0')}`;
    const monthPurchases = purchases.filter(t => t.date.startsWith(monthStr));
    const revenue = monthPurchases.reduce((sum, t) => sum + (t.price * t.quantity), 0);

    monthlyStats[monthStr] = {
      revenue: Math.round(revenue * 100) / 100,
      orders: monthPurchases.length,
      avgOrderValue: monthPurchases.length > 0 ?
        Math.round((revenue / monthPurchases.length) * 100) / 100 : 0,
      topCategory: getMostFrequent(monthPurchases.map(t => t.category)),
    };
  }

  // Category summaries
  const categoryStats = {};
  PRODUCTS.reduce((acc, p) => {
    if (!acc.includes(p.category)) acc.push(p.category);
    return acc;
  }, []).forEach(category => {
    const catPurchases = purchases.filter(t => t.category === category);
    const revenue = catPurchases.reduce((sum, t) => sum + (t.price * t.quantity), 0);
    categoryStats[category] = {
      revenue: Math.round(revenue * 100) / 100,
      orders: catPurchases.length,
      avgOrderValue: catPurchases.length > 0 ?
        Math.round((revenue / catPurchases.length) * 100) / 100 : 0,
    };
  });

  // Regional summaries
  const regionalStats = {};
  REGIONS.forEach(region => {
    const regPurchases = purchases.filter(t => t.region === region.name);
    const revenue = regPurchases.reduce((sum, t) => sum + (t.price * t.quantity), 0);
    regionalStats[region.name] = {
      revenue: Math.round(revenue * 100) / 100,
      orders: regPurchases.length,
      conversionRate: regPurchases.length / transactions.filter(t => t.region === region.name).length,
    };
  });

  // Overall stats
  const totalRevenue = purchases.reduce((sum, t) => sum + (t.price * t.quantity), 0);

  return {
    overall: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: purchases.length,
      totalCustomers: [...new Set(transactions.map(t => t.customer_id))].length,
      avgOrderValue: Math.round((totalRevenue / purchases.length) * 100) / 100,
      conversionRate: purchases.length / transactions.length,
      cartAbandonmentRate: (carts.length - purchases.length) / carts.length,
    },
    monthly: monthlyStats,
    categories: categoryStats,
    regions: regionalStats,
    funnel: {
      views: views.length,
      carts: carts.length,
      purchases: purchases.length,
    },
  };
}

// Helper to get most frequent item
function getMostFrequent(arr) {
  if (!arr.length) return null;
  const counts = {};
  arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

// Main execution
function main() {
  console.log('🚀 Generating comprehensive e-commerce dataset...\n');

  const transactions = generateTransactions();
  const stats = generateSummaryStats(transactions);

  console.log('📊 Dataset Statistics:');
  console.log(`   Total Revenue: $${stats.overall.totalRevenue.toLocaleString()}`);
  console.log(`   Total Orders: ${stats.overall.totalOrders.toLocaleString()}`);
  console.log(`   Total Records: ${transactions.length.toLocaleString()}`);
  console.log(`   Conversion Rate: ${(stats.overall.conversionRate * 100).toFixed(1)}%`);
  console.log(`   Cart Abandonment: ${(stats.overall.cartAbandonmentRate * 100).toFixed(1)}%`);
  console.log('\n📅 Monthly Revenue:');

  Object.entries(stats.monthly).forEach(([month, data]) => {
    console.log(`   ${month}: $${data.revenue.toLocaleString()} (${data.orders} orders)`);
  });

  // Save files
  const dataDir = path.join(__dirname, '..', 'data', 'samples');

  // Save transactions
  fs.writeFileSync(
    path.join(dataDir, 'ecommerce_data_v2.json'),
    JSON.stringify(transactions, null, 2)
  );

  // Save summary stats
  fs.writeFileSync(
    path.join(dataDir, 'dataset_stats.json'),
    JSON.stringify(stats, null, 2)
  );

  // Save product catalog
  fs.writeFileSync(
    path.join(dataDir, 'product_catalog.json'),
    JSON.stringify(PRODUCTS, null, 2)
  );

  console.log('\n✅ Dataset generated successfully!');
  console.log('   Files created:');
  console.log('   - ecommerce_data_v2.json');
  console.log('   - dataset_stats.json');
  console.log('   - product_catalog.json');
}

main();