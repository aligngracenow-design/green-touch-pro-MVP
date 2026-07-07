// ─── Generic resource layer for full bot parity ──────────────────
// Exposes safe list/get/create/update/delete over Supabase Postgres
// for every construction domain the Telegram bot manages.
// Schema is introspected at boot so columns always match the real DB.
import { nanoid } from 'nanoid';

// Whitelisted tables the dashboard may manage, with id-prefix + default sort.
export const RESOURCES = {
  change_orders:   { prefix: 'co',   sort: 'created_at DESC' },
  assignments:     { prefix: 'h',    sort: 'created_at DESC' },
  inspections:     { prefix: 'insp', sort: 'scheduled_date ASC' },
  permits:         { prefix: 'prm',  sort: 'expiration_date ASC' },
  punchlist:       { prefix: 'pl',   sort: 'created_at DESC' },
  lien_releases:   { prefix: 'lien', sort: 'created_at DESC' },
  rfis:            { prefix: 'rfi',  sort: 'created_at DESC' },
  submittals:      { prefix: 'sub',  sort: 'created_at DESC' },
  blockers:        { prefix: 'blk',  sort: 'created_at DESC' },
  deliveries:      { prefix: 'dlv',  sort: 'scheduled_date ASC' },
  contacts:        { prefix: 'ct',   sort: 'name ASC' },
  safety_incidents:{ prefix: 'inc',  sort: 'created_at DESC' },
  toolbox_talks:   { prefix: 'tbt',  sort: 'created_at DESC' },
  plan_revisions:  { prefix: 'rev',  sort: 'created_at DESC' },
  daily_reports:   { prefix: 'dr',   sort: 'created_at DESC' },
  subs:            { prefix: 'sb',   sort: 'name ASC' },
  reminders:       { prefix: 'rem',  sort: 'created_at DESC' },
  time_entries:    { prefix: 'te',   sort: 'clock_in DESC' },
  meetings:        { prefix: 'mtg',  sort: 'started_at DESC' },
  conversations:   { prefix: 'msg',  sort: 'created_at DESC' },
};

// Introspect real columns per table from Postgres information_schema
export async function buildColumnMap(pool) {
  const map = {};
  try {
    const res = await pool.query(
      `SELECT table_name, column_name, is_nullable,
              CASE WHEN column_name = 'id' THEN true ELSE false END as is_pk
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1)`,
      [Object.keys(RESOURCES)]
    );
    for (const row of res.rows) {
      if (!map[row.table_name]) map[row.table_name] = { cols: [], pk: 'id' };
      map[row.table_name].cols.push(row.column_name);
    }
  } catch (e) { console.error('buildColumnMap error:', e.message); }
  return map;
}

export async function registerResourceRoutes(app, pool, auth) {
  const colMap = await buildColumnMap(pool);

  function ok(table) {
    return Object.prototype.hasOwnProperty.call(RESOURCES, table) && colMap[table];
  }

  // LIST  /api/r/:table  (?project=, ?status=, ?limit=)
  app.get('/api/r/:table', auth, async (req, res) => {
    const { table } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      const { cols } = colMap[table];
      const { project, status } = req.query;
      const limit = Math.min(Number(req.query.limit) || 500, 1000);
      const where = [];
      const args = [];
      let paramIdx = 1;
      if (project && cols.includes('project')) { where.push(`project LIKE $${paramIdx++}`); args.push(`%${project}%`); }
      if (status && cols.includes('status')) { where.push(`status = $${paramIdx++}`); args.push(status); }
      const sortCol = RESOURCES[table].sort.split(' ')[0];
      const sort = cols.includes(sortCol) ? RESOURCES[table].sort : `${colMap[table].pk} DESC`;
      const sql = `SELECT * FROM "${table}" ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT $${paramIdx}`;
      args.push(limit);
      const result = await pool.query(sql, args);
      res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET one
  app.get('/api/r/:table/:id', auth, async (req, res) => {
    const { table, id } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      const result = await pool.query(`SELECT * FROM "${table}" WHERE ${colMap[table].pk} = $1`, [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'not found' });
      res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // CREATE
  app.post('/api/r/:table', auth, async (req, res) => {
    const { table } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      const { cols, pk } = colMap[table];
      const b = req.body || {};
      const id = b[pk] || `${RESOURCES[table].prefix}_${nanoid(10)}`;
      const keys = [pk];
      const args = [id];
      let paramIdx = 2;
      for (const c of cols) {
        if (c === pk) continue;
        if (b[c] !== undefined) { keys.push(c); args.push(b[c]); }
        else if (c === 'created_at') { keys.push(c); args.push(new Date().toISOString()); }
        else if (c === 'created_by') { keys.push(c); args.push(req.user?.email || 'Dashboard'); }
        else if (c === 'status') { keys.push(c); args.push('open'); }
      }
      const sql = `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`;
      await pool.query(sql, keys.map((_, i) => args[i]));
      const result = await pool.query(`SELECT * FROM "${table}" WHERE ${pk} = $1`, [id]);
      res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // UPDATE (partial)
  app.patch('/api/r/:table/:id', auth, async (req, res) => {
    const { table, id } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      const { cols, pk } = colMap[table];
      const existing = await pool.query(`SELECT * FROM "${table}" WHERE ${pk} = $1`, [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'not found' });
      const b = req.body || {};
      const updates = Object.keys(b).filter(k => cols.includes(k) && k !== pk);
      if (!updates.length) return res.json(existing.rows[0]);
      const sql = `UPDATE "${table}" SET ${updates.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE ${pk} = $${updates.length + 1}`;
      await pool.query(sql, [...updates.map(k => b[k]), id]);
      const result = await pool.query(`SELECT * FROM "${table}" WHERE ${pk} = $1`, [id]);
      res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE
  app.delete('/api/r/:table/:id', auth, async (req, res) => {
    const { table, id } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      await pool.query(`DELETE FROM "${table}" WHERE ${colMap[table].pk} = $1`, [id]);
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Schema discovery
  app.get('/api/schema/:table', auth, async (req, res) => {
    const { table } = req.params;
    if (!ok(table)) return res.status(404).json({ error: 'unknown resource' });
    try {
      const result = await pool.query(
        `SELECT column_name as name, data_type as type, is_nullable = 'NO' as notnull,
                CASE WHEN column_name = 'id' THEN true ELSE false END as pk
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return Object.keys(colMap);
}
