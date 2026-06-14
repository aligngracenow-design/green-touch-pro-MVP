import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import db, { initSchema, seed } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

initSchema();
const seedResult = seed();
console.log('DB ready.', seedResult.seeded ? 'Seeded fresh data.' : 'Existing data found.');

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
  const leads = db.prepare('SELECT * FROM leads').all();
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
    leads: {
      total: leads.length,
      hot: leads.filter(l => l.status === 'hot').length,
      warm: leads.filter(l => l.status === 'warm').length,
      new: leads.filter(l => l.status === 'new').length,
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
  return {
    ...p,
    budget_pct: p.budget ? +(p.spent / p.budget * 100).toFixed(1) : 0,
    remaining: p.budget - p.spent,
    daily_logs: db.prepare('SELECT * FROM daily_logs WHERE project_id = ? ORDER BY date DESC').all(p.id),
    documents: db.prepare('SELECT * FROM documents WHERE project_id = ?').all(p.id),
    subs: db.prepare('SELECT * FROM subs WHERE project_id = ?').all(p.id),
    invoices: db.prepare('SELECT * FROM invoices WHERE project_id = ?').all(p.id),
    todos: db.prepare('SELECT * FROM todos WHERE project_id = ? ORDER BY priority').all(p.id),
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

// ─── Leads ─────────────────────────────────────────────────────
app.get('/api/leads', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM leads ORDER BY date DESC').all());
});

// Public lead capture (no auth) — for website forms
app.post('/api/leads', (req, res) => {
  const b = req.body || {};
  const id = 'LD-' + nanoid(6).toUpperCase();
  db.prepare(`INSERT INTO leads (id,name,company,phone,email,project_desc,sqft,status,date,notes,source)
    VALUES (?,?,?,?,?,?,?,?,date('now'),?,?)`).run(
    id, b.name || '', b.company || '', b.phone || '', b.email || '',
    b.project_desc || b.project || '', b.sqft || 0, 'new', b.notes || '', b.source || 'website'
  );
  db.prepare(`INSERT INTO notifications (id,project_id,channel,message) VALUES (?,?,?,?)`)
    .run(nanoid(8), 'ALL', 'telegram', `🆕 New lead: ${b.name || 'Unknown'} from ${b.company || 'N/A'}`);
  res.json({ id, status: 'captured' });
});

app.patch('/api/leads/:id', auth, (req, res) => {
  const allowed = ['name','company','phone','email','project_desc','sqft','status','notes','source'];
  const updates = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
  if (updates.length) {
    const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE leads SET ${setClause} WHERE id = ?`).run(...updates.map(([, v]) => v), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
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

// ─── AI assistant (rule-based, no external key needed) ─────────
function aiRespond(question, project) {
  const q = (question || '').toLowerCase();
  const ctx = project ? `For ${project.name} (${project.phase}, ${project.progress}% complete, $${project.spent.toLocaleString()}/$${project.budget.toLocaleString()} spent): ` : '';
  if (q.includes('budget') || q.includes('cost') || q.includes('over'))
    return `${ctx}Budget utilization is tracking within plan. ${project ? `Remaining budget is $${(project.budget - project.spent).toLocaleString()} (${(100 - project.spent / project.budget * 100).toFixed(0)}% headroom).` : 'Across all active projects, you have healthy margin. Watch Alloy Personal Training — it is flagged for schedule review.'}`;
  if (q.includes('risk') || q.includes('concern') || q.includes('delay'))
    return `${ctx}Top risks: (1) Alloy Personal Training framing approval is pending with the county — submit revised plans before 6/20 to avoid a 2-week slip. (2) Long-lead items (custom bar stools, float tanks) should be ordered now. (3) Keep an eye on inspection scheduling for Black Squirrel.`;
  if (q.includes('schedule') || q.includes('timeline') || q.includes('when'))
    return `${ctx}Black Squirrel is on track for 7/15 completion. Pure Sweat targets 8/1. Alloy is the at-risk project — current trajectory pushes completion if framing approval slips.`;
  if (q.includes('lead') || q.includes('sales') || q.includes('pipeline'))
    return `You have 1 hot lead (Cyxtera — data center reno, 8,000 sqft), 2 warm (Bloom Yoga, CorePower Yoga) and 2 new. Priority follow-up: Cyxtera RFP and Wilson Dental site visit (referred by M&T Bank).`;
  return `${ctx}Here's a summary: 3 active projects, 1 completed, 1 in preconstruction. $1.56M total budget under management. Ask me about budget, risks, schedule, or your sales pipeline for specifics.`;
}

app.post('/api/ai/ask', auth, (req, res) => {
  const { question, project_id } = req.body || {};
  const project = project_id ? db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id) : null;
  const answer = aiRespond(question, project);
  const id = nanoid(8);
  db.prepare(`INSERT INTO ai_chat (id,project_id,question,answer) VALUES (?,?,?,?)`).run(id, project_id || '', question || '', answer);
  res.json({ id, answer, provider: 'Green Touch AI' });
});

app.get('/api/ai/history', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM ai_chat ORDER BY created_at DESC LIMIT 30').all());
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

app.get('/api/stats', auth, (req, res) => {
  const tables = ['projects','leads','invoices','daily_logs','documents','notifications','ai_chat','transactions','subs','todos','users'];
  const stats = {};
  for (const t of tables) stats[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  res.json(stats);
});

// ─── Serve built frontend (single-container/Docker deploy) ─────
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // SPA fallback — non-API routes return index.html
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`🏗️  Green Touch Pro API running on http://localhost:${PORT}`));
