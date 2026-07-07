/**
 * GreenTouch.pro — Postgres (Supabase) data layer
 * Drop-in replacement for the better-sqlite3 `db` object. Preserves the
 * synchronous-looking .prepare().get()/.all()/.run() surface the app already
 * uses, but backs it with an async Postgres pool. Because pg is async, the
 * .get()/.all()/.run() methods return Promises — callers are updated to await.
 *
 * Also rewrites SQLite-isms on the fly:
 *   - `?` placeholders            -> `$1,$2,...`
 *   - date('now') / datetime('now') -> now()  (handled in SQL we control)
 *
 * Connection: SUPABASE_DB_URL (transaction pooler string).
 */
import pg from 'pg';
const { Pool } = pg;

const CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!CONN) throw new Error('SUPABASE_DB_URL not set');

export const pool = new Pool({
  connectionString: CONN,
  ssl: { rejectUnauthorized: false },
  max: 8,                       // stay well under free-tier pooler limits
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

// Convert `?` placeholders to `$1,$2,...` for pg
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// A prepared-statement shim matching better-sqlite3's surface (but async)
function prepare(sql) {
  const text = toPg(sql);
  return {
    async get(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const r = await pool.query(text, flat);
      return r.rows[0];
    },
    async all(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const r = await pool.query(text, flat);
      return r.rows;
    },
    async run(...params) {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const r = await pool.query(text, flat);
      return { changes: r.rowCount, lastInsertRowid: null };
    },
  };
}

async function exec(sql) { await pool.query(sql); }

// Health check used at boot
export async function ping() {
  const r = await pool.query('select count(*)::int n from projects');
  return r.rows[0].n;
}

const db = { prepare, exec };
export default db;
