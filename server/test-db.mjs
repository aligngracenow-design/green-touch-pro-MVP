import pg from 'pg';

const { Client } = pg;

// Test pooler with fresh password
const poolerUrl = 'postgresql://postgres.jkfmuctilfugibscgbuy:Greentouchbuilderspro@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

const c = new Client({
  connectionString: poolerUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

(async () => {
  try {
    await c.connect();
    console.log('POOLER: CONNECTED ✓');
    const r = await c.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log(`Supabase tables (${r.rows.length}):`, r.rows.map(x => x.tablename).join(', '));
    
    // Now check which tables have data
    console.log('\n--- Table row counts ---');
    for (const t of r.rows) {
      const count = await c.query(`SELECT COUNT(*) as c FROM "${t.tablename}"`);
      console.log(`  ${t.tablename}: ${count.rows[0].c} rows`);
    }
    await c.end();
  } catch (e) {
    console.log('POOLER FAILED:', e.message);
    
    // Try direct
    console.log('\nTrying direct connection...');
    const directUrl = 'postgresql://postgres:Greentouchbuilderspro@db.jkfmuctilfugibscgbuy.supabase.co:5432/postgres';
    const d = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    try {
      await d.connect();
      console.log('DIRECT: CONNECTED ✓');
      await d.end();
    } catch (e2) {
      console.log('DIRECT FAILED:', e2.message);
    }
  }
})();
