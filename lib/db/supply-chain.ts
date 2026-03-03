import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('db');

// Use globalThis to survive HMR in dev mode (#16, #R8-2)
const globalPool = globalThis as unknown as {
  __pivotPgPool?: Pool;
  __pivotDbAvailable?: boolean;
  __pivotInitPromise?: Promise<void> | null;
};
if (globalPool.__pivotDbAvailable === undefined) globalPool.__pivotDbAvailable = false;
if (globalPool.__pivotInitPromise === undefined) globalPool.__pivotInitPromise = null;

// Accessors for HMR-safe state
function getDbAvailable() { return globalPool.__pivotDbAvailable!; }
function setDbAvailable(v: boolean) { globalPool.__pivotDbAvailable = v; }
function getInitPromise(): Promise<void> | null | undefined { return globalPool.__pivotInitPromise; }
function setInitPromise(v: Promise<void> | null) { globalPool.__pivotInitPromise = v; }

// Safe number parser — returns 0 for NaN/null/undefined (#3)
// NaN is not nullish so `?? 0` is a no-op; use `|| 0` for fallback

function safeNumber(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// Use Math.round on the float to avoid silent truncation of decimals (#9 R6)
function safeInt(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Variants with logging — used only during seeding where context matters (#4 R6)
// Counter is passed in to avoid module-level shared state across concurrent requests
function safeNumberLog(val: unknown, context: string, counter: { count: number }): number {
  const n = Number(val);
  if (Number.isFinite(n)) return n;
  counter.count++;
  if (counter.count <= 10) {
    log.warn(`Coerced non-numeric value to 0 for ${context}`, { value: String(val).slice(0, 50) });
  }
  return 0;
}

function safeIntLog(val: unknown, context: string, counter: { count: number }): number {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    counter.count++;
    if (counter.count <= 10) {
      log.warn(`Coerced non-integer value to 0 for ${context}`, { value: String(val).slice(0, 50) });
    }
    return 0;
  }
  return Math.round(n);
}

export function isDBAvailable(): boolean {
  return getDbAvailable();
}

function getPool(): Pool {
  if (!globalPool.__pivotPgPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('[DB] DATABASE_URL is not set — cannot create pool');
    }
    globalPool.__pivotPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      statement_timeout: 10000, // 10s query timeout
    });
  }
  return globalPool.__pivotPgPool;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS supply_chain_events (
  transaction_id VARCHAR PRIMARY KEY,
  date DATE,
  event_type VARCHAR,
  supplier_id VARCHAR,
  supplier_name VARCHAR,
  facility_id VARCHAR,
  facility_name VARCHAR,
  facility_region VARCHAR,
  product_line VARCHAR,
  material_id VARCHAR,
  material_name VARCHAR,
  unit_cost NUMERIC(12,2),
  quantity INTEGER,
  total_cost NUMERIC(12,2),
  lead_time_days INTEGER,
  quality_score NUMERIC(5,1),
  defect_rate NUMERIC(5,3),
  on_time BOOLEAN,
  shipping_mode VARCHAR,
  shipping_cost NUMERIC(12,2),
  priority VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_sce_date ON supply_chain_events(date);
CREATE INDEX IF NOT EXISTS idx_sce_region ON supply_chain_events(facility_region);
CREATE INDEX IF NOT EXISTS idx_sce_product ON supply_chain_events(product_line);
CREATE INDEX IF NOT EXISTS idx_sce_event ON supply_chain_events(event_type);
`;

async function seedFromJSON(p: Pool): Promise<void> {
  const dataPath = path.join(process.cwd(), 'data/samples/supply_chain_data.json');
  let raw: string;
  try {
    raw = await fs.readFile(dataPath, 'utf-8');
  } catch {
    log.warn('supply_chain_data.json not found, skipping seed');
    return;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    log.warn('supply_chain_data.json is not an array, skipping seed');
    return;
  }
  // Basic validation: filter rows that have required fields and valid dates (#38, #22)
  const datePattern = /^\d{4}-\d{2}-\d{2}/; // YYYY-MM-DD prefix
  const rows = parsed.filter((row: unknown) => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    if (!r.transaction_id || !r.date || !r.event_type) return false;
    // Validate date format to prevent bad dates from rolling back the entire seed (#22)
    if (typeof r.date !== 'string' || !datePattern.test(r.date)) {
      log.warn(`Skipping row ${r.transaction_id}: invalid date`, { date: String(r.date).slice(0, 30) });
      return false;
    }
    return true;
  }) as Record<string, unknown>[];
  if (rows.length === 0) {
    log.warn('No valid rows in supply_chain_data.json, skipping seed');
    return;
  }
  log.info(`Validated ${rows.length}/${parsed.length} rows for seeding`);

  // Wrap seed in a transaction for atomicity (#11)
  const client = await p.connect();
  // Per-invocation counter to avoid shared-state race condition (#4 R6)
  const coercionCounter = { count: 0 };
  try {
    await client.query('BEGIN');

    const BATCH_SIZE = 200;
    let attempted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      batch.forEach((row, batchIdx) => {
        const offset = batchIdx * 21;
        placeholders.push(
          `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},` +
          `$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},` +
          `$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},` +
          `$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21})`
        );
        // Coerce types to match SQL column types (#8)
        const tid = String(row.transaction_id);
        values.push(
          tid, row.date, String(row.event_type),
          row.supplier_id ? String(row.supplier_id) : null, row.supplier_name ? String(row.supplier_name) : null,
          row.facility_id ? String(row.facility_id) : null, row.facility_name ? String(row.facility_name) : null, row.facility_region ? String(row.facility_region) : null,
          row.product_line ? String(row.product_line) : null, row.material_id ? String(row.material_id) : null, row.material_name ? String(row.material_name) : null,
          safeNumberLog(row.unit_cost, `${tid}.unit_cost`, coercionCounter), safeIntLog(row.quantity, `${tid}.quantity`, coercionCounter), safeNumberLog(row.total_cost, `${tid}.total_cost`, coercionCounter),
          safeIntLog(row.lead_time_days, `${tid}.lead_time_days`, coercionCounter), safeNumberLog(row.quality_score, `${tid}.quality_score`, coercionCounter), safeNumberLog(row.defect_rate, `${tid}.defect_rate`, coercionCounter),
          row.on_time === true || row.on_time === 'true', row.shipping_mode ? String(row.shipping_mode) : null, safeNumberLog(row.shipping_cost, `${tid}.shipping_cost`, coercionCounter), row.priority ? String(row.priority) : null,
        );
      });

      await client.query(
        `INSERT INTO supply_chain_events (
          transaction_id, date, event_type,
          supplier_id, supplier_name,
          facility_id, facility_name, facility_region,
          product_line, material_id, material_name,
          unit_cost, quantity, total_cost,
          lead_time_days, quality_score, defect_rate,
          on_time, shipping_mode, shipping_cost, priority
        ) VALUES ${placeholders.join(',')} ON CONFLICT (transaction_id) DO NOTHING`,
        values,
      );
      attempted += batch.length;
    }

    await client.query('COMMIT');
    log.info(`Seeded ${attempted} supply chain events (duplicates skipped via ON CONFLICT)`);
    if (coercionCounter.count > 0) {
      log.warn(`${coercionCounter.count} value coercion warning(s) during seeding`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeSupplyChainDB(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    log.info('DATABASE_URL not set — SQL layer disabled');
    return;
  }

  if (getInitPromise()) return getInitPromise()!;

  const promise = (async () => {
    try {
      const p = getPool();
      await p.query(CREATE_TABLE_SQL);

      // Seed if table is empty
      const countResult = await p.query('SELECT COUNT(*) AS cnt FROM supply_chain_events');
      const count = parseInt(countResult.rows[0].cnt, 10);
      if (count === 0) {
        log.info('Table empty — seeding from JSON...');
        await seedFromJSON(p);
      } else {
        log.info(`supply_chain_events has ${count} rows — skipping seed`);
      }

      setDbAvailable(true);
      // Keep initPromise resolved (not null) on success — nulling causes duplicate init race (#1 R7)
      // Recovery after DB failure is handled in aggregateData() which nulls initPromise on connection errors
      log.info('PostgreSQL SQL layer ready');
    } catch (error) {
      log.error('Failed to initialize PostgreSQL', { error: (error as Error).message });
      setDbAvailable(false);
      setInitPromise(null); // Allow retry on next call
    }
  })();

  setInitPromise(promise);
  return promise;
}

// Allowed columns to prevent SQL injection in dynamic queries
const ALLOWED_COLUMNS = new Set([
  'transaction_id', 'date', 'event_type',
  'supplier_id', 'supplier_name',
  'facility_id', 'facility_name', 'facility_region',
  'product_line', 'material_id', 'material_name',
  'unit_cost', 'quantity', 'total_cost',
  'lead_time_days', 'quality_score', 'defect_rate',
  'on_time', 'shipping_mode', 'shipping_cost', 'priority',
]);

// Reject non-exact column matches — returns double-quoted identifier (#12)
function validateColumn(col: string): string {
  const lower = col.toLowerCase();
  if (!ALLOWED_COLUMNS.has(lower)) {
    // Truncate to prevent log injection with long/malicious column names (#R7)
    throw new Error(`Invalid column: ${col.slice(0, 50)}`);
  }
  return `"${lower}"`;
}

// Max number of filter entries to prevent abuse (#19)
const MAX_FILTERS = 10;

interface AggregateParams {
  operation: 'sum' | 'avg' | 'count' | 'group_by';
  field?: string;
  groupBy?: string;
  filters?: Record<string, unknown>;
}

export async function aggregateData(params: AggregateParams): Promise<{
  success: boolean;
  operation: string;
  field?: string;
  groupBy?: string;
  results: Record<string, unknown>;
}> {
  if (!getDbAvailable()) {
    // Attempt recovery: re-initialize if DB was previously unavailable (#11)
    if (process.env.DATABASE_URL) {
      log.info('Attempting recovery...');
      await initializeSupplyChainDB();
    }
    if (!getDbAvailable()) {
      throw new Error('Database not available');
    }
  }

  const { operation, field, groupBy, filters } = params;
  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let paramIdx = 1;

  // Build WHERE clauses from filters with validation (#19)
  if (filters) {
    const entries = Object.entries(filters);
    if (entries.length > MAX_FILTERS) {
      throw new Error(`Too many filters (max ${MAX_FILTERS})`);
    }
    for (const [key, value] of entries) {
      const col = validateColumn(key);
      // Validate filter values are primitives (#19)
      if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error(`Invalid filter value type for ${key}: ${typeof value}`);
      }
      whereClauses.push(`${col} = $${paramIdx}`);
      queryParams.push(value);
      paramIdx++;
    }
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    if (operation === 'group_by' && groupBy) {
      const groupCol = validateColumn(groupBy);
      const aggField = field ? validateColumn(field) : '"total_cost"';
      const sql = `
        SELECT ${groupCol} AS group_key,
               COUNT(*) AS count,
               COALESCE(SUM(${aggField}), 0) AS total,
               COALESCE(AVG(${aggField}), 0) AS average
        FROM supply_chain_events
        ${whereSQL}
        GROUP BY ${groupCol}
        ORDER BY total DESC
      `;
      const result = await getPool().query(sql, queryParams);
      const grouped: Record<string, { count: number; total: number; average: number }> = {};
      for (const row of result.rows) {
        grouped[row.group_key] = {
          count: safeInt(row.count),
          total: safeNumber(row.total),
          average: safeNumber(row.average),
        };
      }
      return { success: true, operation, groupBy, results: grouped };
    }

    if (operation === 'count') {
      const sql = `
        SELECT COUNT(*) AS total_events,
               COUNT(DISTINCT supplier_id) AS unique_suppliers,
               COUNT(DISTINCT material_id) AS unique_materials
        FROM supply_chain_events ${whereSQL}
      `;
      const result = await getPool().query(sql, queryParams);
      const row = result.rows[0];
      return {
        success: true,
        operation,
        results: {
          total_events: safeInt(row.total_events),
          unique_suppliers: safeInt(row.unique_suppliers),
          unique_materials: safeInt(row.unique_materials),
        },
      };
    }

    // sum or avg — use COALESCE to prevent NaN on empty result sets (#12)
    const aggField = field ? validateColumn(field) : '"total_cost"';
    const aggFn = operation === 'sum' ? 'SUM' : 'AVG';
    const sql = `
      SELECT COALESCE(${aggFn}(${aggField}), 0) AS result,
             COUNT(*) AS row_count
      FROM supply_chain_events ${whereSQL}
    `;
    const result = await getPool().query(sql, queryParams);
    const row = result.rows[0];
    // Return the unquoted column name for LLM context (#6 R6)
    const unquotedField = field || 'total_cost';
    return {
      success: true,
      operation,
      field: unquotedField,
      results: {
        value: safeNumber(row.result),
        row_count: safeInt(row.row_count),
      },
    };
  } catch (error) {
    // Mark DB as unavailable on connection errors (#17, #24 broadened)
    const msg = (error as Error).message || '';
    const connectionErrors = [
      'ECONNREFUSED', 'Connection terminated', 'timeout',
      'too many clients', 'out of memory', 'SSL connection',
      'ENOTFOUND', 'ECONNRESET', 'EPIPE', 'connection refused',
    ];
    if (connectionErrors.some(e => msg.toLowerCase().includes(e.toLowerCase()))) {
      log.error('Connection error, marking DB unavailable', { error: msg });
      setDbAvailable(false);
      setInitPromise(null);
    }
    throw error;
  }
}

export async function getKnownTotals(): Promise<Record<string, unknown>> {
  if (!getDbAvailable()) return {};

  const p = getPool();

  // Use Promise.allSettled for partial results on failure (#20 from review)
  const [totalsResult, byRegionResult, byProductResult] = await Promise.allSettled([
    p.query(`
      SELECT COALESCE(SUM(total_cost), 0) AS total_spend,
             COUNT(*) AS total_events,
             COUNT(DISTINCT supplier_id) AS unique_suppliers,
             COALESCE(AVG(total_cost), 0) AS avg_order_value,
             COALESCE(AVG(lead_time_days), 0) AS avg_lead_time
      FROM supply_chain_events
    `),
    p.query(`
      SELECT facility_region AS region,
             SUM(total_cost) AS spend,
             COUNT(*) AS events
      FROM supply_chain_events
      GROUP BY facility_region
      ORDER BY spend DESC
    `),
    p.query(`
      SELECT product_line,
             SUM(total_cost) AS spend,
             COUNT(*) AS events
      FROM supply_chain_events
      GROUP BY product_line
      ORDER BY spend DESC
    `),
  ]);

  // Use safeNumber/safeInt to handle NaN from parseFloat/parseInt (#3)
  const row = totalsResult.status === 'fulfilled' ? totalsResult.value.rows[0] : null;
  return {
    total_spend: row ? safeNumber(row.total_spend) : 0,
    total_events: row ? safeInt(row.total_events) : 0,
    unique_suppliers: row ? safeInt(row.unique_suppliers) : 0,
    avg_order_value: row ? safeNumber(row.avg_order_value) : 0,
    avg_lead_time: row ? safeNumber(row.avg_lead_time) : 0,
    by_region: byRegionResult.status === 'fulfilled'
      ? byRegionResult.value.rows.map(r => ({
          region: r.region,
          spend: safeNumber(r.spend),
          events: safeInt(r.events),
        }))
      : [],
    by_product: byProductResult.status === 'fulfilled'
      ? byProductResult.value.rows.map(r => ({
          product_line: r.product_line,
          spend: safeNumber(r.spend),
          events: safeInt(r.events),
        }))
      : [],
  };
}
