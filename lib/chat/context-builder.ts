/**
 * Context builder for the chat route.
 *
 * Extracts the RAG context-building logic (semantic search, keyword detection,
 * supplementary searches, deduplication, SQL verification) into a standalone
 * module so the chat route stays slim and the logic is independently testable.
 */

import { createLogger } from '@/lib/logger';
import { semanticSearch } from '@/lib/mcp-tools';
import { getDatasetStore } from '@/lib/data/embedder';
import { generateEmbedding } from '@/lib/embeddings';
import { searchCache, cacheKey } from '@/lib/cache';
import { validateSources, crossCheckTotals } from '@/lib/validation';
import { isDBAvailable, getKnownTotals } from '@/lib/db/supply-chain';
import datasetOverview from '@/data/samples/dataset_overview.json';

const log = createLogger('context-builder');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextResult {
  context: string;
  sources: Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    score: number;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SOURCES = 25;
const MAX_SOURCE_CHARS = 32000; // Total char budget to prevent context overflow (#11 R6)

export const OVERVIEW_PHRASES = [
  'describe the dataset', 'describe this dataset', 'dataset overview', 'data overview',
  'give me an overview', 'give me a summary', 'summarize the dataset', 'summarize the data',
  'tell me about the dataset', 'tell me about this dataset', 'what does the dataset contain',
  'what data do you have', 'what is this dataset', 'what is the dataset',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isOverviewQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return OVERVIEW_PHRASES.some(phrase => lower.includes(phrase));
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildContext(
  query: string,
  datasetId: string | undefined,
  userId: string,
  ragInitialized: boolean,
): Promise<ContextResult> {
  let context = '';
  let sources: Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    score: number;
  }> = [];

  // ── Check search cache ──────────────────────────────────────────────
  // Key includes query + dataset + userId for tenant isolation (#5, #13)
  const searchCK = cacheKey('search', query, datasetId || 'builtin', userId);
  const cachedSearch = searchCache.get(searchCK);
  if (cachedSearch) {
    log.info('Search results cache hit');
    context = cachedSearch.context;
    sources = cachedSearch.results;
  }

  // ── Overview detection ──────────────────────────────────────────────
  const isAskingForOverview = isOverviewQuery(query);

  // ── Search uploaded dataset (non-builtin) ───────────────────────────
  if (!cachedSearch && datasetId && datasetId !== 'builtin') {
    const uploadedStore = getDatasetStore(datasetId);
    if (uploadedStore) {
      try {
        const queryEmbedding = await generateEmbedding(query);
        const results = await uploadedStore.query(queryEmbedding, 8);
        if (results.documents[0] && results.documents[0].length > 0) {
          context = '\n\nRelevant information from uploaded dataset:\n';
          results.documents[0].forEach((doc: string, idx: number) => {
            context += `\n[${idx + 1}] ${doc}`;
            sources.push({
              id: results.ids[0][idx],
              content: doc,
              metadata: (results.metadatas[0][idx] as Record<string, unknown>) || {},
              score: results.distances ? (1 - (results.distances[0]?.[idx] || 0)) : 0.5,
            });
          });
        }
      } catch (error) {
        log.error('Uploaded dataset search error', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // ── Semantic search on builtin dataset ──────────────────────────────
  if (!cachedSearch && (!datasetId || datasetId === 'builtin') && ragInitialized) {
    log.info('Performing semantic search', { query });

    let searchQuery = query;
    let searchLimit = 5;

    // ── Keyword detection ───────────────────────────────────────────
    const queryLower = query.toLowerCase();

    const categoryKeywords = [
      'product line', 'product lines', 'category', 'categories', 'top spending', 'highest spend',
      'average po value', 'po value', 'order value', 'material',
    ];
    const specificCategories = [
      'industrial bearings', 'electronic assemblies', 'hydraulic components',
      'structural fabrications', 'polymer', 'seal kits', 'precision tooling',
    ];
    const monthlyKeywords = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'month', 'monthly',
    ];
    const quarterlyKeywords = ['q1', 'q2', 'q3', 'q4', 'quarter', 'quarterly'];
    const regionQueryKeywords = ['region', 'across', 'geographic', 'location'];
    const specificRegions = ['north america', 'europe', 'asia pacific', 'latin america'];
    const supplierKeywords = ['supplier', 'vendor', 'on-time', 'otd', 'delivery rate', 'lead time'];

    const isAskingAboutCategories = categoryKeywords.some(kw => queryLower.includes(kw));
    const isAskingAboutSpecificCategory = specificCategories.some(cat => queryLower.includes(cat));
    const isAskingAboutMonth = monthlyKeywords.some(kw => queryLower.includes(kw));
    const isAskingAboutQuarters = quarterlyKeywords.some(kw => queryLower.includes(kw));
    const isAskingAboutRegions = regionQueryKeywords.some(kw => queryLower.includes(kw));
    const isAskingAboutSpecificRegion = specificRegions.some(region => queryLower.includes(region));
    const isAskingAboutSuppliers = supplierKeywords.some(kw => queryLower.includes(kw));

    // ── Augment search queries based on detected keywords ───────────
    if (isAskingAboutSpecificRegion && isAskingAboutMonth) {
      // Region + monthly query (e.g., "Show me the monthly trend for Europe")
      searchQuery = `${searchQuery} monthly revenue region procurement spend`;
      searchLimit = 25;
    } else if (isAskingAboutSpecificRegion && (isAskingAboutCategories || queryLower.includes('product'))) {
      // Region + product breakdown (e.g., "Break down Europe spend by product line")
      const matchedRegion = specificRegions.find(r => queryLower.includes(r));
      searchQuery = `${matchedRegion} Industrial Bearings Electronic Assemblies Hydraulic Components Structural Fabrications Polymer Seal Kits Precision Tooling procurement spend`;
      searchLimit = 25;
    } else if (isAskingAboutSpecificCategory && isAskingAboutRegions) {
      // Product + region cross-tab query (e.g., "Compare Industrial Bearings spend across regions")
      searchQuery = `${searchQuery} region spend procurement product`;
      searchLimit = 15;
    } else if (isAskingAboutQuarters) {
      // Looking for quarterly data - need at least 6-8 months for comparison
      searchQuery = `monthly summary ${searchQuery} revenue quarter`;
      searchLimit = 10;
    } else if (isAskingAboutSpecificCategory && isAskingAboutMonth) {
      // Looking for specific category monthly data -- need all 12 months for trend charts
      searchQuery = `${searchQuery} monthly revenue breakdown category performance`;
      searchLimit = 25;
    } else if (isAskingAboutCategories && isAskingAboutMonth) {
      // Looking for monthly category data - prioritize monthly summaries
      searchQuery = `monthly summary ${searchQuery} categories top category`;
      searchLimit = 8;
    } else if (isAskingAboutCategories) {
      // Looking for category data - surface category_summary chunks with spend totals
      searchQuery = `product line summary ${searchQuery} procurement spend orders`;
      searchLimit = 12;
    } else if (isAskingAboutMonth) {
      // Looking for monthly data
      searchQuery = `monthly summary ${searchQuery}`;
      searchLimit = 15; // Get all 12 months plus buffer
    }

    // Supplier query augmentation
    if (isAskingAboutSuppliers) {
      const supplierNameMatch = query.match(
        /(?:supplier|vendor)\s+(.+?)(?:\?|$|\.|\,)/i,
      );
      if (supplierNameMatch) {
        const supplierName = supplierNameMatch[1].trim();
        searchQuery = `supplier summary ${supplierName} procurement spend on-time delivery`;
      } else {
        searchQuery = `supplier summary ${searchQuery} on-time delivery quality`;
      }
      searchLimit = 15;
    }

    if (isAskingForOverview) {
      // For overview requests, search for summary data
      searchQuery = 'monthly summary product line summary region summary total procurement spend orders';
      searchLimit = 10;
    }

    const searchResults = await semanticSearch({
      query: searchQuery,
      limit: searchLimit,
    });

    if (searchResults.success && searchResults.results.length > 0) {
      // Build context from search results
      context = '\n\nRelevant information from the knowledge base:\n';

      // For overview requests, add comprehensive dataset information
      if (isAskingForOverview) {
        context += `\n[Dataset Overview]\n`;
        context += `- Dataset: ${datasetOverview.overview.title}\n`;
        context += `- Description: ${datasetOverview.overview.description}\n`;
        context += `- Time Range: ${datasetOverview.overview.timeRange}\n`;
        context += `- Total Records: ${datasetOverview.overview.recordCount}\n`;
        context += `- Total Procurement Spend: ${datasetOverview.metrics.totalProcurementSpend}\n`;
        context += `- Total Purchase Orders: ${datasetOverview.metrics.totalPurchaseOrders}\n`;
        context += `- Avg PO Value: ${datasetOverview.metrics.avgPOValue}\n`;
        context += `- On-Time Delivery Rate: ${datasetOverview.metrics.onTimeDeliveryRate}\n`;
        context += `- Avg Lead Time: ${datasetOverview.metrics.avgLeadTimeDays} days\n`;
        context += `\nRegions by Spend:\n`;
        datasetOverview.dimensions.regions.forEach((r) => {
          context += `  - ${r.name}: ${r.revenue} (${r.orders} POs)\n`;
        });
        context += `\nProduct Lines by Spend:\n`;
        datasetOverview.dimensions.categories.forEach((c) => {
          context += `  - ${c.name}: ${c.revenue} (${c.orders} POs)\n`;
        });
        context += `\nTemporal Patterns:\n`;
        context += `  - Highest Month: ${datasetOverview.temporalPatterns.highestSpendMonth.month} (${datasetOverview.temporalPatterns.highestSpendMonth.revenue})\n`;
        context += `  - Lowest Month: ${datasetOverview.temporalPatterns.lowestSpendMonth.month} (${datasetOverview.temporalPatterns.lowestSpendMonth.revenue})\n`;
        context += `  - Trend: ${datasetOverview.temporalPatterns.trend}\n`;
      }

      searchResults.results.forEach((result, idx: number) => {
        context += `\n[${idx + 1}] ${result.content}`;
        sources.push({
          id: result.id,
          content: result.content,
          metadata: result.metadata,
          score: result.relevance_score,
        });
      });

      log.info('Found relevant sources', { count: searchResults.results.length });

      // ── Supplementary search: category_summary ──────────────────
      if (isAskingAboutCategories && !sources.some(s => s.metadata?.type === 'category_summary')) {
        const catSearch = await semanticSearch({
          query: 'product line summary procurement spend total orders',
          limit: 8,
          filters: { type: 'category_summary' },
        });
        if (catSearch.success) {
          catSearch.results.forEach((result, idx: number) => {
            context += `\n[${sources.length + idx + 1}] ${result.content}`;
            sources.push({
              id: result.id,
              content: result.content,
              metadata: result.metadata,
              score: result.relevance_score,
            });
          });
          if (catSearch.results.length > 0) {
            log.info('Added category_summary sources via filtered search', { count: catSearch.results.length });
          }
        }
      }

      // ── Supplementary search: region_summary ────────────────────
      const isAskingAboutLeadTime = queryLower.includes('lead time') || queryLower.includes('lead-time');
      if ((isAskingAboutRegions || isAskingAboutLeadTime) && !sources.some(s => s.metadata?.type === 'region_summary')) {
        const regSearch = await semanticSearch({
          query: 'regional summary procurement spend lead time on-time delivery',
          limit: 6,
          filters: { type: 'region_summary' },
        });
        if (regSearch.success) {
          regSearch.results.forEach((result, idx: number) => {
            context += `\n[${sources.length + idx + 1}] ${result.content}`;
            sources.push({
              id: result.id,
              content: result.content,
              metadata: result.metadata,
              score: result.relevance_score,
            });
          });
          if (regSearch.results.length > 0) {
            log.info('Added region_summary sources via filtered search', { count: regSearch.results.length });
          }
        }
      }

      // ── Supplementary search: supplier_summary ──────────────────
      if (isAskingAboutSuppliers && !sources.some(s => s.metadata?.type === 'supplier_summary')) {
        const supSearch = await semanticSearch({
          query: searchQuery,
          limit: 10,
          filters: { type: 'supplier_summary' },
        });
        if (supSearch.success) {
          supSearch.results.forEach((result, idx: number) => {
            context += `\n[${sources.length + idx + 1}] ${result.content}`;
            sources.push({
              id: result.id,
              content: result.content,
              metadata: result.metadata,
              score: result.relevance_score,
            });
          });
          if (supSearch.results.length > 0) {
            log.info('Added supplier_summary sources via filtered search', { count: supSearch.results.length });
          }
        }
      }
    }
  }

  // ── Deduplicate and cap sources ─────────────────────────────────────
  // Supplementary searches can add duplicates (#19, #28)
  if (sources.length > 0) {
    const seen = new Set<string>();
    sources = sources.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    if (sources.length > MAX_SOURCES) {
      sources = sources.slice(0, MAX_SOURCES);
    }
    // Enforce total character budget (#11 R6)
    let totalChars = 0;
    sources = sources.filter(s => {
      totalChars += s.content.length;
      return totalChars <= MAX_SOURCE_CHARS;
    });
  }

  // ── Validate sources ────────────────────────────────────────────────
  if (sources.length > 0) {
    const validated = validateSources(sources);
    sources = validated.valid;
  }

  // ── Cache search results ────────────────────────────────────────────
  if (!cachedSearch && sources.length > 0) {
    searchCache.set(searchCK, { results: sources, context });
  }

  // ── SQL verification for precision queries ──────────────────────────
  const precisionKeywords = ['total', 'sum', 'how much', 'count', 'exactly', 'precise'];
  const queryLower = query.toLowerCase();
  const isPrecisionQuery = precisionKeywords.some(k => queryLower.includes(k));

  if (isPrecisionQuery && isDBAvailable()) {
    try {
      const knownTotals = await getKnownTotals();
      context += '\n\n[Verified SQL Result]:\n';
      const kt = knownTotals as Record<string, unknown>;
      if (kt.total_spend) context += `- Total Procurement Spend: $${Number(kt.total_spend).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      if (kt.total_events) context += `- Total Events: ${kt.total_events}\n`;
      if (kt.unique_suppliers) context += `- Unique Suppliers: ${kt.unique_suppliers}\n`;
      if (kt.avg_order_value) context += `- Average Order Value: $${Number(kt.avg_order_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      if (Array.isArray(kt.by_region)) {
        context += '- Spend by Region:\n';
        for (const r of kt.by_region as Array<{ region: string; spend: number; events: number }>) {
          context += `  - ${r.region}: $${r.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${r.events} events)\n`;
        }
      }
      if (Array.isArray(kt.by_product)) {
        context += '- Spend by Product Line:\n';
        for (const p of kt.by_product as Array<{ product_line: string; spend: number; events: number }>) {
          context += `  - ${p.product_line}: $${p.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${p.events} events)\n`;
        }
      }
      log.info('Appended verified SQL totals to context');

      // Cross-check RAG values against SQL
      const ragNumericValues: Record<string, number> = {};
      for (const s of sources) {
        if (s.metadata?.revenue && typeof s.metadata.revenue === 'number') {
          const key = (s.metadata.region || s.metadata.category || s.id) as string;
          ragNumericValues[key] = s.metadata.revenue as number;
        }
      }
      if (Object.keys(ragNumericValues).length > 0) {
        const check = crossCheckTotals(ragNumericValues, knownTotals);
        if (!check.passed) {
          context += '\n\n[Data Quality Warning]: Some RAG-derived values differ from verified SQL totals:\n';
          for (const d of check.discrepancies) {
            context += `- ${d.field}: RAG=${d.ragValue}, SQL=${d.sqlValue} (${d.diffPercent}% difference)\n`;
          }
          context += 'Please use the SQL-verified values above when reporting exact numbers.\n';
        }
      }
    } catch (error) {
      log.error('SQL verification failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { context, sources };
}
