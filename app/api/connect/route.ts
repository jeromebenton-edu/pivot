import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { promises as dns } from 'dns';
import { createLogger } from '@/lib/logger';
import { auth, requirePermission } from '@/lib/auth';
import { Pool } from 'pg';
import { chunkData } from '@/lib/data/chunker';
import { embedAndStoreChunks } from '@/lib/data/embedder';
import { logAuditEvent } from '@/lib/db/audit';
import { invalidateDatasetCaches } from '@/lib/cache';
import { createRateLimiter } from '@/lib/rate-limit';
import type { ColumnMeta } from '@/lib/data/csv-parser';

const log = createLogger('connect');

// Rate limiter for database connection attempts (#4 R6)
const connectRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10, // 10 connection attempts per minute
  message: 'Too many connection attempts. Please wait before trying again.',
});

// SSRF protection: block RFC 1918, link-local, localhost, cloud metadata IPs (#1 R6)
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // Link-local / AWS metadata
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?fc00:/i, // IPv6 ULA
  /^\[?fd/i,    // IPv6 ULA
  /^::ffff:127\./i,     // IPv4-mapped IPv6 loopback (#5 R7)
  /^::ffff:10\./i,      // IPv4-mapped IPv6 private
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:169\.254\./i,
  /^::ffff:0\.0\.0\.0$/i,
  /^metadata\.google\.internal$/i,
  /^metadata\.internal$/i,
];

function isBlockedHost(host: string): boolean {
  // Strip brackets from IPv6 addresses
  const cleaned = host.replace(/^\[|\]$/g, '');
  return BLOCKED_HOST_PATTERNS.some(pattern => pattern.test(cleaned));
}

// DNS pre-resolution to prevent DNS rebinding attacks (#5 R7)
// Returns the resolved IP to use for the connection (#R8-12 TOCTOU fix)
async function resolveAndCheckHost(host: string): Promise<string> {
  // Already an IP — just return it
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return host;

  try {
    const addresses = await dns.resolve4(host).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(host).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    for (const addr of allAddresses) {
      if (isBlockedHost(addr)) {
        throw new Error(`Host resolves to blocked IP`);
      }
    }
    // Return first resolved IP to avoid second DNS lookup in pg (#R8-12)
    if (allAddresses.length > 0) return allAddresses[0];
  } catch (error) {
    if ((error as Error).message?.includes('blocked IP')) throw error;
  }
  // DNS resolution returned nothing — block rather than fallthrough to pg DNS (#R9-9)
  throw new Error('DNS resolution returned no addresses');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RBAC: require 'connect' permission (#Phase5)
  const denied = requirePermission(session, 'connect');
  if (denied) return denied;

  // Rate limit per user (#4 R6)
  const rateLimitResult = await connectRateLimiter(session.user.id);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
  }

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { action, type, host, port, database, username, password, ssl, table } = body;

    if (type !== 'postgresql') {
      return NextResponse.json({ error: 'Only PostgreSQL is currently supported' }, { status: 400 });
    }

    // Validate action before creating pool (#R8-13, R8-14)
    if (!action || !['test', 'import'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (action === 'import' && !table) {
      return NextResponse.json({ error: 'Table name required for import' }, { status: 400 });
    }

    // Validate connection parameters (#6 R6)
    if (!host || typeof host !== 'string' || host.length > 255) {
      return NextResponse.json({ error: 'Invalid host' }, { status: 400 });
    }
    if (!database || typeof database !== 'string' || database.length > 128) {
      return NextResponse.json({ error: 'Invalid database name' }, { status: 400 });
    }
    if (!username || typeof username !== 'string' || username.length > 128) {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }
    const portNum = parseInt(port) || 5432;
    if (portNum < 1 || portNum > 65535) {
      return NextResponse.json({ error: 'Invalid port (must be 1-65535)' }, { status: 400 });
    }

    // SSRF protection (#1 R6)
    if (isBlockedHost(host)) {
      return NextResponse.json({ error: 'Connection to this host is not allowed' }, { status: 400 });
    }

    // DNS pre-resolution to catch rebinding; use resolved IP for connection (#5 R7, #R8-12)
    let resolvedHost = host;
    try {
      resolvedHost = await resolveAndCheckHost(host);
    } catch {
      return NextResponse.json({ error: 'Connection to this host is not allowed' }, { status: 400 });
    }

    // Validate password is a string with reasonable length (#R7)
    if (password !== undefined && password !== null && (typeof password !== 'string' || password.length > 1024)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
    }

    const pool = new Pool({
      host: resolvedHost,
      port: portNum,
      database,
      user: username,
      password,
      ssl: ssl ? { rejectUnauthorized: true } : false, // Use proper TLS validation (#5 R6)
      connectionTimeoutMillis: 10000,
      max: 2, // Limit pool size per request to prevent resource exhaustion (#R7)
    });

    try {
      if (action === 'test') {
        // Test connection and list tables
        const client = await pool.connect();
        const result = await client.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        client.release();

        const tables = result.rows.map(r => r.table_name);
        return NextResponse.json({ success: true, tables });
      }

      if (action === 'import' && table) {
        // Validate table name (prevent SQL injection)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
          return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
        }

        const client = await pool.connect();

        // Get row count
        const countResult = await client.query(`SELECT count(*) as cnt FROM "${table}"`);
        const rowCount = parseInt(countResult.rows[0].cnt);

        // Limit to 10000 rows for embedding
        const limit = Math.min(rowCount, 10000);
        const dataResult = await client.query(`SELECT * FROM "${table}" LIMIT $1`, [limit]);
        client.release();

        const rows = dataResult.rows;
        if (rows.length === 0) {
          return NextResponse.json({ error: 'Table is empty' }, { status: 400 });
        }

        // Detect column types
        const columns: ColumnMeta[] = Object.keys(rows[0]).map(name => {
          const samples = rows.slice(0, 5).map(r => r[name]);
          const nonNull = samples.filter(v => v !== null && v !== undefined);
          let colType: ColumnMeta['type'] = 'string';
          if (nonNull.every(v => typeof v === 'number')) colType = 'number';
          else if (nonNull.every(v => typeof v === 'boolean')) colType = 'boolean';
          else if (nonNull.every(v => v instanceof Date)) colType = 'date';
          return { name, type: colType, sampleValues: samples };
        });

        const parsed = { rows, columns, rowCount: rows.length };
        const datasetName = `${database}.${table}`;
        const datasetId = `db-${randomUUID()}`; // Cryptographically random ID (#3 R6)

        const chunks = chunkData(parsed, datasetName);
        const embedResult = await embedAndStoreChunks(datasetId, chunks, session.user.id);

        // Check if embedding succeeded (#R10-20)
        if (!embedResult.success) {
          return NextResponse.json({ error: 'Failed to process and embed imported data' }, { status: 500 });
        }

        // Invalidate caches since new data was imported (#7 R6)
        invalidateDatasetCaches(datasetId);

        await logAuditEvent(session.user.id, 'database_import', {
          datasetId,
          datasetName,
          database,
          table,
          rowCount: rows.length,
        });

        return NextResponse.json({
          datasetId,
          datasetName,
          rowCount: rows.length,
          columns,
        });
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } finally {
      await pool.end();
    }
  } catch (error) {
    // Return generic error to client — never expose connection details (#2 R6)
    log.error('Database connection error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }
}
