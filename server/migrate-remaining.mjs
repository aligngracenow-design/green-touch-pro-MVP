import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
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

console.log('Pooler URL:', env.SUPABASE_DB_URL.replace(/:[^:@]+@/, ':***@'));

const { Client } = pg;

(async () => {
  const c = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await c.connect();
  console.log('Connected ✓\n');

  // 1. Create users table
  console.log('Creating users table...');
  await c.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      role TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  console.log('  ✓ created');

  // 2. Create user_roles table
  console.log('Creating user_roles table...');
  await c.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT,
      chat_id TEXT,
      role TEXT,
      set_by TEXT,
      set_at TEXT
    )
  `);
  console.log('  ✓ created');

  // 3. Migrate data
  console.log('\nMigrating data...');
  const sqlite3 = require('better-sqlite3');
  const db = sqlite3('/opt/data/hermes-os/data/hermes.db');

  const users = db.prepare('SELECT * FROM users').all();
  console.log(`  users: ${users.length} rows`);
  for (const u of users) {
    try {
      await c.query(
        `INSERT INTO users (id, email, name, company, role, password, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.name, u.company, u.role, u.password, u.created_at]
      );
    } catch (e) { console.log(`    skip ${u.id}: ${e.message}`); }
  }

  const roles = db.prepare('SELECT * FROM user_roles').all();
  console.log(`  user_roles: ${roles.length} rows`);
  for (const r of roles) {
    try {
      await c.query(
        `INSERT INTO user_roles (user_id, chat_id, role, set_by, set_at) VALUES ($1,$2,$3,$4,$5)`,
        [r.user_id, r.chat_id, r.role, r.set_by, r.set_at]
      );
    } catch (e) { console.log(`    skip: ${e.message}`); }
  }

  db.close();

  // 4. Verify
  const all = await c.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nTotal tables: ${all.rows.length}`);
  for (const t of all.rows) {
    const cnt = await c.query(`SELECT COUNT(*) as c FROM "${t.tablename}"`);
    console.log(`  ${t.tablename}: ${cnt.rows[0].c}`);
  }

  await c.end();
  console.log('\n✅ Done — 37 tables in Supabase');
})();
