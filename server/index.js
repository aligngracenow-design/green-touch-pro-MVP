import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import db, { initSchema, seed } from './db.js';
import { llmEnabled, llmStatus, buildContext, llmChat, ruleBasedRespond } from './llm.js';
import { startPolling } from './telegram-router.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Process-level error handlers (prevent crashes from unhandled errors)
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

try {
  initSchema();
  console.log('Schema initialized.');
} catch (e) {
  console.error('Schema init error (non-fatal):', e.message);
}

let seedResult = { seeded: false };
try {
  seedResult = seed();
  console.log('DB ready.', seedResult.seeded ? 'Seeded fresh data.' : 'Existing data found.');
} catch (e) {
  console.error('Seed error (non-fatal):', e.message);
  console.log('DB ready. Continuing with existing data.');
}

app.use(cors({ origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS, credentials: true }));
app.use(express.json());

// ─── Auth helpers ──────────────────────────────────────────────
function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'owner only' });
  next();
}

// ─── Health ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Auth ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = sign(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,email,name,role,company FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// ─── Dashboard ─────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects').all();
  const invoices = db.prepare('SELECT * FROM invoices').all();
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);
  const health = {};
  for (const p of projects) {
    const b = p.budget > 0 ? (1 - p.spent / p.budget) * 40 : 40;
    const score = Math.round(Math.min(b + (p.progress / 100) * 30 + 30, 100));
    health[p.id] = { score, budget_pct: p.budget ? +(p.spent / p.budget * 100).toFixed(1) : 0 };
  }
  res.json({
    projects: {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      completed: projects.filter(p => p.status === 'completed').length,
      planning: projects.filter(p => p.status === 'planning').length,
    },
    financial: {
      total_budget: totalBudget, total_spent: totalSpent,
      paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
      pending: invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0),
      budget_util: totalBudget ? +(totalSpent / totalBudget * 100).toFixed(1) : 0,
    },
    health_scores: health,
    stats: {
      notifications: db.prepare('SELECT COUNT(*) c FROM notifications').get().c,
      ai_chats: db.prepare('SELECT COUNT(*) c FROM ai_chat').get().c,
      invoices: invoices.length,
    },
  });
});

// ─── Projects ──────────────────────────────────────────────────
function hydrateProject(p) {
  const safeQuery = (sql, ...params) => {
    try { return db.prepare(sql).all(...params); } catch { return []; }
  };
  return {
    ...p,
    budget_pct: p.budget ? +(p.spent / p.budget * 100).toFixed(1) : 0,
    remaining: p.budget - p.spent,
    daily_logs: safeQuery('SELECT * FROM daily_logs WHERE project_id = ? ORDER BY date DESC', p.id),
    documents: safeQuery('SELECT * FROM documents WHERE project_id = ?', p.id),
    subs: safeQuery('SELECT * FROM subs WHERE project_id = ?', p.id),
    invoices: safeQuery('SELECT * FROM invoices WHERE project_id = ?', p.id),
    todos: safeQuery('SELECT * FROM todos WHERE project_id = ? ORDER BY priority', p.id),
  };
}

app.get('/api/projects', auth, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY progress DESC').all();
  res.json(projects.map(hydrateProject));
});

app.get('/api/projects/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(hydrateProject(p));
});

app.post('/api/projects', auth, (req, res) => {
  const b = req.body || {};
  const id = 'GTB-' + new Date().getFullYear() + '-' + nanoid(4).toUpperCase();
  db.prepare(`INSERT INTO projects (id,name,client,status,sqft,budget,spent,start,completion,progress,phase,health,address,permit)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, b.name || 'New Project', b.client || '', b.status || 'planning', b.sqft || 0,
    b.budget || 0, b.spent || 0, b.start || '', b.completion || '', b.progress || 0,
    b.phase || 'Preconstruction', b.health || 'good', b.address || '', b.permit || ''
  );
  res.json(hydrateProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)));
});

app.patch('/api/projects/:id', auth, (req, res) => {
  const allowed = ['name','client','status','sqft','budget','spent','start','completion','progress','phase','health','address','permit'];
  const updates = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
  if (updates.length) {
    const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE projects SET ${setClause} WHERE id = ?`).run(...updates.map(([, v]) => v), req.params.id);
  }
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(hydrateProject(p));
});

app.delete('/api/projects/:id', auth, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Daily logs ────────────────────────────────────────────────
app.post('/api/projects/:id/logs', auth, (req, res) => {
  const b = req.body || {};
  const id = nanoid(8);
  db.prepare(`INSERT INTO daily_logs (id,project_id,date,text,photos,submitted_by,category) VALUES (?,?,date('now'),?,?,?,?)`)
    .run(id, req.params.id, b.text || '', b.photos || 0, b.submitted_by || req.user.name, b.category || 'general');
  res.json(db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(id));
});

// ─── Todos ─────────────────────────────────────────────────────
app.post('/api/projects/:id/todos', auth, (req, res) => {
  const b = req.body || {};
  const id = 'TODO-' + nanoid(6);
  db.prepare(`INSERT INTO todos (id,project_id,task,assignee,priority,status,due_date) VALUES (?,?,?,?,?,?,?)`)
    .run(id, req.params.id, b.task || '', b.assignee || '', b.priority || 'med', 'open', b.due_date || '');
  res.json(db.prepare('SELECT * FROM todos WHERE id = ?').get(id));
});

app.post('/api/todos/:id/toggle', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const status = t.status === 'open' ? 'done' : 'open';
  db.prepare('UPDATE todos SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: req.params.id, status });
});

app.delete('/api/todos/:id', auth, (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Invoices ──────────────────────────────────────────────────
app.get('/api/invoices', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all());
});

app.post('/api/invoices', auth, (req, res) => {
  const b = req.body || {};
  const id = 'INV-' + new Date().getFullYear() + '-' + nanoid(4).toUpperCase();
  db.prepare(`INSERT INTO invoices (id,project_id,amount,status,due_date,client_name,client_email,description)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    id, b.project_id || '', b.amount || 0, 'draft', b.due_date || '',
    b.client_name || '', b.client_email || '', b.description || ''
  );
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id));
});

app.post('/api/invoices/:id/send', auth, (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run('sent', req.params.id);
  db.prepare(`INSERT INTO notifications (id,project_id,channel,message) VALUES (?,?,?,?)`)
    .run(nanoid(8), inv.project_id, 'email', `📄 Invoice ${inv.id} for $${inv.amount.toLocaleString()} sent to ${inv.client_email}`);
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

app.post('/api/invoices/:id/pay', auth, (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE invoices SET status = 'paid', paid_date = date('now') WHERE id = ?`).run(req.params.id);
  const txnId = 'TXN-' + nanoid(6).toUpperCase();
  db.prepare(`INSERT INTO transactions (id,invoice_id,amount,method,status,date,client_email) VALUES (?,?,?,?,?,date('now'),?)`)
    .run(txnId, inv.id, inv.amount, 'stripe', 'completed', inv.client_email);
  res.json({ ...db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id), txn_id: txnId });
});

// ─── AI assistant (real LLM when configured, rule-based fallback) ─────────
app.get('/api/ai/status', auth, (req, res) => {
  res.json(llmStatus());
});

app.post('/api/ai/ask', auth, async (req, res) => {
  const { question, project_id, history } = req.body || {};
  const project = project_id ? db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id) : null;
  const id = nanoid(8);
  let answer;
  let provider;

  if (llmEnabled) {
    try {
      const context = buildContext(db, project_id);
      answer = await llmChat(question, context, Array.isArray(history) ? history : []);
      provider = llmStatus().provider;
    } catch (err) {
      console.error('LLM error, falling back to rules:', err.message);
      answer = ruleBasedRespond(question, project);
      provider = 'rule-based (LLM unavailable)';
    }
  } else {
    answer = ruleBasedRespond(question, project);
    provider = 'Green Touch AI';
  }

  db.prepare(`INSERT INTO ai_chat (id,project_id,question,answer) VALUES (?,?,?,?)`).run(id, project_id || '', question || '', answer);
  res.json({ id, answer, provider });
});

app.get('/api/ai/history', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM ai_chat ORDER BY created_at DESC LIMIT 30').all());
});

// Meeting transcript → structured summary + action items
app.post('/api/ai/meeting', auth, async (req, res) => {
  const { transcript } = req.body || {};
  if (!transcript || !transcript.trim()) return res.status(400).json({ error: 'empty transcript' });

  if (llmEnabled) {
    try {
      const prompt = `You are a construction project assistant. Below is a raw meeting transcript. Produce a clean, structured summary in markdown with exactly these sections:\n\n## Summary\n(2-3 sentences)\n\n## Decisions\n(bullet list; "None recorded" if none)\n\n## Action Items\n(bullet list as "- [Owner] task — due date if mentioned"; "None recorded" if none)\n\n## Risks / Follow-ups\n(bullet list; "None recorded" if none)\n\nTRANSCRIPT:\n${transcript}`;
      const summary = await llmChat(prompt, 'You convert messy meeting transcripts into crisp, actionable construction meeting notes.', []);
      return res.json({ summary, provider: llmStatus().provider });
    } catch (err) {
      console.error('Meeting LLM error:', err.message);
    }
  }
  // Fallback: simple heuristic extraction
  const lines = transcript.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const actions = lines.filter((l) => /\b(need to|will|should|must|action|follow up|schedule|order|send|call|submit)\b/i.test(l));
  const summary = `## Summary\n${lines.slice(0, 2).join('. ')}.\n\n## Decisions\nNone recorded\n\n## Action Items\n${actions.length ? actions.map((a) => `- ${a}`).join('\n') : 'None recorded'}\n\n## Risks / Follow-ups\nNone recorded`;
  res.json({ summary, provider: 'rule-based' });
});

// ─── Communications ────────────────────────────────────────────
app.post('/api/notify', auth, (req, res) => {
  const b = req.body || {};
  const channels = Array.isArray(b.channels) ? b.channels : [b.channel || 'telegram'];
  const sent = [];
  for (const ch of channels) {
    const id = nanoid(8);
    db.prepare(`INSERT INTO notifications (id,project_id,channel,message) VALUES (?,?,?,?)`)
      .run(id, b.project_id || 'ALL', ch, b.message || '');
    sent.push({ id, channel: ch });
  }
  res.json({ status: 'sent', sent });
});

app.get('/api/notifications', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications ORDER BY sent_at DESC LIMIT 50').all());
});

// ─── Settings / users ──────────────────────────────────────────
app.get('/api/users', auth, ownerOnly, (req, res) => {
  res.json(db.prepare('SELECT id,email,name,role,company FROM users').all());
});

app.patch('/api/users/:id/role', auth, ownerOnly, (req, res) => {
  const { role } = req.body || {};
  if (!['owner','exec','foreman','sub'].includes(role)) {
    return res.status(400).json({ error: 'invalid role — use owner|exec|foreman|sub' });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json(db.prepare('SELECT id,email,name,role,company FROM users WHERE id = ?').get(req.params.id));
});

app.get('/api/stats', auth, (req, res) => {
  const tables = ['projects','invoices','daily_logs','documents','notifications','ai_chat','transactions','subs','todos','users'];
  const stats = {};
  for (const t of tables) stats[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  res.json(stats);
});

// ─── Shared Construction Data (Postgres via Supabase) ──────
import pg from 'pg';
const supabasePool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});
// Test connection at startup
supabasePool.query('SELECT 1').then(() => console.log('📦 Supabase Postgres connected')).catch(e => console.error('Supabase connection error:', e.message));

// Convenience: run a query against the shared DB
async function hdb(sql, params = []) {
  const r = await supabasePool.query(sql, params);
  return r.rows;
}
async function hdbOne(sql, params = []) {
  const r = await supabasePool.query(sql, params);
  return r.rows[0] || null;
}

app.get('/api/cos', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM change_orders WHERE project LIKE $1 ORDER BY created_at DESC', [`%${project}%`])
      : await hdb('SELECT * FROM change_orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inspections', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM inspections WHERE project LIKE $1 ORDER BY scheduled_date ASC', [`%${project}%`])
      : await hdb('SELECT * FROM inspections ORDER BY scheduled_date ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/permits', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM permits WHERE project LIKE $1 ORDER BY expiration_date ASC', [`%${project}%`])
      : await hdb('SELECT * FROM permits ORDER BY expiration_date ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/liens', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM lien_releases WHERE project LIKE $1 ORDER BY created_at DESC', [`%${project}%`])
      : await hdb('SELECT * FROM lien_releases ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/photos', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM project_photos WHERE project LIKE $1 ORDER BY created_at DESC LIMIT 50', [`%${project}%`])
      : await hdb('SELECT * FROM project_photos ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/crew', auth, async (req, res) => {
  try {
    const rows = await hdb('SELECT * FROM time_entries WHERE clock_in::date = CURRENT_DATE ORDER BY clock_in DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INTERACTIVE WRITE ENDPOINTS (shared hermes.db — mirrors the bot) ──
// These let Graham manage everything from the web app, not just the bot.
const hid = (p) => `${p}_${nanoid(10)}`;

// Change Orders — create + approve/reject
app.post('/api/cos', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.project || !b.description) return res.status(400).json({ error: 'project and description required' });
    const id = hid('co');
    await hdb(`INSERT INTO change_orders (id, project, description, cost, requested_by, status, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [id, b.project, b.description, Number(b.cost) || 0, b.requested_by || req.user?.email || 'Dashboard', b.status || 'pending']);
    res.json(await hdbOne('SELECT * FROM change_orders WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/cos/:id', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const co = await hdbOne('SELECT * FROM change_orders WHERE id = $1', [req.params.id]);
    if (!co) return res.status(404).json({ error: 'not found' });
    const status = b.status || co.status;
    await hdb(`UPDATE change_orders SET status=$1, approved_by=$2, description=$3, cost=$4 WHERE id=$5`,
      [status, b.approved_by || (status === 'approved' ? (req.user?.email || 'Dashboard') : co.approved_by),
       b.description || co.description, b.cost != null ? Number(b.cost) : co.cost, req.params.id]);
    res.json(await hdbOne('SELECT * FROM change_orders WHERE id = $1', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Punch List — create + toggle done
app.get('/api/punch', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM punchlist WHERE project LIKE $1 ORDER BY created_at DESC', [`%${project}%`])
      : await hdb('SELECT * FROM punchlist ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/punch', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const item = b.item || b.description;
    if (!b.project || !item) return res.status(400).json({ error: 'project and item required' });
    const id = hid('pl');
    await hdb(`INSERT INTO punchlist (id, project, location, item, assignee, status, priority, created_by, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [id, b.project, b.location || '', item, b.assignee || '', 'open', b.priority || 'medium', req.user?.email || 'Dashboard']);
    res.json(await hdbOne('SELECT * FROM punchlist WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/punch/:id/toggle', auth, async (req, res) => {
  try {
    const t = await hdbOne('SELECT * FROM punchlist WHERE id = $1', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'not found' });
    const status = t.status === 'open' ? 'done' : 'open';
    await hdb('UPDATE punchlist SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ id: req.params.id, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inspections — schedule + update result
app.post('/api/inspections', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.project || !b.type) return res.status(400).json({ error: 'project and type required' });
    const id = hid('insp');
    await hdb(`INSERT INTO inspections (id, project, type, inspector, scheduled_date, status, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [id, b.project, b.type, b.inspector || '', b.scheduled_date || '', b.status || 'scheduled']);
    res.json(await hdbOne('SELECT * FROM inspections WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/inspections/:id', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const row = await hdbOne('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    await hdb(`UPDATE inspections SET status=$1, scheduled_date=$2, inspector=$3 WHERE id=$4`,
      [b.status || row.status, b.scheduled_date || row.scheduled_date, b.inspector || row.inspector, req.params.id]);
    res.json(await hdbOne('SELECT * FROM inspections WHERE id = $1', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Assignments (tasks) — read + create + complete
app.get('/api/assignments', auth, async (req, res) => {
  try {
    const { project } = req.query;
    const rows = project
      ? await hdb('SELECT * FROM assignments WHERE project LIKE $1 ORDER BY created_at DESC', [`%${project}%`])
      : await hdb('SELECT * FROM assignments ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assignments', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.task) return res.status(400).json({ error: 'task required' });
    const id = hid('h');
    await hdb(`INSERT INTO assignments (id, project, task, assignee, assigned_by, status, due_date, notes, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [id, b.project || 'General', b.task, b.assignee || 'Unassigned',
       req.user?.email || 'Dashboard', 'assigned', b.due_date || null, b.notes || '']);
    res.json(await hdbOne('SELECT * FROM assignments WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assignments/:id/complete', auth, async (req, res) => {
  try {
    const t = await hdbOne('SELECT * FROM assignments WHERE id = $1', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'not found' });
    const status = t.status === 'completed' ? 'assigned' : 'completed';
    await hdb('UPDATE assignments SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ id: req.params.id, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Permits — create
app.post('/api/permits', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.project || !b.type) return res.status(400).json({ error: 'project and type required' });
    const id = hid('prm');
    await hdb(`INSERT INTO permits (id, project, type, jurisdiction, permit_number, status, issued_date, expiration_date, fee, notes, created_by, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [id, b.project, b.type, b.jurisdiction || b.issuing_authority || '', b.permit_number || '',
       b.status || 'active', b.issued_date || '', b.expiration_date || '', Number(b.fee) || 0, b.notes || '', req.user?.email || 'Dashboard']);
    res.json(await hdbOne('SELECT * FROM permits WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Generic resource layer (full bot parity) ────────────────────
import { registerResourceRoutes } from './resources.js';
let managedTables = [];
registerResourceRoutes(app, supabasePool, auth).then(tables => {
  managedTables = tables;
  console.log(`📋 Resource API live for ${managedTables.length} bot domains: ${managedTables.join(', ')}`);
});

// ─── Specialized bot actions (state transitions the bot performs) ──
const nowISO = () => new Date().toISOString();

// Instead of SQLite PRAGMA, use information_schema
async function hasTable(t) {
  try { const r = await supabasePool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]); return r.rows.length > 0; } catch { return false; }
}
async function cols(t) {
  try { const r = await supabasePool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t]); return r.rows.map(c => c.column_name); } catch { return []; }
}

// Crew clock in / out  (bot: /clockin /clockout /onsite)
app.post('/api/crew/clockin', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.worker && !b.name) return res.status(400).json({ error: 'worker required' });
    const id = `te_${nanoid(10)}`;
    const c = await cols('time_entries');
    const worker = b.worker || b.name || b.worker_name;
    const data = { id };
    if (c.includes('worker_name')) data.worker_name = worker;
    if (c.includes('worker')) data.worker = worker;
    if (c.includes('name')) data.name = worker;
    if (c.includes('trade')) data.trade = b.trade || '';
    if (c.includes('project')) data.project = b.project || 'General';
    if (c.includes('clock_in')) data.clock_in = nowISO();
    if (c.includes('created_at')) data.created_at = nowISO();
    if (c.includes('status')) data.status = 'on_site';
    const keys = Object.keys(data);
    const sql = `INSERT INTO time_entries (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`;
    await hdb(sql, keys.map(k=>data[k]));
    res.json(await hdbOne('SELECT * FROM time_entries WHERE id = $1', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/crew/:id/clockout', auth, async (req, res) => {
  try {
    const row = await hdbOne('SELECT * FROM time_entries WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    const c = await cols('time_entries');
    if (c.includes('clock_out')) await hdb('UPDATE time_entries SET clock_out = $1 WHERE id = $2', [nowISO(), req.params.id]);
    if (c.includes('status')) await hdb('UPDATE time_entries SET status = $1 WHERE id = $2', ['clocked_out', req.params.id]);
    res.json(await hdbOne('SELECT * FROM time_entries WHERE id = $1', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generic status-transition action
app.post('/api/action/:table/:id', auth, async (req, res) => {
  const allowed = ['rfis','submittals','blockers','lien_releases','permits','change_orders','deliveries','inspections'];
  const { table, id } = req.params;
  if (!allowed.includes(table)) return res.status(404).json({ error: 'unknown action target' });
  try {
    const c = await cols(table);
    const row = await hdbOne(`SELECT * FROM "${table}" WHERE id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const sets = [], args = [];
    let pi = 1;
    if (b.status && c.includes('status')) { sets.push(`status = $${pi++}`); args.push(b.status); }
    const who = b.by || req.user?.email || 'Dashboard';
    for (const col of ['resolved_by','approved_by','signed_by','closed_by','answered_by']) {
      if (c.includes(col)) { sets.push(`${col} = $${pi++}`); args.push(who); break; }
    }
    for (const col of ['resolved_at','approved_at','signed_at','closed_at','answered_at','updated_at']) {
      if (c.includes(col)) { sets.push(`${col} = $${pi++}`); args.push(nowISO()); break; }
    }
    if (b.response && c.includes('response')) { sets.push(`response = $${pi++}`); args.push(b.response); }
    if (b.notes && c.includes('notes')) { sets.push(`notes = $${pi++}`); args.push(b.notes); }
    if (!sets.length) return res.json(row);
    await hdb(`UPDATE "${table}" SET ${sets.join(', ')} WHERE id = $${pi}`, [...args, id]);
    res.json(await hdbOne(`SELECT * FROM "${table}" WHERE id = $1`, [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Serve built frontend (single-container/Docker deploy) ─────
import compression from 'compression';
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'dist');
if (fs.existsSync(PUBLIC_DIR)) {
  // Gzip/brotli compression for text assets
  app.use(compression());

  // Immutable cache for content-hashed assets (fingerprinted JS/CSS/images)
  app.use('/assets', (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  }, express.static(path.join(PUBLIC_DIR, 'assets')));

  // Other static files (favicon, manifest, etc.) — 1 day cache
  app.use(express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        // No cache for HTML — always fresh
        res.setHeader('Cache-Control', 'no-cache');
      } else if (!filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    }
  }));

  // SPA fallback — non-API routes return index.html
  app.get(/^(?!\/api).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
  }

  // Catch-all error handler (prevents crashes from async errors)
  app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.listen(PORT, () => {
  console.log(`🏗️  Green Touch Pro API running on http://localhost:${PORT}`);
  // Start Hermes Telegram bot polling (Agent 6)
  if (process.env.TELEGRAM_TOKEN) {
    startPolling().catch(e => console.error('Hermes polling failed:', e.message));
  }
});
