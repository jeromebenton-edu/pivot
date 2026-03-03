/**
 * Simple database migration runner.
 *
 * Reads numbered SQL files from /migrations/ and executes them in order.
 * Tracks applied migrations in a _migrations table.
 *
 * Usage: bun run db:migrate
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('migrate');

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const MIGRATIONS_TABLE = '_migrations';

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return new Set(rows.map(r => r.name));
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    log.warn('No migrations directory found', { path: MIGRATIONS_DIR });
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.warn('DATABASE_URL not set, skipping migrations');
    return { applied: [], skipped: [] };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await ensureMigrationsTable(pool);
    const alreadyApplied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      log.info('Applying migration', { file });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
          [file]
        );
        await client.query('COMMIT');
        applied.push(file);
        log.info('Migration applied', { file });
      } catch (error) {
        await client.query('ROLLBACK');
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Migration failed', { file, error: msg });
        throw new Error(`Migration ${file} failed: ${msg}`);
      } finally {
        client.release();
      }
    }

    log.info('Migration run complete', { applied: applied.length, skipped: skipped.length });
    return { applied, skipped };
  } finally {
    await pool.end();
  }
}

// Run directly when executed as a script
if (require.main === module || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(`Migrations complete: ${applied.length} applied, ${skipped.length} skipped`);
      if (applied.length > 0) console.log('Applied:', applied.join(', '));
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
