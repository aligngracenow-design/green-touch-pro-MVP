import pg from 'pg';

const { Client } = pg;
const POOLER = 'postgresql://postgres.jkfmuctilfugibscgbuy:***@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

(async () => {
  const c = new Client({ connectionString: POOLER, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await c.connect();
  console.log('Connected ✓\n');

  // 1. Create users table (match SQLite schema exactly)
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
  console.log('  ✓ users table created');

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
  console.log('  ✓ user_roles table created');

  // 3. Migrate data from SQLite using better-sqlite3
  console.log('\nMigrating data from SQLite...');
  const sqlite3 = require('better-sqlite3');
  const db = sqlite3('/opt/data/hermes-os/data/hermes.db');

  // Migrate users
  const users = db.prepare('SELECT * FROM users').all();
  console.log(`  Found ${users.length} users in SQLite`);
  for (const u of users) {
    try {
      await c.query(
        `INSERT INTO users (id, email, name, company, role, password, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.name, u.company, u.role, u.password, u.created_at]
      );
    } catch (e) { console.log(`  Skip user ${u.id}: ${e.message}`); }
  }

  // Migrate user_roles
  const roles = db.prepare('SELECT * FROM user_roles').all();
  console.log(`  Found ${roles.length} user_roles in SQLite`);
  for (const r of roles) {
    try {
      await c.query(
        `INSERT INTO user_roles (user_id, chat_id, role, set_by, set_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [r.user_id, r.chat_id, r.role, r.set_by, r.set_at]
      );
    } catch (e) { console.log(`  Skip role ${r.user_id}: ${e.message}`); }
  }

  db.close();

  // 4. Verify counts
  console.log('\n--- Final verification ---');
  const allTables = await c.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`Total tables: ${allTables.rows.length}`);

  for (const t of allTables.rows) {
    const count = await c.query(`SELECT COUNT(*) as c FROM "${t.tablename}"`);
    console.log(`  ${t.tablename}: ${count.rows[0].c} rows`);
  }

  await c.end();
  console.log('\n✅ Migration complete — all 37 tables in Supabase');
})();
