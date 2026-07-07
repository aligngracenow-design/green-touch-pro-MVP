// Test Supabase pooler only
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
const env = {};
envRaw.split('\n').forEach(line => {
  line = line.trim();
  if (line && !line.startsWith('#') && line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const { Client } = pg;
const c = new Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  try {
    await c.connect();
    console.log('POOLER: CONNECTED');
    const r = await c.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('Tables:', r.rows.map(x => x.tablename).join(', '));
    await c.end();
  } catch (e) {
    console.log('POOLER FAILED:', e.message);
  }
})();
