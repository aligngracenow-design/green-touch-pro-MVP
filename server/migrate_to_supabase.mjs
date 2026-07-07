/**
 * GreenTouch.pro — SQLite → Supabase (Postgres) migrator
 * Introspects every table in the live SQLite DB, recreates it in Postgres
 * with type-mapped columns, and copies all rows. Idempotent-ish: drops &
 * recreates each table (safe because SQLite remains the source until cutover).
 *
 * Usage: node migrate_to_supabase.mjs
 *   env: SUPABASE_DB_URL (postgres connection string)
 */
import pg from 'pg';
import Database from 'better-sqlite3';
import path from 'node:path';

const { Client } = pg;
const SQLITE = process.env.SQLITE_DB || '/opt/data/hermes-os/data/hermes.db';
const PGURL = process.env.SUPABASE_DB_URL;
if (!PGURL) { console.error('Set SUPABASE_DB_URL'); process.exit(1); }

// SQLite type affinity -> Postgres type
function pgType(sqliteType) {
  const t = (sqliteType || '').toUpperCase();
  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
  if (t.includes('BOOL')) return 'BOOLEAN';
  if (t.includes('BLOB')) return 'BYTEA';
  return 'TEXT'; // TEXT, VARCHAR, DATE, DATETIME, NUMERIC all safe as TEXT for a faithful copy
}

const sq = new Database(SQLITE, { readonly: true });

// Connect with retry/backoff — the free-tier pooler rate-limits rapid reconnects.
async function connectWithRetry(maxAttempts = 40) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const c = new Client({ connectionString: PGURL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try {
      await c.connect();
      await c.query('select 1');
      console.log(`Connected to Supabase Postgres (attempt ${attempt}).`);
      return c;
    } catch (e) {
      try { await c.end(); } catch {}
      const wait = Math.min(60, 8 * attempt);
      console.log(`  attempt ${attempt}/${maxAttempts} failed (${e.message}) — retrying in ${wait}s`);
      if (attempt === maxAttempts) throw e;
      await new Promise(r => setTimeout(r, wait * 1000));
    }
  }
}
const pgc = await connectWithRetry();

const tables = sq.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
let totalRows = 0;

for (const table of tables) {
  const cols = sq.prepare(`PRAGMA table_info("${table}")`).all(); // cid,name,type,notnull,dflt_value,pk
  const pkCols = cols.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => `"${c.name}"`);
  const singlePk = pkCols.length === 1;
  const colDefs = cols.map(c => {
    let def = `"${c.name}" ${pgType(c.type)}`;
    if (c.pk && singlePk) def += ' PRIMARY KEY';
    return def;
  });
  // Composite primary key -> table-level constraint
  if (pkCols.length > 1) colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
  const colDefsSql = colDefs.join(', ');

  await pgc.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  await pgc.query(`CREATE TABLE "${table}" (${colDefsSql})`);

  const rows = sq.prepare(`SELECT * FROM "${table}"`).all();
  if (rows.length) {
    const colNames = cols.map(c => `"${c.name}"`);
    // batch insert
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const values = [];
      const placeholders = slice.map((row, ri) => {
        const ph = cols.map((c, ci) => {
          let v = row[c.name];
          if (typeof v === 'bigint') v = v.toString();
          values.push(v === undefined ? null : v);
          return `$${ri * cols.length + ci + 1}`;
        });
        return `(${ph.join(',')})`;
      });
      await pgc.query(`INSERT INTO "${table}" (${colNames.join(',')}) VALUES ${placeholders.join(',')}`, values);
    }
  }
  totalRows += rows.length;
  console.log(`  ✓ ${table.padEnd(20)} ${cols.length} cols, ${rows.length} rows`);
}

console.log(`\n✅ Migrated ${tables.length} tables, ${totalRows} total rows to Supabase.`);
await pgc.end();
sq.close();
