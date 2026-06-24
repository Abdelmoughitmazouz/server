/**
 * Migration runner for FolderTube Supabase database.
 *
 * Usage:
 *   node scripts/migrate.js
 *
 * This requires a direct PostgreSQL connection string. Set PGDATABASE_URL
 * in .env, or omit it to print the SQL to apply.
 *
 * Example PGDATABASE_URL:
 *   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
 *
 * You can find the password in your Supabase dashboard:
 *   Project Settings → Database → Connection string (URI mode)
 */

import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');
const PG_URL = process.env.PGDATABASE_URL;

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No migration files found.');
  process.exit(0);
}

async function runWithPg(pgUrl) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: pgUrl });

  try {
    // Create migration tracking table
    await pool.query(`
      create table if not exists public._migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows: applied } = await pool.query(
      "select name from public._migrations order by name"
    );
    const appliedNames = new Set(applied.map(r => r.name));

    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`[skip] ${file}`);
        continue;
      }

      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[apply] ${file}...`);

      await pool.query(sql);
      await pool.query(
        'insert into public._migrations (name) values ($1) on conflict (name) do nothing',
        [file]
      );

      console.log(`  done`);
    }

    console.log('\nAll migrations applied.');
  } finally {
    await pool.end();
  }
}

function printSql() {
  console.log('No PGDATABASE_URL set. Copy-paste the following SQL into your');
  console.log('Supabase Dashboard SQL Editor (https://supabase.com/dashboard)');
  console.log('Apply files in order:\n');

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    console.log(`-- ===== ${file} =====`);
    console.log(sql.trim());
    console.log('');
  }
}

async function main() {
  if (PG_URL) {
    console.log('Connecting via PGDATABASE_URL...\n');
    await runWithPg(PG_URL);
  } else {
    printSql();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
