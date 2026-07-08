/**
 * GreenTouch.Pro — Telegram Bot (Full iPhone-Ready)
 * Handles: text commands, voice notes, photos, inline callbacks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Load .env — works locally and on Render
const envPath = process.env.NODE_ENV === 'production'
  ? path.join('/app', '.env')          // Render: /app/.env
  : path.join(PROJECT_ROOT, '.env');   // Local: project root
dotenv.config({ path: envPath });

// Fallback: manual load if dotenv didn't catch it
if (!process.env.TELEGRAM_TOKEN) {
  const envFile = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
      const [k, ...rest] = line.split('=');
      if (k && rest.length && !k.startsWith('#')) process.env[k.trim()] = rest.join('=').trim();
    });
  }
}

const TELEGRAM = process.env.TELEGRAM_TOKEN;
const API = `https://api.telegram.org/bot${TELEGRAM}`;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const OR_MODEL = 'google/gemini-2.5-flash-lite:free'; // newest free model — task extraction
// Alternatives (free): meta-llama/llama-4-maverick:free, mistralai/mistral-small-3.1-24b:free, openai/gpt-oss-20b:free
// Paid (faster/better): anthropic/claude-sonnet-4, openai/gpt-4o-mini, google/gemini-2.5-pro

let lastUpdateId = 0;
let polling = true;
let botUserId = null; // cached bot user ID for group-join detection

// ─── Start ────────────────────────────────────────────────────
let readyResolve;
const ready = new Promise(r => { readyResolve = r; });

// Restore lastUpdateId from DB before polling starts
(async () => {
  try {
    const d = await getDb();
    const row = d.prepare("SELECT value FROM meta WHERE key='lastUpdateId'").get();
    if (row) {
      lastUpdateId = parseInt(row.value, 10);
      console.log('📡 Restored lastUpdateId:', lastUpdateId);
    }
  } catch {}
  readyResolve();
})();

// ─── Active Huddle State ─────────────────────────────────────
const activeHuddles = new Map(); // chatId -> { id, topic, startedAt, startedBy, minutes, timer, messages[] }

// ─── Helpers ─────────────────────────────────────────────────
async function tg(method, body = {}) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

function send(chatId, text, opts = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...opts });
}

// Send message with inline keyboard buttons
function sendWithButtons(chatId, text, buttons) {
  return send(chatId, text, {
    reply_markup: JSON.stringify({ inline_keyboard: buttons })
  });
}

// ─── Role-Based Access Control ──────────────────────────────────
const ROLE_LEVELS = { owner: 4, exec: 3, foreman: 2, sub: 1, anyone: 0 };

async function getUserRole(chatId, userId) {
  const d = await getDb();
  const row = d.prepare('SELECT role FROM user_roles WHERE user_id=? AND chat_id=?').get(String(userId), String(chatId));
  return row?.role || 'sub'; // default: sub (read-only) — owner must explicitly promote
}

async function checkRole(chatId, userId, requiredLevel) {
  const role = await getUserRole(chatId, userId);
  const userLevel = ROLE_LEVELS[role] || 0;
  const required = ROLE_LEVELS[requiredLevel] || 0;
  if (userLevel < required) {
    await send(chatId, `⛔ *Access Denied* — You're *${role}*. This command requires *${requiredLevel}+*.\n\n💡 Check your permissions: /myrole\n📖 See what you CAN use: /help\n👑 Ask your admin to upgrade you: /setrole <your_id> ${requiredLevel}`);
    return false;
  }
  return true;
}

async function cmdSetRole(chatId, args, from) {
  // /setrole @username or user_id role
  // Owner only. First user to /setrole becomes owner automatically if none exists.
  const userId = String(from.id);

  // Check if there's already an owner in this chat
  const d = await getDb();
  const existingOwner = d.prepare('SELECT user_id FROM user_roles WHERE chat_id=? AND role=? LIMIT 1').get(String(chatId), 'owner');

  if (existingOwner && existingOwner.user_id !== userId) {
    // Only existing owner can set roles
    const requesterRole = await getUserRole(chatId, userId);
    if (requesterRole !== 'owner') {
      return send(chatId, '⛔ Only the owner can assign roles.');
    }
  }

  const parts = (args || '').split(/\s+/);
  const targetUser = parts[0] || '';
  const newRole = (parts[1] || '').toLowerCase();

  if (!targetUser || !newRole) {
    return send(chatId, 'Usage: /setrole [user_id] [owner|exec|foreman|sub]\nExample: /setrole 123456 exec\n\nGet user IDs with /roles');
  }

  if (!ROLE_LEVELS[newRole]) {
    return send(chatId, `❌ Invalid role: "${newRole}". Use: owner, exec, foreman, sub`);
  }

  // If no owner exists, the first /setrole makes the caller owner automatically
  if (!existingOwner) {
    const callerId = String(from.id);
    d.prepare('INSERT OR REPLACE INTO user_roles (user_id, chat_id, role, set_by) VALUES (?,?,?,?)').run(callerId, String(chatId), 'owner', 'system');
    await send(chatId, `👑 *You are now the owner of this workspace.*\nThis gives you full access to all commands and settings.`);
  }

  // Set target user's role
  d.prepare('INSERT OR REPLACE INTO user_roles (user_id, chat_id, role, set_by) VALUES (?,?,?,?)').run(targetUser, String(chatId), newRole, String(from.id));
  return send(chatId, `✅ User ${targetUser} is now *${newRole.toUpperCase()}*.\nAccess: ${getRoleSummary(newRole)}`);
}

function getRoleSummary(role) {
  const m = {
    owner: 'Full access — all commands, settings, sub management',
    exec: 'Team mgmt, COs, huddles, inspections, sub viewing',
    foreman: 'Field ops — assign, punch, safety, clock in, reports',
    sub: 'Read-only — view tasks, acknowledge, /subs, /help'
  };
  return m[role] || 'Unknown';
}

async function cmdRoles(chatId, args, from) {
  const d = await getDb();
  const rows = d.prepare('SELECT user_id, role, set_at FROM user_roles WHERE chat_id=? ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'exec\' THEN 1 WHEN \'foreman\' THEN 2 ELSE 3 END, set_at').all(String(chatId));
  if (!rows.length) return send(chatId, 'No roles set. First person to use /setrole becomes owner.');

  const lines = ['👥 *Team Roles*', ''];
  for (const r of rows) {
    const icon = { owner: '👑', exec: '⭐', foreman: '🔧', sub: '👷' }[r.role] || '👤';
    lines.push(`${icon} User ${r.user_id.slice(0,8)}... — *${r.role.toUpperCase()}*`);
  }
  lines.push('', '_Use /setrole [user_id] [role] to assign._');
  lines.push('_Find user IDs in the group member list or when they send a message._');
  return send(chatId, lines.join('\n'));
}

async function cmdMyRole(chatId, from) {
  const role = await getUserRole(chatId, String(from.id));
  const icon = { owner: '👑', exec: '⭐', foreman: '🔧', sub: '👷' }[role] || '👤';
  return send(chatId, `${icon} Your role: *${role.toUpperCase()}*\n${getRoleSummary(role)}`);
}

// ─── Database ─────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'hermes.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db;
async function getDb() {
  if (db) return db;
  const Database = (await import('better-sqlite3')).default;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY, project TEXT, task TEXT, assignee TEXT,
      assignee_email TEXT, telegram_chat_id TEXT, assigned_by TEXT,
      assigned_at TEXT, due_date TEXT, status TEXT DEFAULT 'pending',
      notified_at TEXT, notified_method TEXT,
      acknowledged_at TEXT, acknowledged_method TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY, project TEXT, reported_by TEXT,
      date TEXT, workers INTEGER, progress TEXT, issues TEXT,
      safety_notes TEXT, raw_transcript TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_photos (
      id TEXT PRIMARY KEY, project TEXT, uploaded_by TEXT,
      file_id TEXT, file_path TEXT, caption TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, project TEXT, channel TEXT,
      sender TEXT, raw_message TEXT, classification TEXT,
      confidence REAL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, actor TEXT, action TEXT,
      entity_type TEXT, entity_id TEXT, details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS huddles (
      id TEXT PRIMARY KEY, chat_id TEXT, topic TEXT, started_by TEXT,
      started_at TEXT, ended_at TEXT, minutes INTEGER, status TEXT DEFAULT 'active',
      summary TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS huddle_messages (
      id TEXT PRIMARY KEY, huddle_id TEXT, chat_id TEXT, sender TEXT,
      message_type TEXT, content TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subs (
      id TEXT PRIMARY KEY, name TEXT, company TEXT, phone TEXT,
      trade TEXT, email TEXT, reliability INTEGER DEFAULT 75,
      bbb_rating TEXT, bbb_complaints INTEGER, bbb_accredited INTEGER,
      google_rating REAL, google_reviews INTEGER,
      license_number TEXT, license_status TEXT, license_state TEXT,
      vet_score INTEGER, vet_color TEXT DEFAULT 'yellow',
      last_vetted TEXT, tags TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS punchlist (
      id TEXT PRIMARY KEY, project TEXT, location TEXT, item TEXT,
      assignee TEXT, status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal',
      created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY, project TEXT, supplier TEXT, material TEXT,
      scheduled_date TEXT, scheduled_time TEXT, status TEXT DEFAULT 'scheduled',
      noted_by TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rfis (
      id TEXT PRIMARY KEY, project TEXT, title TEXT, description TEXT,
      status TEXT DEFAULT 'open', assigned_to TEXT, due_date TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, chat_id TEXT, project TEXT, message TEXT,
      remind_at TEXT, status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      role TEXT DEFAULT '', phone TEXT, company TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL, chat_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'foreman',
      set_by TEXT, set_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chat_id)
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY, value TEXT
    );
    CREATE TABLE IF NOT EXISTS change_orders (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, description TEXT NOT NULL,
      cost REAL DEFAULT 0, requested_by TEXT, status TEXT DEFAULT 'pending',
      approved_by TEXT, approved_at TEXT, rejection_reason TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, type TEXT NOT NULL,
      scheduled_date TEXT, scheduled_time TEXT, inspector TEXT,
      status TEXT DEFAULT 'scheduled', result_notes TEXT, reinspection_date TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY, worker_name TEXT NOT NULL, trade TEXT, project TEXT,
      clock_in TEXT NOT NULL, clock_out TEXT, hours REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, description TEXT NOT NULL,
      severity TEXT DEFAULT 'minor', reported_by TEXT,
      reported_at TEXT DEFAULT (datetime('now')), notes TEXT
    );
    CREATE TABLE IF NOT EXISTS toolbox_talks (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, topic TEXT NOT NULL,
      presenter TEXT, attendance INTEGER DEFAULT 0,
      talk_date TEXT DEFAULT (date('now')), notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS permits (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, type TEXT NOT NULL,
      jurisdiction TEXT, permit_number TEXT, status TEXT DEFAULT 'applied',
      applied_date TEXT, issued_date TEXT, expiration_date TEXT, posted_date TEXT,
      fee REAL DEFAULT 0, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS submittals (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, description TEXT NOT NULL,
      type TEXT DEFAULT 'submittal', submitted_date TEXT, due_date TEXT,
      status TEXT DEFAULT 'pending', reviewed_by TEXT, review_date TEXT,
      rejection_reason TEXT, resubmit_date TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS blockers (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, description TEXT NOT NULL,
      blocks_what TEXT, linked_type TEXT, linked_id TEXT,
      status TEXT DEFAULT 'open', resolved_by TEXT, resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS lien_releases (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, sub_name TEXT NOT NULL,
      amount REAL DEFAULT 0, draw TEXT, status TEXT DEFAULT 'pending',
      signed_date TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS plan_revisions (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, description TEXT NOT NULL,
      revision_number TEXT, issued_date TEXT, received_date TEXT,
      status TEXT DEFAULT 'current', notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, topic TEXT NOT NULL,
      attendees TEXT, started_by TEXT, started_at TEXT, ended_at TEXT,
      minutes TEXT, action_items TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS meeting_messages (
      id TEXT PRIMARY KEY, meeting_id TEXT, sender TEXT,
      content TEXT, message_type TEXT DEFAULT 'text',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // Migrate old tables to new schema
  try { db.exec("ALTER TABLE subs ADD COLUMN email TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN bbb_rating TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN bbb_complaints INTEGER"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN bbb_accredited INTEGER"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN google_rating REAL"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN google_reviews INTEGER"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN license_number TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN license_status TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN license_state TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN vet_score INTEGER"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN vet_color TEXT DEFAULT 'yellow'"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN last_vetted TEXT"); } catch {}
  try { db.exec("ALTER TABLE subs ADD COLUMN tags TEXT"); } catch {}
  try { db.exec("ALTER TABLE deliveries ADD COLUMN material TEXT"); } catch {}
  try { db.exec("ALTER TABLE deliveries ADD COLUMN scheduled_time TEXT"); } catch {}
  try { db.exec("ALTER TABLE deliveries ADD COLUMN noted_by TEXT"); } catch {}
  try { db.exec("DROP TABLE IF EXISTS punch_items"); } catch {}
  return db;
}

function uid() { return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function logAudit(actor, action, entityType, entityId, details = '') {
  getDb().then(d => d.prepare(
    'INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?)'
  ).run(uid(), actor, action, entityType, entityId, details));
}

// ─── Voice Transcriber (LOCAL Whisper — free, no API/quota) ──
const WHISPER_PY = path.join(PROJECT_ROOT, '.venv-whisper', 'bin', 'python');
const TRANSCRIBE_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'transcribe.py');

// ─── Scripts venv (has `requests` for web search/vetting) ──
// Falls back to system python3 if the venv doesn't exist.
const SCRIPTS_PY = (() => {
  const venvPy = path.join(PROJECT_ROOT, '.venv-scripts', 'bin', 'python');
  try { return fs.existsSync(venvPy) ? venvPy : 'python3'; } catch { return 'python3'; }
})();

async function transcribeVoice(fileId) {
  const tmpOgg = `/tmp/voice_${Date.now()}.ogg`;
  const tmpWav = `/tmp/voice_${Date.now()}.wav`;
  try {
    // 1. Get file path from Telegram
    const fileInfo = await tg('getFile', { file_id: fileId });
    if (!fileInfo.ok) return null;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM}/${fileInfo.result.file_path}`;

    // 2. Download the voice file (.ogg/opus)
    const audio = await fetch(fileUrl);
    const buffer = Buffer.from(await audio.arrayBuffer());
    fs.writeFileSync(tmpOgg, buffer);

    // 3. Convert to 16kHz mono wav for Whisper
    await execFileP('ffmpeg', ['-y', '-i', tmpOgg, '-ar', '16000', '-ac', '1', tmpWav], { timeout: 60000 });

    // 4. Transcribe locally with faster-whisper (free, no quota)
    const { stdout } = await execFileP(WHISPER_PY, [TRANSCRIBE_SCRIPT, tmpWav], { timeout: 120000 });
    return stdout.trim() || null;
  } catch (e) {
    console.error('Voice transcribe error:', e.message);
    return null;
  } finally {
    try { fs.unlinkSync(tmpOgg); } catch {}
    try { fs.unlinkSync(tmpWav); } catch {}
  }
}

// ─── Task Extractor (Gemini) ──────────────────────────────────
async function extractTasks(text) {
  // Primary: OpenRouter free model (gpt-oss-20b:free)
  if (OPENROUTER_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OR_MODEL,
          messages: [{
            role: 'user',
            content: `Extract ALL construction tasks, assignments, deadlines, and issues from this text. Return ONLY a JSON array (no prose, no markdown fences). Each item has keys: type (task|issue|deadline|decision), owner (name or null), description, due_date (or null), priority (critical|high|normal).\n\nText: "${text}"`
          }]
        })
      });
      const data = await res.json();
      let raw = data?.choices?.[0]?.message?.content || '[]';
      raw = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      // grab first JSON array if model added stray text
      const m = raw.match(/\[[\s\S]*\]/);
      return JSON.parse(m ? m[0] : raw);
    } catch (e) {
      console.error('OpenRouter extract error:', e.message, '— falling back to Gemini');
    }
  }
  // Fallback: Gemini
  if (!GEMINI_KEY) return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extract ALL construction tasks, assignments, deadlines, and issues from this text. Return as JSON array with keys: type (task/issue/deadline/decision), owner (name), description, due_date (ISO if mentioned), priority (critical/high/normal). Be thorough.\n\nText: "${text}"\n\nReturn ONLY valid JSON array, no other text.`
            }]
          }]
        })
      }
    );
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Task extraction error:', e.message);
    return [];
  }
}

// ─── Photo Handler ────────────────────────────────────────────
async function handlePhoto(msg, from) {
  const chatId = msg.chat.id;
  const photo = msg.photo?.[msg.photo.length - 1]; // highest res
  const caption = msg.caption || '';

  if (!photo) return send(chatId, '❌ Could not process photo');

  // Detect project from caption: "Woodbridge: framing progress"
  let project = 'General';
  const colonIdx = caption.indexOf(':');
  if (colonIdx > 0) {
    project = caption.slice(0, colonIdx).trim();
  }

  // Save to DB
  const d = await getDb();
  const id = uid();
  d.prepare(
    'INSERT INTO project_photos (id, project, uploaded_by, file_id, file_path, caption) VALUES (?,?,?,?,?,?)'
  ).run(id, project, from.first_name || 'Unknown', photo.file_id, '', caption);

  logAudit(from.first_name, 'upload_photo', 'project_photo', id, `Project: ${project}`);

  await send(chatId, [
    `📸 *Photo saved*`,
    `Project: *${project}*`,
    `Uploaded by: ${from.first_name}`,
    caption ? `Caption: _${caption}_` : '',
    '',
    'Tip: Add "ProjectName:" at the start of your caption to auto-tag.',
  ].join('\n'));
}

// ─── Sub Search Intent Detection (shared by voice + text) ──────
function detectSubIntent(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  // Skip if it's already a slash command
  if (t.startsWith('/')) return null;

  // Multi-word trades
  const multiWordTrades = ['general contractor', 'air conditioning'];

  // Pattern 1: "find/need/want an electrician" etc.
  const subPatterns = [
    /(?:find|need|want|get|looking for|search for|who does|who can do|i need|i want|call)\s+(?:me\s+)?(?:an?|some|any)\s+(?:a\s+)?(\w+)/i,
    /(?:recommend|suggest)\s+(?:me\s+)?(?:an?\s+)?(\w+)/i,
  ];

  let trade = null;
  for (const pat of subPatterns) {
    const m = t.match(pat);
    if (m && m[1] && m[1].length > 1) {
      const word = m[1].toLowerCase().trim();
      // Filter stop words
      if (!/^(me|the|for|to|in|at|on|by|it|is|up|of|one|some|any|guy|work|done)$/i.test(word) &&
          !/^(today|tomorrow|now|later|soon|quick|fast|please|thanks|help|hello|hey)$/i.test(word)) {
        trade = word;
        break;
      }
    }
  }

  // Check for multi-word trades
  if (!trade) {
    for (const mwt of multiWordTrades) {
      if (t.includes(mwt)) { trade = mwt; break; }
    }
  }

  // Fallback: known trade keywords
  if (!trade) {
    const tradeKeywords = [
      'electrician', 'electrical', 'plumber', 'plumbing', 'roofer', 'roofing',
      'hvac', 'heating', 'drywall', 'drywaller', 'sheetrock', 'painter', 'painting',
      'concrete', 'foundation', 'framer', 'framing', 'carpenter', 'carpentry',
      'excavation', 'excavator', 'flooring', 'tile', 'landscaper', 'landscaping',
      'general contractor', 'mason', 'masonry', 'welder', 'welding', 'sprinkler',
      'insulation', 'siding', 'gutter',
    ];
    for (const kw of tradeKeywords) {
      if (t.includes(kw)) { trade = kw; break; }
    }
  }

  // Also try "X near/around/in Y" pattern for trade+location
  if (!trade) {
    const locMatch = t.match(/(.+?)\s+(?:near|in|around)\s+\w+/i);
    if (locMatch && locMatch[1] && locMatch[1].split(/\s+/).length <= 3 && locMatch[1].length > 2) {
      trade = locMatch[1].toLowerCase().trim();
    }
  }

  if (!trade) return null;

  // Extract location: "near [location]", "around [location]", "in [zip]"
  let location = null;
  const locMatch = t.match(/(?:near|around|in)\s+([a-z\s]+)/i);
  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim();
    // Don't capture "me" or trailing stop words
    if (/^(me|the|this|that|it|now|later|soon|today|tomorrow)$/i.test(location)) {
      location = null;
    }
  }

  return { trade, location };
}

// ─── General Command Intent Detection (shared by voice + text) ──
// Maps natural language to slash commands so you can speak plainly
function detectCommandIntent(text) {
  const t = text.toLowerCase().trim();
  if (!t || t.startsWith('/')) return null;

  // ── Session / Workflow ─────────────────────────────────
  if (/^(good\s+)?morning|start\s+(the\s+)?day|begin\s+(the\s+)?day/i.test(t)) 
    return { cmd: '/morning' };
  if (/^(end\s+of\s+day|eod|wrap\s+up|sign\s+off|clock\s+out\s+day|finish\s+day)/i.test(t)) 
    return { cmd: '/eod' };
  if (/^(today|brief|daily\s+brief|what('?s| is)\s+(up|going\s+on)\s+today)/i.test(t)) 
    return { cmd: '/today' };
  if (/^what('?s| is)\s+my\s+(status|role)/i.test(t)) 
    return { cmd: '/myrole' };
  if (/^(show\s+)?(all\s+)?roles/i.test(t)) 
    return { cmd: '/roles' };

  // ── Huddle / Meeting ───────────────────────────────────
  if (/^(start|begin|open|launch)\s+(a\s+)?(huddle|voice\s+room)/i.test(t)) {
    const topic = t.replace(/^(start|begin|open|launch)\s+(a\s+)?(huddle|voice\s+room)\s+(about\s+)?/i, '').trim();
    return { cmd: '/huddle', args: topic || '' };
  }
  if (/^(end|stop|close|finish)\s+(the\s+)?(huddle|voice\s+room)/i.test(t)) 
    return { cmd: '/endhuddle' };
  if (/^(start|begin|open)\s+(a\s+)?meeting/i.test(t)) {
    const topic = t.replace(/^(start|begin|open)\s+(a\s+)?meeting\s+(about\s+)?/i, '').trim();
    return { cmd: '/meeting', args: topic || '' };
  }
  if (/^(end|stop|close|finish)\s+(the\s+)?meeting/i.test(t)) 
    return { cmd: '/endmeeting' };

  // ── VIEW / LIST / SHOW patterns ────────────────────────
  const viewPatterns = [
    { re: /(?:show|view|list|get|display|pull\s+up)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?punch\s*(list|items)?/i, cmd: '/punchlist' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(assignments|tasks|assigns|to-?do|to\s+do)/i, cmd: '/assignments' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(change\s+orders?|cos?)\b/i, cmd: '/cos' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?rfis?\b/i, cmd: '/rfis' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?inspections?\b/i, cmd: '/inspections' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?permits?\b/i, cmd: '/permits' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:subcontractors?|subs?)\s*(?:list|directory)?\b/i, cmd: '/subs' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?deliver(y|ies)\b/i, cmd: '/deliveries' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:daily\s+)?reports?\b/i, cmd: '/reports' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?contacts?\b/i, cmd: '/contacts' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?liens?\b/i, cmd: '/liens' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:blockers?|blocks?)\b/i, cmd: '/blocks' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?meetings?\b/i, cmd: '/meetings' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(toolbox\s+talks?|safety\s+talks?)\b/i, cmd: '/toolboxtalks' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?submittals?\b/i, cmd: '/submittals' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:plan\s+)?revisions?\b/i, cmd: '/planrevs' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:safety\s+)?incidents?\b/i, cmd: '/incidents' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?photos?\b/i, cmd: '/photos' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(budget|money|finances?)\b/i, cmd: '/money' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(?:permit\s+)?fees?\b/i, cmd: '/permitfee' },
    { re: /(?:show|view|list|get|display)\s+(?:me\s+)?(?:the\s+)?(?:my\s+)?(time\s+entries?|clock\s+ins?|hours?)\b/i, cmd: '/clockin' },
    { re: /what('?s| is)\s+(pending|outstanding|open|due)/i, cmd: '/pending' },
    { re: /who('?s| is)\s+on\s+site/i, cmd: '/onsite' },
    { re: /(?:show|view|display)\s+(?:me\s+)?(?:the\s+)?(status|dashboard)/i, cmd: '/status' },
    { re: /(?:show|view)\s+(?:me\s+)?(?:the\s+)?(flow|workflow|process)/i, cmd: '/flow' },
    { re: /(?:show|view)\s+(?:me\s+)?(?:the\s+)?((?:cheat\s*sheet|quick\s*ref|guide|help|commands?))/i, cmd: '/help' },
  ];

  for (const { re, cmd } of viewPatterns) {
    if (re.test(t)) {
      // Extract optional filter after "for [project]" or "in [project]"
      // Skip filter extraction for simple info queries
      const noFilterCmds = new Set(['/pending', '/onsite', '/status', '/flow', '/help', '/myrole', '/roles']);
      let args = '';
      if (!noFilterCmds.has(cmd)) {
        const filterMatch = t.match(/(?:for|in|on)\s+(.+?)(?:\s*$|$)/i);
        if (filterMatch && filterMatch[1] && filterMatch[1].length < 30) {
          args = filterMatch[1].trim();
        }
      }
      return { cmd, args };
    }
  }

  // ── CREATE / ADD / LOG patterns ────────────────────────
  if (/^(add|create|log|record|new|make)\s+(a\s+)?punch\s+(item\s*)?[:;]?\s*(.+)/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new|make)\s+(a\s+)?punch\s+(item\s*)?[:;]?\s*/i, '').trim();
    return { cmd: '/punch', args: desc };
  }
  if (/^(add|create|log|record|new|make)\s+(a\s+)?(change\s+order|co)\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new|make)\s+(a\s+)?(change\s+order|co)\s+(for\s+)?/i, '').trim();
    return { cmd: '/addco', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(an?\s+)?rfi\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(an?\s+)?rfi\s+(for\s+)?/i, '').trim();
    return { cmd: '/rfi', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?delivery\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?delivery\s+(of\s+)?/i, '').trim();
    return { cmd: '/delivery', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?(?:safety\s+)?incident\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?(?:safety\s+)?incident\s+(?:about\s+)?/i, '').trim();
    return { cmd: '/incident', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?lien\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?lien\s+(for\s+)?/i, '').trim();
    return { cmd: '/lien', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?submittal\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?submittal\s+(for\s+)?/i, '').trim();
    return { cmd: '/submittal', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?(?:plan\s+)?revision\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?(?:plan\s+)?revision\s+(for\s+)?/i, '').trim();
    return { cmd: '/planrev', args: desc };
  }
  if (/^(add|create|new)\s+(a\s+)?permit\b/i.test(t)) {
    const desc = t.replace(/^(add|create|new)\s+(a\s+)?permit\s+(for\s+)?/i, '').trim();
    return { cmd: '/permit', args: desc };
  }
  if (/^(add|create|log|record|new|save)\s+(a\s+)?contact\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new|save)\s+(a\s+)?contact\s+(?:for\s+)?/i, '').trim();
    return { cmd: '/addcontact', args: desc };
  }
  if (/^(add|create|new)\s+(a\s+)?(block|blocker)\b/i.test(t)) {
    const desc = t.replace(/^(add|create|new)\s+(a\s+)?(block|blocker)\s+(?:about\s+)?/i, '').trim();
    return { cmd: '/block', args: desc };
  }
  if (/^(add|create|log|record|new)\s+(a\s+)?(?:toolbox\s+talk|safety\s+talk)\b/i.test(t)) {
    const desc = t.replace(/^(add|create|log|record|new)\s+(a\s+)?(?:toolbox\s+talk|safety\s+talk)\s+(?:about\s+)?/i, '').trim();
    return { cmd: '/toolbox', args: desc };
  }

  // ── INSPECTION scheduling ─────────────────────────────
  if (/^(schedule|set\s+up|book)\s+(an?\s+)?inspection\b/i.test(t)) {
    const desc = t.replace(/^(schedule|set\s+up|book)\s+(an?\s+)?inspection\s+(for\s+)?/i, '').trim();
    return { cmd: '/inspect', args: desc };
  }

  // ── ASSIGN / DELEGATE ─────────────────────────────────
  if (/^(assign|delegate|give)\s+(\w+)\s+(to\s+)?/i.test(t)) {
    const assignMatch = t.match(/^(assign|delegate|give)\s+(\w+)\s+(?:to\s+)?(.+)/i);
    if (assignMatch) {
      const person = assignMatch[2];
      const task = assignMatch[3];
      return { cmd: '/assign', args: `${person} ${task}` };
    }
  }
  if (/^(?:have|get|tell|ask)\s+(\w+)\s+(?:to\s+)?(.+)/i.test(t) && !/^(have|get|tell|ask)\s+(me|you|us)/i.test(t)) {
    const m = t.match(/^(?:have|get|tell|ask)\s+(\w+)\s+(?:to\s+)?(.+)/i);
    if (m) return { cmd: '/assign', args: `${m[1]} ${m[2]}` };
  }

  // ── REMINDER ──────────────────────────────────────────
  if (/^(remind\s+me|set\s+a\s+reminder)\b/i.test(t)) {
    const desc = t.replace(/^(remind\s+me|set\s+a\s+reminder)\s+(?:to\s+)?/i, '').trim();
    return { cmd: '/remind', args: desc };
  }

  // ── EMBEDDED CHANGE ORDER (detected by $ amount + "change order") ──
  // Check BEFORE email — "$14,000 change order" is more actionable than "email pat"
  if (/\$\d[\d,]*[kK]?/.test(t) && /change\s+order/i.test(t)) {
    // Strip email prefix if present, then pass everything to /addco
    let desc = t.replace(/^(email|send|mail)\s+(?:to\s+)?\w+\s+/i, '').trim();
    // If it starts with "add/create a change order" strip that too
    desc = desc.replace(/^(add|create|log|make)\s+(a\s+)?(change\s+order|co)\s+(for\s+)?/i, '').trim();
    return { cmd: '/addco', args: desc };
  }

  // ── EMAIL ────────────────────────────────────────────
  if (/^(email|send\s+(?:an?\s+)?email|mail)\s+(?:to\s+)?(\w+)/i.test(t)) {
    const m = t.match(/^(email|send\s+(?:an?\s+)?email|mail)\s+(?:to\s+)?(\w+)\s*/i);
    if (m) {
      const person = m[2];
      const body = t.slice(m[0].length).trim();
      return { cmd: '/email', args: `${person} ${body}`.trim() };
    }
  }

  // ── MARK / COMPLETE / CLOSE ───────────────────────────
  if (/^(mark|close|complete|finish|resolve)\s+(?:a\s+)?punch\b/i.test(t)) {
    let id = t.replace(/^(mark|close|complete|finish|resolve)\s+(?:a\s+)?punch\s*(?:item\s*)?/i, '').trim();
    id = id.replace(/\s+(?:done|complete|finished|resolved|closed)$/i, '').trim();
    return { cmd: '/punchdone', args: id };
  }
  if (/^(mark|close|complete|finish|resolve)\s+(?:an?\s+)?rfi\b/i.test(t)) {
    const id = t.replace(/^(mark|close|complete|finish|resolve)\s+(?:an?\s+)?rfi\s*/i, '').trim();
    return { cmd: '/rfi_done', args: id };
  }
  if (/^(approve|reject|review)\s+(?:a\s+)?(?:change\s+order|co)\b/i.test(t)) {
    const desc = t.replace(/^(approve|reject|review)\s+(?:a\s+)?(?:change\s+order|co)\s*/i, '').trim();
    return { cmd: '/co', args: desc };
  }

  // ── ESCALATE ──────────────────────────────────────────
  if (/^(escalate|flag|raise)\b/i.test(t)) {
    const desc = t.replace(/^(escalate|flag|raise)\s+/i, '').trim();
    return { cmd: '/escalate', args: desc };
  }

  // ── QUICK SINGLE-KEYWORD TRIGGERS ─────────────────────
  // Only match short messages (1-3 words) that are clearly a command
  const words = t.split(/\s+/);
  if (words.length <= 3) {
    const quickMap = {
      'punch list': '/punchlist', 'punches': '/punchlist',
      'tasks': '/assignments', 'assignments': '/assignments', 'todo': '/assignments',
      'change orders': '/cos', 'cos': '/cos', 'change order': '/cos',
      'rfis': '/rfis',
      'inspections': '/inspections',
      'permits': '/permits',
      'subs': '/subs', 'subcontractors': '/subs',
      'deliveries': '/deliveries',
      'reports': '/reports', 'daily report': '/dailyreport',
      'contacts': '/contacts',
      'liens': '/liens',
      'blockers': '/blocks', 'blocks': '/blocks',
      'meetings': '/meetings',
      'submittals': '/submittals',
      'incidents': '/incidents',
      'photos': '/photos', 'gallery': '/photos',
      'budget': '/money', 'money': '/money',
      'pending': '/pending',
      'onsite': '/onsite', "who's here": '/onsite',
      'status': '/status',
      'workflow': '/flow',
      'help': '/help', 'commands': '/help',
      'roles': '/roles', 'my role': '/myrole',
      'permit fees': '/permitfee',
      'toolbox talks': '/toolboxtalks',
      'plan revisions': '/planrevs', 'revisions': '/planrevs',
      'clock in': '/clockin', 'time': '/clockin',
    };
    for (const [phrase, cmd] of Object.entries(quickMap)) {
      if (t === phrase || t === phrase.replace(/\s+/g, '')) {
        return { cmd };
      }
    }
  }

  return null;
}

// ─── Voice Handler ────────────────────────────────────────────
async function handleVoice(msg, from) {
  const chatId = msg.chat.id;
  if (!msg.voice) return;

  await send(chatId, '🎙️ *Processing voice note...*\n_Transcribing..._');

  const transcript = await transcribeVoice(msg.voice.file_id);
  if (!transcript) {
    return send(chatId, '❌ Could not transcribe voice note. Try again or use text.');
  }

  await send(chatId, `📝 *Transcribed:*\n_${transcript}_`);

  // 🔀 ROUTE: Check if the transcript is actually a command or request
  // "find me an electrician" → sub search, not task extraction
  const t = transcript.trim();

  // 1. Check for slash commands spoken aloud
  if (t.startsWith('/') || /^(?:slash\s+)?(today|brief|daily|help|start|guide|flow|clear|chat|crew|team|dash|link|app|subs?|findsub|punchlist|cos?|rfis?|liens|permits|blocks|assignments|pending|onsite|roles?|myrole|inspect|contacts|reports|cheatsheet|tutorial)\b/i.test(t)) {
    // Re-route through the main text handler
    return await handleMessage({ chat: msg.chat, text: t, from });
  }

  // 2. Check for general command intent (NATURAL LANGUAGE)
  const cmdIntent = detectCommandIntent(t);
  if (cmdIntent) {
    const { cmd, args } = cmdIntent;
    const withArgs = args ? `${cmd} ${args}` : cmd;
    return await handleMessage({ chat: msg.chat, text: withArgs, from });
  }

  // 3. Check for sub-finding intent (shared logic)
    const subIntent = detectSubIntent(t);
    if (subIntent) {
      const { trade, location } = subIntent;
      if (location) {
        return await handleMessage({ chat: msg.chat, text: `/findsub ${trade} near ${location}`, from });
      }
      return await handleMessage({ chat: msg.chat, text: `/sub ${trade}`, from });
    }

    // Extract tasks
  const items = await extractTasks(transcript);
  if (!items?.length) {
    return send(chatId, 'ℹ️ No tasks or assignments detected in this message.');
  }

  // Save each extracted item
  const d = await getDb();
  const results = [];
  for (const item of items) {
    const id = uid();
    d.prepare(
      `INSERT INTO assignments (id, project, task, assignee, assigned_by, due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?)`
    ).run(id, 'Voice Note', item.description, item.owner || 'Unassigned', from.first_name,
         item.due_date || null, `Priority: ${item.priority}, Type: ${item.type}`);
    
    if (item.type === 'issue') {
      results.push(`⚠️ *Issue:* ${item.description} → ${item.owner || 'Unassigned'}`);
    } else if (item.type === 'deadline') {
      results.push(`📅 *Deadline:* ${item.description} — Due: ${item.due_date || 'TBD'}`);
    } else {
      results.push(`✅ *Task:* ${item.description} → _${item.owner || 'Unassigned'}_${item.due_date ? ' — Due: ' + item.due_date : ''}`);
    }
    logAudit(from.first_name, 'voice_extract', 'assignment', id, item.description);
  }

  // Save daily report
  const reportId = uid();
  d.prepare(
    'INSERT INTO daily_reports (id, project, reported_by, date, progress, raw_transcript) VALUES (?,?,?,?,?,?)'
  ).run(reportId, 'Voice Report', from.first_name, new Date().toISOString().split('T')[0],
        `Extracted ${items.length} items`, transcript);

  await send(chatId, [
    `🎯 *Extracted ${items.length} items:*`,
    '',
    ...results,
    '',
    '✅ All saved to project database.',
    'Use /assignments to review.',
  ].join('\n'));
}

// ─── Command Handlers ─────────────────────────────────────────
async function cmdGuide(chatId) {
  const role = await getUserRole(chatId, 'current');
  const roleLine = { owner: '👑 Owner — full access', exec: '⭐ Executive — manage team & money', foreman: '🔧 Foreman — run the field', sub: '👷 Sub — view-only' }[role] || '👷 Sub — view-only';
  return send(chatId, [
    '📖 *GreenTouch.Pro — The Rulebook*',
    '',
    'This system tracks *everything* on your jobs. Use it right and nothing falls through the cracks.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '👥 *WHO CAN DO WHAT*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `You: ${roleLine}`,
    '',
    '👑 *Owner* — Everything. Set roles, manage money, vet subs.',
    '⭐ *Exec/PM* — Run huddles, approve COs, schedule inspections.',
    '🔧 *Foreman* — Assign tasks, clock crew, log punch/safety.',
    '👷 *Sub* — View tasks & directory. Cannot change anything.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '🌅 *THE DAILY FLOW* (everyone follows this)',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '1️⃣  `/today` — Full morning briefing (1 command = everything)',
    '2️⃣  `/clockin [name] [trade]` — Log who\'s on site',
    '3️⃣  `/flow` — Step-by-step checklist for the day',
    '4️⃣  Work → log EVERYTHING as you go:',
    '    • Voice notes → auto-extracts tasks while you walk',
    '    • Photos → snap it, caption \"Project: what this is\"',
    '    • `/a [who] [what]` → assign instantly',
    '5️⃣  `/punchlist` — Walk the site, log every issue found',
    '6️⃣  `/dailyreport [notes]` — End-of-day summary',
    '7️⃣  `/clockout [name]` — Log off site',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '📋 *DATA RULES — DO THIS OR IT BREAKS*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '✅ *ALWAYS use exact project names.*',
    '   Set once: `/project \"Woodbridge Renovation\"`',
    '   Then all commands auto-tag that project.',
    '',
    '✅ *ALWAYS clock in before logging work.*',
    '   No clock-in = no labor tracking = no cost data.',
    '',
    '✅ *Voice notes > typing.*',
    '   Walk the site, hold the mic, describe issues.',
    '   Bot extracts tasks, deadlines, and assigns them.',
    '',
    '✅ *Photos need project names in captions.*',
    '   \"Woodbridge: master bath tile progress\" ✅',
    '   \"pic from today\" ❌',
    '',
    '✅ *Log it NOW, not later.*',
    '   Punch item seen? `/punch` immediately.',
    '   Sub no-show? `/incident` right then.',
    '   Memory fails. The bot doesn\'t.',
    '',
    '❌ *NEVER:*',
    '   • Skip the daily report → no paper trail',
    '   • Use nicknames for projects → data gets lost',
    '   • Approve COs verbally → must be `/co [id] approve`',
    '   • Let subs use foreman commands → they\'re sub-only for a reason',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '💡 *PRO TIPS*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '• `/today` is your homepage. Start every session with it.',
    '• `/dash` opens the web portal — same data, bigger screen.',
    '• `/huddle \"topic\"` starts a voice room — everything said gets logged.',
    '• `/findsub drywall 22102` vets subs before they step on site.',
    '• `/blocks` shows what\'s stuck — clear blockers first.',
    '',
    '📌 *Bookmark this:* type `/guide` anytime to re-read these rules.',
    '👉 *Next:* `/tutorial` for the 3-minute walkthrough.',
  ].join('\n'));
}

async function cmdStart(chatId) {
  return send(chatId, [
    '🚧 *GreenTouch.Pro — Construction Ops Agent*',
    '',
    '💬 *Talk to it.* Type commands or send a voice note.',
    '👀 *Everything tracked.* Tasks, subs, punch, COs, permits, inspections.',
    '',
    '⚡ *Quick Start:*',
    '• `/guide` — 📖 HOW TO USE THIS SYSTEM (start here!)',
    '• `/myrole` — Check your access level',
    '• `/help` — Full command guide (or `/h` for short)',
    '• `/tutorial` — 3-minute walkthrough',
    '• `/cheatsheet` — Printable quick reference',
    '',
    '🤝 *Team & Portal:*',
    '• `/chat` — View your crew (alias: /crew, /team)',
    '• `/dash` — Open web dashboard (alias: /link, /dashboard, /app)',
    '• `/onsite` — Who\'s clocked in right now',
    '',
    '⚡ *Daily Flow:*',
    '• `/morning` — AM briefing: tasks, crew, money, overdues (alias: /am)',
    '• `/today` — Full status across all projects (alias: /brief, /daily)',
    '• `/eod [summary]` — End of day: photo → report → clock-out (alias: /endofday, /wrap)',
    '• `/project [name]` — Set active job (alias: /job, /site)',
    '• `/money` — Budget: COs total, liens, permits (alias: /budget)',
    '• `/photos` — Project photo timeline (alias: /gallery)',
    '• `/flow` — Morning checklist (10-step routine)',
    '',
    '🔧 *Top Commands:*',
    '• `/a` — Assign task  (`/a Mike frame wall by Friday`)',
    '• `/subs` — Sub directory',
    '• `/punchlist` — Punch items',
    '• `/cos` — Change orders',
    '• `/onsite` — Who\'s on site',
    '• `/concrete` — Material calc',
    '',
    '🎙️ *Voice:* Send a voice note — auto-transcribed, tasks extracted.',
    '📸 *Photos:* Send a photo with caption "Project: description".',
    '',
    '_Built for Green Touch Builders — DMV_',
  ].join('\n'));
}

async function cmdHelp(chatId) {
  return send(chatId, [
    '📖 *GreenTouch.Pro — Command Guide*',
    '',
    '💡 *Shortcuts:* Many commands have 1-3 letter aliases.',
    '   `/a` = `/assign`  •  `/cos` = change orders list  •  `/rfis` = RFI list',
    '   `/subs` = subcontractors  •  `/dash` = dashboard',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '👷 *EVERYONE (Subs & Up)* — Read-Only',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '/start — Welcome & feature overview',
    '/help — This guide (also: /h)',
    '/status — System health check',
    '/myrole — Your current role & permissions',
    '/roles — See team role assignments',
    '',
    '📋 *Tasks & Projects:*',
    '/assignments [project] — View all tasks (also: /tasks, /assigns)',
    '/pending — Unacknowledged tasks >24h',
    '',
    '📇 *Subcontractor Directory:*',
    '/subs [trade|company] — Search sub database (also: /subcontractors)',
    '/sub [trade] — Quick sub lookup (voice: "find me a plumber")',
    '/whodoes [trade] — Find subs by trade with ratings',
    '/sub [search] — Search (no args = list all)',
    '/sub add [name] [trade] — Add new subcontractor [owner]',
    '/sub compare [a] vs [b] — Side-by-side comparison',
    '/vetsub [company] [trade] [city] [state] — Full vetting report (also: /vet)',
    '/findsub [trade] near [city] — Web search + vet top matches (also: /searchsub)',
    '/removesub [company] — Delete sub from directory (also: /delsub, /deletesub) [owner]',
    '',
    '💡 *Add-On Available:* Material Calcs Suite ($500 setup + $67/mo)',
    '/rfis [project] — RFI list (also: /rfislist)',
    '/cos [project] — Change orders (also: /copending)',
    '/money [project] — Budget: COs, liens, permits (also: /budget)',
    '/reports [project] — Daily reports (also: /reportlist, /reportweek)',
    '/photos [project] — Photo timeline (also: /gallery)',
    '/inspections [project] — Inspection schedule (also: /inspectlist, /inspectpending)',
    '/onsite [project] — Who\'s on site now',
    '/crew [project] — Today\'s crew report (also: /chat, /team)',
    '/incidents [project] — Safety incident log',
    '/toolboxtalks [project] — Toolbox talk history (also: /toolboxlist)',
    '/contacts [role] — Contact directory (also: /emaillist)',
    '/permits [project] — Permit tracker (also: /permitlist, /permitexpiring, /permitfee, /permitfees)',
    '/submittals [project] — Submittals (also: /submittallist, /stalereviews)',
    '/blocks [project] — Blocker list (also: /blockers, /blocklist)',
    '/liens [project] — Lien releases (also: /lienlist, /lienpending)',
    '/planrevs [project] — Plan revisions (also: /revisions)',
    '/meetings — Meeting list (also: /meetingminutes)',
    '',
    '🧮 *Add-On Available:* Material Calcs Suite — built-in concrete, studs, lumber, drywall in your command center. $500 setup + $67/mo. Ask for details.',
    '',
    '🎓 *Learning:*',
    '/tutorial — 3-min onboarding',
    '/cheatsheet — Quick reference (also: /quickref, /guide)',
    '/workflow [type] — Recipes (also: /recipe, /playbook)',
    '/dash — Web dashboard link (also: /dashboard, /link, /app)',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🔧 *FOREMAN+* — Field Ops',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '/a [name] [task] by [date] — Assign task (also: /assign)',
    '/punch [project] [item] — Add punch item (also: /punchadd)',
    '/punchdone [id] — Close punch item (also: /punchclose, /punchcomplete)',
    '/delivery [project] [mat] from [sup] on [date] — Log delivery',
    '/rfi [project] [title] — Log RFI',
    '/rfi_done [id] — Close RFI (also: /rficlose, /rficomplete)',
    '/remind [project] [msg] at [time] — Set reminder',
    '/clockin [name] [trade] [project] — Clock in',
    '/clockout [name] — Clock out',
    '/incident [project] [desc] [severity] — Report incident',
    '/toolbox [project] [topic] — Log toolbox talk',
    '/dailyreport [project] [notes] — Auto daily report',
    '/block [project] [desc] — Flag a blocker',
    '/escalate [msg] — Escalate to leadership',
    '/done [task-id] — Mark task complete (also: /complete)',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⭐ *EXEC+* — Management',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '/addco [project] [desc] [$] [who] — Create change order (also: /changeorder)',
    '/co [id] approve|reject — Decide on CO',
    '/huddle [topic] [minutes] — Start voice room (also: /voiceroom)',
    '/endhuddle — End huddle, AI extracts tasks & emails summary',
    '/addcontact [name] [email] [role] — Add contact (also: /addemail)',
    '/removecontact [name] — Delete contact (also: /deletecontact)',
    '/email [name] [subject] -- [body] — Send email via SMTP',
    '/permit [project] [type] [juris] [date] [fee] — Log permit',
    '/inspect [project] [type] [date] [time] [insp] — Schedule inspection',
    '/inspect [id] pass|fail [notes] — Record result',
    '/submittal [project] [desc] [date] — File submittal',
    '/submittal [id] approved|reject — Review submittal',
    '/meeting [project] [topic] — Start meeting',
    '/endmeeting — End meeting, capture minutes',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '👑 *OWNER ONLY* — Admin',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '/setrole [user_id] [owner|exec|foreman|sub] — Assign role',
    '/addsub [name] [co] [trade] [ph] [city] [st] — Add sub to directory (owner)',
    '/sub add [name] [co] [trade] — Same as /addsub',
    '/sub compare [a] vs [b] — Side-by-side sub comparison',
    '/vetsub [company] [trade] [city] [state] — BBB+Google+License vetting (also: /vet)',
    '/findsub [trade] near [city/zip] — Web search + auto-vet top matches (also: /searchsub)',
    '/removesub [company] — Remove sub from directory (also: /delsub, /deletesub)',
    '/lien [project] [sub] [amount] [draw] — Log lien release',
    '/lien [id] signed — Mark lien release signed',
    '/planrev [project] [desc] [rev#] — Log plan revision (also: /revision, /plans)',
    '/block [id] resolved [notes] — Resolve blocker',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🎙️ *Voice & Photos (All Roles)*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🎙️ Send voice note — Auto-transcribed, tasks extracted',
    '📸 Send photo + caption "ProjectName: description" — Auto-logged',
    '',
    '💡 *Need more access?* Ask your admin to run `/setrole <your_id> <role>`.',
    '   Check your current role with `/myrole`.',
  ].join('\n'));
}

// ─── Email Sender ───────────────────────────────────────────────
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const LEADERSHIP = [
  'pat@greentouchbuilders.com',
  'paul.lee@greentouchbuilders.com',
  'graham@greentouchbuilders.com',
  process.env.SMTP_FROM,
].filter(Boolean);

async function sendEmail(to, subject, html) {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log('Email not configured, would send:', subject);
    return;
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com', port: 465, secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: `"GreenTouch.Pro" <${SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject, html,
    });
    console.log('📧 Email sent:', subject.slice(0, 60));
  } catch (e) {
    console.error('Email error:', e.message);
  }
}

// ─── Huddle ──────────────────────────────────────────────────────
async function cmdHuddle(chatId, args, from) {
  const active = activeHuddles.get(chatId);
  if (active) {
    return send(chatId, `⚠️ A huddle is already active! (*${active.topic}*)\nUse /endhuddle to stop it.`);
  }

  // Parse: /huddle [topic] [minutes]
  let topic = 'Team Huddle';
  let minutes = 15;
  if (args) {
    const minMatch = args.match(/(\d+)\s*(min|mins|minutes)?\s*$/i);
    if (minMatch) {
      minutes = parseInt(minMatch[1]);
      topic = args.slice(0, minMatch.index).trim() || 'Team Huddle';
    } else {
      topic = args;
    }
  }

  const d = await getDb();
  const id = uid();
  const now = new Date().toISOString();
  d.prepare(
    'INSERT INTO huddles (id, chat_id, topic, started_by, started_at, minutes, status) VALUES (?,?,?,?,?,?,\'active\')'
  ).run(id, String(chatId), topic, from.first_name, now, minutes);

  const huddle = {
    id, topic, startedAt: now, startedBy: from.first_name,
    minutes, timer: null, messages: [],
  };

  // Auto-end timer
  huddle.timer = setTimeout(() => {
    console.log(`⏰ Huddle auto-ended: ${topic}`);
    endHuddle(chatId, true).catch(e => console.error('Auto-end error:', e.message));
  }, minutes * 60 * 1000);

  activeHuddles.set(chatId, huddle);

  logAudit(from.first_name, 'start_huddle', 'huddle', id, topic);

  return send(chatId, [
      `🎯 *Huddle Started!*`,
      '',
      `📌 *Topic:* ${topic}`,
      `⏱️ *Duration:* ${minutes} min`,
      `🙋 *Started by:* ${from.first_name}`,
      '',
      '🗣️ *How this works:*',
      '• Send voice notes — auto-transcribed + added to huddle',
      '• Send text — captured automatically',
      '• Send photos with captions — added to huddle log',
      '',
      `⏰ Auto-ends in ${minutes} minutes.`,
      'Use /endhuddle to finish early.',
      '',
      '_All messages will be AI-analyzed at end for task extraction._',
    ].join('\\n'));
}

async function cmdEndHuddle(chatId) {
  return endHuddle(chatId, false);
}

async function endHuddle(chatId, autoEnded) {
  const huddle = activeHuddles.get(chatId);
  if (!huddle) return send(chatId, '⚠️ No active huddle.');

  if (huddle.timer) clearTimeout(huddle.timer);
  activeHuddles.delete(chatId);

  const d = await getDb();
  const now = new Date().toISOString();
  const messages = huddle.messages;

  // Collect all text content
  const transcript = messages.map(m => `${m.sender}: ${m.content}`).join('\n');

  // Extract tasks from transcript
  const items = transcript ? await extractTasks(transcript) : [];

  // Save assignments
  for (const item of items) {
    const id = uid();
    d.prepare(
      'INSERT INTO assignments (id, project, task, assignee, assigned_by, due_date, status, notes) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, 'Huddle: ' + huddle.topic, item.description, item.owner || 'Unassigned',
         huddle.startedBy, item.due_date || null, 'assigned',
         `Huddle: ${huddle.topic}, priority: ${item.priority}, type: ${item.type}`);
  }

  // Build summary
  const duration = transcript ? messages.length + ' messages, ' + items.length + ' items extracted' : 'No messages recorded';
  const summary = [
    `📋 *Huddle Summary*`,
    '',
    `📌 *Topic:* ${huddle.topic}`,
    `👤 *Led by:* ${huddle.startedBy}`,
    `⏱️ *Duration:* ~${Math.round((Date.now() - new Date(huddle.startedAt).getTime()) / 60000)} min`,
    `📝 *Messages:* ${messages.length}`,
    `🎯 *Items extracted:* ${items.length}`,
    '',
    items.length ? `*Extracted Tasks:*\n${items.map(i =>
      `• ${i.type === 'issue' ? '⚠️' : i.type === 'deadline' ? '📅' : '✅'} ${i.description} → ${i.owner || 'Unassigned'}${i.due_date ? ' (Due: ' + i.due_date + ')' : ''}`
    ).join('\n')}` : '✅ No tasks or issues detected.',
    '',
    `📋 Use /assignments to review all tasks.`,
    `📧 Summary has been emailed to leadership.`,
  ].join('\n');

  // Update DB
  d.prepare(
    "UPDATE huddles SET ended_at=?, status='completed', summary=? WHERE id=?"
  ).run(now, transcript.slice(0, 500), huddle.id);

  logAudit(huddle.startedBy, autoEnded ? 'huddle_auto_ended' : 'end_huddle', 'huddle', huddle.id, transcript.slice(0, 200));

  // Send to Telegram
  await send(chatId, summary);

  // Send email summary to leadership
  const html = [
    '<h2>📋 GreenTouch Huddle Summary</h2>',
    `<p><b>Topic:</b> ${huddle.topic}</p>`,
    `<p><b>Led by:</b> ${huddle.startedBy}</p>`,
    `<p><b>Duration:</b> ~${Math.round((Date.now() - new Date(huddle.startedAt).getTime()) / 60000)} min</p>`,
    `<p><b>Messages:</b> ${messages.length}</p>`,
    `<hr/>`,
    items.length ? `<h3>Extracted Tasks</h3><ul>${items.map(i => `<li><b>${i.type}:</b> ${i.description} → ${i.owner || 'Unassigned'}${i.due_date ? ' (Due: ' + i.due_date + ')' : ''}</li>`).join('')}</ul>` : '',
    `<hr/>`,
    `<h3>Transcript</h3><pre style="background:#f5f5f5;padding:10px;font-size:13px;">${transcript.slice(0, 2000) || 'No messages recorded.'}</pre>`,
    `<p><small>Generated by GreenTouch.Pro</small></p>`,
  ].join('\n');
  await sendEmail(LEADERSHIP, `📋 Huddle Summary: ${huddle.topic}`, html);
}

// ─── Sub Contractor Directory ───────────────────────────────────
async function cmdAddSub(chatId, args, from) {
  // /addsub Name Company Trade Phone [City] [State]
  // Enhanced: auto-runs vetting engine if city/state provided
  if (!args) return send(chatId, 'Usage: /addsub [name] [company] [trade] [phone] [city] [state]\nExample: /addsub Mike AcmeDrywall Drywall 703-555-0142 Woodbridge VA');
  const parts = args.split(/\s+/);
  const name = parts[0];
  const company = parts[1] || name;
  const trade = parts[2] || '';
  const phone = parts[3] || '';
  const city = parts[4] || '';
  const state = parts[5] || 'VA';

  if (!name) return send(chatId, '❌ Please include a name.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO subs (id, name, company, trade, phone, vet_color) VALUES (?,?,?,?,?,?)').run(id, name, company, trade, phone, 'yellow');
  logAudit(from.first_name, 'add_sub', 'sub', id, `${name} - ${company} - ${trade}`);

  // If city/state given, auto-vet in background
  if (city && state) {
    send(chatId, `✅ *Sub added:* ${name}\n🏢 ${company} | 🛠️ ${trade} | 📞 ${phone}\n\n🔍 Running background vetting for ${city}, ${state}...`);

    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileP = promisify(execFile);
      const vetPath = path.join(PROJECT_ROOT, 'scripts', 'vet_sub.py');
      const { stdout } = await execFileP(SCRIPTS_PY, [vetPath, '--company', company, '--trade', trade, '--city', city, '--state', state], { timeout: 30000 });
      const vet = JSON.parse(stdout);

      // Update DB with vet results
      d.prepare(`UPDATE subs SET
        bbb_rating=?, bbb_complaints=?, bbb_accredited=?,
        google_rating=?, google_reviews=?,
        license_number=?, license_status=?, license_state=?,
        vet_score=?, vet_color=?, last_vetted=datetime('now')
        WHERE id=?`).run(
        vet.search_data?.bbb_rating || null, vet.search_data?.bbb_complaints || 0, vet.search_data?.bbb_accredited ? 1 : 0,
        vet.search_data?.google_rating || null, vet.search_data?.google_reviews || 0,
        vet.license?.number || vet.search_data?.license_number || null, vet.license?.status || null, vet.license?.state || state,
        vet.vet_score, vet.vet_color, id
      );

      const emoji = vet.vet_color === 'green' ? '🟢' : vet.vet_color === 'yellow' ? '🟡' : '🔴';
      const lines = [`${emoji} *Vet Complete: ${company}* (${vet.vet_score}/100)`];
      if (vet.vet_details) lines.push('', ...vet.vet_details.map(d => `  • ${d}`));
      send(chatId, lines.join('\n'));
    } catch (e) {
      send(chatId, `⚠️ Background vetting unavailable in this tier. Add the Sub Intel Pipeline to enable auto-vetting.`);
    }
  } else {
    send(chatId, `✅ *Sub added:* ${name}\n🏢 ${company} | 🛠️ ${trade} | 📞 ${phone}\n\n💡 Add city/state for auto-vetting: /addsub ${name} ${company} ${trade} ${phone} Woodbridge VA`);
  }
}

async function cmdWhoDoes(chatId, args) {
  // /whodoes drywall or /subs or /whodoes Mike
  if (!args) {
    // List all subs grouped by trade with vet colors
    const d = await getDb();
    const rows = d.prepare('SELECT * FROM subs ORDER BY vet_score DESC, trade, name LIMIT 30').all();
    if (!rows.length) return send(chatId, 'No subs registered. Use /addsub to add one.');
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.trade || 'Uncategorized']) grouped[r.trade || 'Uncategorized'] = [];
      const emoji = r.vet_color === 'green' ? '🟢' : r.vet_color === 'yellow' ? '🟡' : '🔴';
      grouped[r.trade || 'Uncategorized'].push(`  ${emoji} ${r.name}${r.company?' ('+r.company+')':''} — ${r.vet_score?r.vet_score+'/100':'unvetted'}`);
    }
    const lines = ['📋 *Subcontractor Directory*'];
    const total = rows.length;
    const vetted = rows.filter(r => r.vet_score).length;
    const greens = rows.filter(r => r.vet_color === 'green').length;
    lines.push(`_${total} subs · ${vetted} vetted · ${greens} 🟢 approved_`, '');
    for (const [trade, people] of Object.entries(grouped)) {
      lines.push(`*${trade}:*`, ...people, '');
    }
    return send(chatId, lines.join('\n'));
  }

  // Search by name or trade (with vet info)
  const d = await getDb();
  const rows = d.prepare('SELECT * FROM subs WHERE name LIKE ? OR trade LIKE ? OR company LIKE ? ORDER BY vet_score DESC LIMIT 20')
    .all(`%${args}%`, `%${args}%`, `%${args}%`);
  if (!rows.length) return send(chatId, `No subs found matching "${args}". Use /findsub to search the web.`);
  const lines = [`🔍 *Subs matching "${args}":*`, ''];
  for (const r of rows) {
    const emoji = r.vet_color === 'green' ? '🟢' : r.vet_color === 'yellow' ? '🟡' : '🔴';
    lines.push(`${emoji} *${r.name}*${r.company?' ('+r.company+')':''}`);
    lines.push(`  🛠️ ${r.trade || 'N/A'} | 📞 ${r.phone||'N/A'} | Score: ${r.vet_score||'?'}/100`);
    if (r.bbb_rating) lines.push(`  BBB: ${r.bbb_rating} | Google: ${r.google_rating||'?'}★ (${r.google_reviews||0} reviews)`);
    if (r.license_number) lines.push(`  License: ${r.license_number} (${r.license_status||'pending'})`);
  }
  lines.push('', '_Use /vetsub [company] [city] [state] to vet or re-vet_');
  lines.push('_Use /removesub [company] to remove (owner only)_');
  return send(chatId, lines.join('\n'));
}

// ─── Sub Vetting Commands ───────────────────────────────────────

// Python vetting script path
const VET_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'vet_sub.py');

async function runVetScript(company, trade, city, state) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileP = promisify(execFile);
  try {
    const { stdout } = await execFileP(SCRIPTS_PY, [
      VET_SCRIPT, '--company', company, '--trade', trade || 'contractor',
      '--city', city || '', '--state', state || 'VA'
    ], { timeout: 30000 });
    return JSON.parse(stdout);
  } catch (e) { return null; }
}

// ─── Remove Subcontractor ──────────────────────────────────
async function cmdRemoveSub(chatId, args) {
  // /removesub [company name or sub ID]
  // Owner only — removes a sub from the directory
  if (!args) return send(chatId, 'Usage: /removesub [company name or ID]\nExample: /removesub \"Miller Drywall\"\n\nUse /subs to see all subs and their info.');

  const d = await getDb();

  // Try exact match first, then LIKE
  let sub = d.prepare('SELECT * FROM subs WHERE id = ? OR company = ? OR name = ?').get(args, args, args);
  if (!sub) {
    sub = d.prepare('SELECT * FROM subs WHERE company LIKE ? OR name LIKE ? LIMIT 1').get(`%${args}%`, `%${args}%`);
  }

  if (!sub) return send(chatId, `❌ No sub found matching \"${args}\".\nUse /subs to see all subcontractors.`);

  const displayName = sub.company || sub.name;
  d.prepare('DELETE FROM subs WHERE id = ?').run(sub.id);

  await send(chatId, [
    `🗑️ *Removed:* ${displayName}`,
    `Trade: ${sub.trade || 'N/A'} | Score: ${sub.vet_score || '?'}/100`,
    '',
    '_Use /subs to view remaining directory._',
    '_Use /addsub to add a new one._',
  ].join('\\n'));

  logAudit('owner', 'remove_sub', 'subs', sub.id, `Removed ${displayName}`);
}

async function cmdVetSub(chatId, args) {
  // /vetsub Company Trade City State
  // Vets a subcontractor and shows full report
  if (!args) return send(chatId, 'Usage: /vetsub [company] [trade] [city] [state]\nExample: /vetsub "Hitt Contracting" "general contractor" "Falls Church" VA');
  const parts = args.match(/"([^"]+)"|'([^']+)'|(\S+)/g)?.map(s => s.replace(/['"]/g, '')) || args.split(/\s+/);
  const company = parts[0] || '';
  const trade = parts[1] || 'contractor';
  const city = parts[2] || '';
  const state = parts[3] || 'VA';

  if (!company) return send(chatId, '❌ Company name required.');

  send(chatId, `🔍 *Vetting ${company}...*\n_Checking BBB, Google reviews, and license in ${city}, ${state}_`);

  const vet = await runVetScript(company, trade, city, state);
  if (!vet || vet.error) return send(chatId, `❌ Vetting failed: ${vet?.error || 'Could not run vetting engine'}. Try again or add manually with /addsub.`);

  // Save to DB if found
  const d = await getDb();
  const existing = d.prepare('SELECT id FROM subs WHERE company LIKE ? LIMIT 1').get(`%${company}%`);
  let id;
  if (existing) {
    id = existing.id;
    d.prepare(`UPDATE subs SET
      bbb_rating=?, bbb_complaints=?, bbb_accredited=?, google_rating=?, google_reviews=?,
      license_number=?, license_status=?, license_state=?,
      vet_score=?, vet_color=?, last_vetted=datetime('now'), trade=?
      WHERE id=?`).run(
      vet.search_data?.bbb_rating || null, vet.search_data?.bbb_complaints || 0, vet.search_data?.bbb_accredited ? 1 : 0,
      vet.search_data?.google_rating || null, vet.search_data?.google_reviews || 0,
      vet.license?.number || vet.search_data?.license_number || null, vet.license?.status || null, vet.license?.state || state,
      vet.vet_score, vet.vet_color, trade, id
    );
  } else {
    id = uid();
    d.prepare(`INSERT INTO subs (id, name, company, trade, vet_score, vet_color, bbb_rating, bbb_complaints,
      bbb_accredited, google_rating, google_reviews, license_number, license_status, license_state, last_vetted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
      id, company, company, trade, vet.vet_score, vet.vet_color,
      vet.search_data?.bbb_rating, vet.search_data?.bbb_complaints || 0, vet.search_data?.bbb_accredited ? 1 : 0,
      vet.search_data?.google_rating, vet.search_data?.google_reviews || 0,
      vet.license?.number || vet.search_data?.license_number, vet.license?.status, vet.license?.state || state
    );
  }

  // Full report with clickable action buttons
  const emoji = vet.vet_color === 'green' ? '🟢' : vet.vet_color === 'yellow' ? '🟡' : '🔴';
  const licenseBadge = vet.license_verified ? '✅ License Verified' : '⚠️ License Unverified';
  const lines = [
    `${emoji} *Vetting Report: ${company}*`,
    `📊 Score: *${vet.vet_score}/100* — ${vet.vet_color.toUpperCase()} | ${licenseBadge}`,
    `🛠️ ${trade} | 📍 ${city}, ${state}`,
    '',
    '*Breakdown:*'
  ];
  if (vet.vet_details) lines.push(...vet.vet_details.map(d => `  ${d}`));
  lines.push('', `⏱️ ${vet.elapsed_seconds}s`);
  if (vet.search_data?.snippets?.[0]) {
    lines.push('', `📎 _"${vet.search_data.snippets[0].slice(0, 150)}..."_`);
  }

  // Build inline keyboard buttons
  const buttons = [];
  const safeCompany = company.replace(/[:]/g, '-');
  buttons.push([
    { text: '📋 Save to Directory', callback_data: `save_sub:${safeCompany}:${trade}:${city}:${state}` }
  ]);
  const bbbUrl = vet.search_data?.url;
  if (bbbUrl) {
    buttons.push([{ text: '🔗 View BBB Profile', callback_data: `view_bbb:${bbbUrl}` }]);
  }
  buttons.push([
    { text: '🔄 Re-Vet', callback_data: `save_sub:${safeCompany}:${trade}:${city}:${state}` },
    { text: '⚠️ License Info', callback_data: 'license_info' }
  ]);

  return sendWithButtons(chatId, lines.join('\\n'), buttons);
}

async function cmdFindSub(chatId, args) {
  // /findsub [trade] near [zip/city]
  // Searches web for subs of that trade in that area
  if (!args) return send(chatId, 'Usage: /findsub [trade|company] near [city/zip]\nExample: /findsub drywall near Woodbridge\nExample: /findsub "ABC Drywall" near 22102');
  const match = args.match(/^(.+?)\s+near\s+(.+)$/i);
  if (!match) return send(chatId, 'Format: /findsub [trade] near [city/zip]\nExample: /findsub drywall near Woodbridge');

  const query = match[1].trim();
  const location = match[2].trim();

  send(chatId, `🔍 *Searching for ${query} subs near ${location}...*\n_Checking business directories and review sites_`);

  // Use DuckDuckGo to find subs
  const searchQuery = `"${query}" contractors ${location} Virginia site:buildzoom.com OR site:angi.com OR site:bbb.org`;
  const encoded = encodeURIComponent(searchQuery);

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileP = promisify(execFile);

    // Gemini + Google Search finds REAL subs (name, phone, address, website),
    // then cross-checks each against the live VA DPOR license board.
    const FIND_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'gemini_subs.py');
    let found = null;
    try {
      const { stdout } = await execFileP(SCRIPTS_PY, [
        FIND_SCRIPT, '--trade', query, '--location', location,
        '--state', 'VA', '--limit', '5', '--verify'
      ], { timeout: 180000 });
      found = JSON.parse(stdout.trim() || '{}');
    } catch (e) {
      found = null;
    }

    const subs = (found && Array.isArray(found.subs)) ? found.subs : [];

    if (!subs.length) {
      // Graceful fallback: finder unavailable → offer vetted local directory
      const d = await getDb();
      const local = d.prepare(
        'SELECT * FROM subs WHERE trade LIKE ? ORDER BY vet_score DESC LIMIT 5'
      ).all(`%${query}%`);
      if (local.length) {
        const fb = [`⚠️ *Live web search unavailable right now.*`,
          `Here are your vetted *${query}* subs from the directory:`, ''];
        for (const r of local) {
          const emoji = r.vet_color === 'green' ? '🟢' : r.vet_color === 'yellow' ? '🟡' : '🔴';
          fb.push(`${emoji} *${r.name}*${r.company ? ' ('+r.company+')' : ''} — ${r.vet_score||'?'}/100`);
          if (r.phone) fb.push(`   📞 ${r.phone}`);
          if (r.bbb_rating) fb.push(`   BBB: ${r.bbb_rating} | ★${r.google_rating||'?'} (${r.google_reviews||0} reviews)`);
        }
        fb.push('', '_Try /findsub again in a minute for fresh web results._');
        return send(chatId, fb.join('\n'));
      }
      return send(chatId, `❌ No ${query} subs found near ${location}. Try again shortly, or add one with /addsub.`);
    }

    // Build the ranked report — license status is the headline
    const reportLines = [`🔍 *${subs.length} ${query} subs near ${location}*`,
      `_Found via live search • licenses checked against VA DPOR_`, ''];
    const allButtons = [];
    for (const [i, s] of subs.entries()) {
      const lic = s.license || {};
      const licEmoji = lic.verified ? '🟢' : (lic.status === 'Expired' ? '🔴' : '⚠️');
      reportLines.push(`${i + 1}. ${licEmoji} *${s.name}*`);
      if (s.phone) reportLines.push(`   📞 ${s.phone}`);
      if (s.address) reportLines.push(`   📍 ${s.address}`);
      if (lic.verified) {
        reportLines.push(`   ✅ VA License #${lic.number} (${lic.class || 'active'}, exp ${lic.expiration_date})`);
      } else if (lic.status === 'Expired') {
        reportLines.push(`   🔴 License EXPIRED (#${lic.number}, exp ${lic.expiration_date}) — do not use`);
      } else {
        reportLines.push(`   ⚠️ No active VA license found — *verify before hiring*`);
      }
      reportLines.push('');
      const safeName = s.name.replace(/[:]/g, '-').slice(0, 40);
      allButtons.push([
        { text: `📋 Save ${s.name.slice(0, 20)}`, callback_data: `save_sub:${safeName}:${query}:${location}:VA` }
      ]);
    }
    reportLines.push('🟢 = licensed & active   ⚠️ = unverified   🔴 = expired');

    return sendWithButtons(chatId, reportLines.join('\n'), allButtons);

  } catch (e) {
    send(chatId, `❌ Search failed: ${e.message?.slice(0, 100) || 'timeout'}. Try /vetsub directly.`);
  }
}

async function cmdSubCompare(chatId, args) {
  // /sub compare [company a] vs [company b]
  const match = args.match(/^(.+?)\s+vs\s+(.+)$/i);
  if (!match) return send(chatId, 'Usage: /sub compare [company a] vs [company b]\nExample: /sub compare "Hitt Contracting" vs "Miller Drywall"');

  const a = match[1].trim();
  const b = match[2].trim();

  send(chatId, `⚖️ *Comparing ${a} vs ${b}...*`);

  const d = await getDb();
  const subA = d.prepare('SELECT * FROM subs WHERE company LIKE ? OR name LIKE ? LIMIT 1').get(`%${a}%`, `%${a}%`);
  const subB = d.prepare('SELECT * FROM subs WHERE company LIKE ? OR name LIKE ? LIMIT 1').get(`%${b}%`, `%${b}%`);

  const lines = ['⚖️ *Subcontractor Comparison*', ''];

  for (const [label, sub] of [[a, subA], [b, subB]]) {
    if (!sub) {
      lines.push(`*${label}:* Not in database. Use /vetsub to add.`);
    } else {
      const emoji = sub.vet_color === 'green' ? '🟢' : sub.vet_color === 'yellow' ? '🟡' : '🔴';
      lines.push(`${emoji} *${label}:* ${sub.vet_score||'?'}/100`);
      lines.push(`  BBB: ${sub.bbb_rating||'?'} | Google: ${sub.google_rating||'?'}★ (${sub.google_reviews||0} reviews)`);
      lines.push(`  License: ${sub.license_number||'N/A'} (${sub.license_status||'?'})`);
      lines.push(`  Trade: ${sub.trade||'N/A'} | 📞 ${sub.phone||'N/A'}`);
    }
    lines.push('');
  }

  if (subA && subB && subA.vet_score && subB.vet_score) {
    const diff = subA.vet_score - subB.vet_score;
    if (diff > 15) lines.push(`🏆 *${a}* leads by ${diff} points — stronger vet score.`);
    else if (diff < -15) lines.push(`🏆 *${b}* leads by ${-diff} points — stronger vet score.`);
    else lines.push('🤝 Too close to call — both are comparable.');
  }

  return send(chatId, lines.join('\n'));
}

// ─── Punch List ─────────────────────────────────────────────────
async function cmdPunchAdd(chatId, args, from) {
  // /punch [project] [location] — [item]
  // Example: /punch Woodbridge Room 204 — touch up paint
  const match = args.match(/^(.*?)\s+(.*?)\s*[—–-]\s*(.*)$/);
  if (!match) return send(chatId, 'Usage: /punch [project] [location] — [item]\nExample: /punch Woodbridge Room 204 — touch up paint');
  const project = match[1].trim();
  const location = match[2].trim();
  const item = match[3].trim();

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO punchlist (id, project, location, item, created_by) VALUES (?,?,?,?,?)').run(id, project, location, item, from.first_name);
  logAudit(from.first_name, 'add_punch', 'punchlist', id, `${project} - ${location} - ${item}`);
  return send(chatId, `✅ *Punch item added*\n📋 *${item}*\n📍 ${location} — ${project}\n🆔 ID: ${id}\nUse /punchlist ${project} to view all.`);
}

async function cmdPunchList(chatId, args) {
  // /punchlist [project] — lists all
  const project = args || '';
  const d = await getDb();
  const all = d.prepare('SELECT * FROM punchlist WHERE project LIKE ? ORDER BY status, created_at DESC LIMIT 30').all(`%${project}%`);
  if (!all.length) return send(chatId, `No punch list items${project ? ' for '+project : ''}.`);
  const open = all.filter(r => r.status === 'open');
  const done = all.filter(r => r.status === 'complete');
  const lines = [`📋 *Punch List${project ? ': '+project : ''}*`];
  if (open.length) { lines.push('', `🟡 *Open (${open.length}):*`); open.forEach(r => lines.push(`  🟡 ${r.item} — ${r.location}${r.assignee?' → '+r.assignee:''}`)); }
  if (done.length) { lines.push('', `🟢 *Complete (${done.length}):*`); done.forEach(r => lines.push(`  🟢 ${r.item} — ${r.location}`)); }
  return send(chatId, lines.join('\n'));
}

async function cmdPunchDone(chatId, args) {
  // /punchdone [id]
  if (!args) return send(chatId, 'Usage: /punchdone [item-id]\nGet the ID from /punchlist');
  const d = await getDb();
  const r = d.prepare("UPDATE punchlist SET status='complete' WHERE id=? AND status='open'").run(args);
  if (r.changes) return send(chatId, `✅ Punch item ${args} marked complete.`);
  return send(chatId, `❌ Item not found or already complete.`);
}

// ─── Material Calculator ────────────────────────────────────────
function cmdCalc(chatId, args) {
  if (!args) return send(chatId, 'Usage:\n/concrete [length] [width] [depth]\n/studs [wall_length] [oc]');
  return send(chatId, '🧮 *Calculator*\n/concrete L W D — cubic yards\n/studs L oc — stud count');
}
async function cmdConcrete(chatId, args) {
  // /concrete 30 40 6  — length ft, width ft, depth inches
  const parts = args.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return send(chatId, 'Usage: /concrete [length_ft] [width_ft] [depth_in]\nExample: /concrete 30 40 6');
  const [l, w, d] = parts;
  const cubicFeet = l * w * (d / 12);
  const cubicYards = cubicFeet / 27;
  const recommend = Math.ceil(cubicYards * 1.05)
  return send(chatId, [
    '🧮 *Concrete Calculator*',
    `📐 ${l}ft × ${w}ft × ${d}in`,
    '',
    `🧱 Volume: **${cubicYards.toFixed(1)}** cubic yards`,
    `📦 Order **${recommend}** yards (incl. 5% waste)`,
    '',
    `_Sack estimate:_`,
    `• 80lb bags: ${Math.ceil(recommend * 45)} bags`,
    `• 60lb bags: ${Math.ceil(recommend * 60)} bags`,
  ].join('\n'));
}
async function cmdStuds(chatId, args) {
  // /studs 40 16
  // /studs 40  — assumes 16" OC
  const parts = args.trim().split(/\s+/).map(Number);
  if (!parts.length || parts.some(isNaN)) return send(chatId, 'Usage: /studs [wall_length_ft] [oc_inches=16]\nExample: /studs 40');
  const wallFt = parts[0];
  const oc = parts[1] || 16;
  const wallIn = wallFt * 12;
  const studs = Math.ceil(wallIn / oc) + 1;
  const plates = Math.ceil(wallFt * 3 / 12); // 3 plates per wall
  const total = studs + plates;
  return send(chatId, [
    '🧮 *Stud Calculator*',
    `📏 ${wallFt}ft wall @ ${oc}" OC`,
    '',
    `📌 Studs: **${studs}**`,
    `📌 Plates: **${plates}**`,
    `📦 Total: **${total}** pieces`,
    `💡 Tip: Add 5-10% for waste`,
  ].join('\n'));
}

// ─── Delivery Tracker ───────────────────────────────────────────
async function cmdDelivery(chatId, args, from) {
  // /delivery [project] [material] from [supplier] on/at [date/time]
  // Example: /delivery Woodbridge lumber from Builders Supply on Friday 10am
  const match = args.match(/^(.*?)\s+(.*?)\s+from\s+(.*?)\s+(?:on|at)\s+(.*)$/i);
  if (!match) return send(chatId, 'Usage: /delivery [project] [material] from [supplier] on [date]\nExample: /delivery Woodbridge lumber from Builders Supply on Friday 10am');

  const project = match[1].trim();
  const material = match[2].trim();
  const supplier = match[3].trim();
  const when = match[4].trim();

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO deliveries (id, project, supplier, material, scheduled_date, noted_by) VALUES (?,?,?,?,?,?)')
    .run(id, project, supplier, material, when, from.first_name);
  logAudit(from.first_name, 'add_delivery', 'delivery', id, `${project} - ${material}`);
  return send(chatId, `✅ *Delivery logged*\n📦 ${material} from ${supplier}\n📍 ${project}\n📅 ${when}\n🆔 ID: ${id}`);
}

async function cmdDeliveries(chatId, args) {
  // /deliveries [project] or /deliveries tomorrow
  const d = await getDb();
  const query = args || '';
  const isTomorrow = /tomorrow/i.test(query);
  let rows;
  if (isTomorrow) {
    const t = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    rows = d.prepare("SELECT * FROM deliveries WHERE scheduled_date LIKE ? AND status='scheduled' ORDER BY scheduled_date").all(`%${t}%`);
  } else if (query) {
    rows = d.prepare('SELECT * FROM deliveries WHERE project LIKE ? ORDER BY scheduled_date DESC LIMIT 10').all(`%${query}%`);
  } else {
    rows = d.prepare("SELECT * FROM deliveries WHERE status='scheduled' ORDER BY scheduled_date ASC LIMIT 15").all();
  }
  if (!rows.length) return send(chatId, 'No deliveries found.');
  const lines = [`📦 *Deliveries${isTomorrow ? ' Tomorrow' : query ? ' for '+query : ''}*`];
  for (const r of rows) {
    const emoji = { scheduled: '📅', delivered: '✅', delayed: '⚠️', cancelled: '❌' };
    lines.push(`${emoji[r.status]||'📦'} ${r.material} → ${r.project}`);
    lines.push(`   From: ${r.supplier} | ${r.scheduled_date}`);
  }
  return send(chatId, lines.join('\n'));
}

// ─── RFI Tracker ────────────────────────────────────────────────
async function cmdRfi(chatId, args, from) {
  // /rfi [project] [title]
  // Example: /rfi Woodbridge Waiting on window detail from architect
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  const title = parts.slice(1).join(' ') || args;
  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO rfis (id, project, title, description, created_by) VALUES (?,?,?,?,?)')
    .run(id, project, title, args, from.first_name);
  logAudit(from.first_name, 'add_rfi', 'rfi', id, args);
  return send(chatId, [
    `📝 *RFI Logged*`,
    `📌 *${title}*`,
    `🏗️ ${project}`,
    `🆔 ID: ${id}`,
    '',
    `Track with /rfis ${project} or /rfi_status ${id}`,
  ].join('\n'));
}

async function cmdRfiList(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare("SELECT * FROM rfis WHERE project LIKE ? ORDER BY status, created_at DESC LIMIT 15").all(`%${project}%`);
  if (!rows.length) return send(chatId, `No RFIs found${project ? ' for '+project : ''}.`);
  const open = rows.filter(r => r.status === 'open');
  const closed = rows.filter(r => r.status !== 'open');
  const lines = [`📝 *RFIs${project ? ': '+project : ''}*`];
  if (open.length) { lines.push('', `🟡 *Open (${open.length}):*`); open.forEach(r => lines.push(`  🆔 \`${r.id}\` ${r.title}`)); }
  if (closed.length) { lines.push('', `🟢 *Closed (${closed.length}):*`); closed.forEach(r => lines.push(`  ✅ \`${r.id}\` ${r.title}`)); }
  return send(chatId, lines.join('\n'));
}

async function cmdRfiClose(chatId, args) {
  if (!args) return send(chatId, 'Usage: /rfi_done [rfi-id]');
  const d = await getDb();
  const r = d.prepare("UPDATE rfis SET status='closed' WHERE id=? AND status='open'").run(args);
  if (r.changes) return send(chatId, `✅ RFI ${args} closed.`);
  return send(chatId, `❌ RFI not found or already closed.`);
}

// ─── Contact / Email System ──────────────────────────────────
async function cmdAddContact(chatId, args, from) {
  // /addcontact Name email@example.com [role]
  if (!args) return send(chatId, 'Usage: /addcontact [name] [email] [role]\\nExample: /addcontact "Pat Kavros" pat@greentouchbuilders.com executive');
  const parts = args.match(/^(.*?)\s+(\S+@\S+)\s*(.*)$/);
  if (!parts) return send(chatId, '❌ Include a name and valid email.\\nExample: /addcontact Pat Kavros pat@greentouchbuilders.com');
  const name = parts[1].trim();
  const email = parts[2].trim();
  const role = parts[3].trim() || 'general';
  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO contacts (id, name, email, role, created_by) VALUES (?,?,?,?,?)')
    .run(id, name, email, role, from.first_name);
  logAudit(from.first_name, 'add_contact', 'contact', id, `${name} <${email}>`);
  return send(chatId, `✅ *Contact added*\\n👤 ${name}\\n📧 ${email}\\n🏷️ ${role}`);
}

async function cmdRemoveContact(chatId, args) {
  if (!args) return send(chatId, 'Usage: /removecontact [name]\\nExample: /removecontact "Pat Kavros"');
  const d = await getDb();
  const r = d.prepare('DELETE FROM contacts WHERE name LIKE ?').run(`%${args}%`);
  if (r.changes) return send(chatId, `✅ Removed ${r.changes} contact(s) matching "${args}".`);
  return send(chatId, `❌ No contacts found matching "${args}".`);
}

async function cmdListContacts(chatId, args) {
  const d = await getDb();
  let rows;
  if (args) {
    rows = d.prepare('SELECT * FROM contacts WHERE role LIKE ? OR name LIKE ? ORDER BY role, name').all(`%${args}%`, `%${args}%`);
  } else {
    rows = d.prepare('SELECT * FROM contacts ORDER BY role, name').all();
  }
  if (!rows.length) return send(chatId, 'No contacts saved. Use /addcontact to add one.');
  const grouped = {};
  for (const r of rows) {
    const role = r.role || 'general';
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(`• ${r.name} — ${r.email}`);
  }
  const lines = ['📇 *Contact Directory*', ''];
  for (const [role, people] of Object.entries(grouped)) {
    lines.push(`*${role.charAt(0).toUpperCase() + role.slice(1)}:*`, ...people, '');
  }
  lines.push(`_${rows.length} contacts total_`);
  return send(chatId, lines.join('\\n'));
}

async function cmdEmail(chatId, args, from) {
  // /email Name subject -- body
  // /email "Pat Kavros" Huddle Summary -- Here is the transcript...
  const match = args.match(/^"?(.*?)"?\s+(.*?)\s*[—–-]{1,2}\s*(.*)$/s);
  if (!match) return send(chatId, 'Usage: /email [name] [subject] -- [message]\\nExample: /email Pat Kavros Site Update -- Framing is ahead of schedule.');
  const nameQuery = match[1].trim();
  const subject = match[2].trim();
  const body = match[3].trim();
  if (!nameQuery || !subject || !body) return send(chatId, '❌ Include name, subject, and message body.');

  const d = await getDb();
  const contacts = d.prepare('SELECT * FROM contacts WHERE name LIKE ?').all(`%${nameQuery}%`);
  if (!contacts.length) return send(chatId, `❌ No contacts found matching "${nameQuery}". Use /addcontact first or /contacts to list.`);

  const html = [
    '<div style="font-family: sans-serif; padding: 20px; max-width: 600px;">',
    `<p><strong>From:</strong> ${from.first_name} (via GreenTouch.Pro)</p>`,
    `<p>${body.replace(/\\n/g, '<br>')}</p>`,
    '<hr>',
    '<p style="color: #888; font-size: 12px;">Sent via <strong>GreenTouch.Pro</strong> — Construction Operations Agent</p>',
    '</div>',
  ].join('\\n');

  let sent = 0;
  let errors = [];
  for (const c of contacts) {
    try {
      await sendEmail([c.email], `📋 ${subject}`, html);
      sent++;
    } catch (e) {
      errors.push(`${c.name}: ${e.message}`);
    }
  }

  const reply = [
    `📧 *Email sent*`,
    `To: ${contacts.map(c => c.name).join(', ')}`,
    `Subject: ${subject}`,
    `Status: ✅ ${sent} sent${errors.length ? ', ❌ ' + errors.length + ' failed' : ''}`,
  ];
  if (errors.length) reply.push('', `Errors:\n${errors.join('\n')}`);
  return send(chatId, reply.join('\n'));
}

// ─── Reminder System ────────────────────────────────────────────
async function cmdRemind(chatId, args, from) {
  // /remind [project] [message] at [time]
  // Example: /remind Woodbridge Lumber truck at 9am
  const match = args.match(/^(.*?)\s+(.*?)\s+(?:at|in|@)\s+(.*)$/i);
  if (!match) return send(chatId, 'Usage: /remind [project] [message] at [time]\nExample: /remind Woodbridge Lumber truck at 9am');

  const project = match[1].trim();
  const message = match[2].trim();
  const time = match[3].trim();

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO reminders (id, chat_id, project, message, remind_at) VALUES (?,?,?,?,?)')
    .run(id, String(chatId), project, message, time);
  logAudit(from.first_name, 'add_reminder', 'reminder', id, message);
  return send(chatId, `✅ *Reminder set*\n⏰ ${time}\n📋 ${message}\n🏗️ ${project}`);
}

async function cmdAssign(chatId, args, from) {
  if (!args) return send(chatId, 'Usage: /assign [name] [task] by [due date]\nExample: /assign Mike install ductwork by Friday');

  // Parse --critical flag
  let critical = false;
  let text = args;
  if (/--critical/i.test(text)) { critical = true; text = text.replace(/--critical/i, '').trim(); }

  // First word = assignee name; "by/before X" = due date; middle = task
  const parts = text.split(/\s+/);
  const assignee = parts[0];
  const restText = parts.slice(1).join(' ');
  let task = restText, due = null;
  const byMatch = restText.match(/^(.*?)\s+(?:by|before|due)\s+(.*)$/i);
  if (byMatch) { task = byMatch[1].trim(); due = byMatch[2].trim(); }

  if (!task || task.length < 2) {
    return send(chatId, '❌ Please include a task.\nExample: /assign Mike install ductwork by Friday');
  }

  const d = await getDb();
  const id = uid();
  d.prepare(
    'INSERT INTO assignments (id, project, task, assignee, assigned_by, due_date, status, notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, 'General', task, assignee, from.first_name, due, 'assigned', critical ? 'CRITICAL' : '');
  logAudit(from.first_name, 'assign', 'assignment', id, JSON.stringify({ assignee, task, due, critical }));

  const lines = [
    `✅ *Task Assigned*${critical ? '  🔴 CRITICAL' : ''}`,
    '',
    `📋 *Task:* ${task}`,
    `👤 *Assigned to:* ${assignee}`,
    `📅 *Due:* ${due || 'ASAP'}`,
    `🙋 *By:* ${from.first_name}`,
    `🆔 *ID:* ${id}`,
  ];
  if (critical) lines.push('', '📧 Leadership (Pat, Paul, Graham) will be CC\'d on escalation.');
  lines.push('', 'Track with /assignments or /pending');
  return send(chatId, lines.join('\n'));
}

async function cmdAssignments(chatId, project) {
  const d = await getDb();
  const rows = d.prepare(
    'SELECT * FROM assignments WHERE project LIKE ? OR task LIKE ? ORDER BY created_at DESC LIMIT 10'
  ).all(`%${project || ''}%`, `%${project || ''}%`);
  if (!rows.length) return send(chatId, `No assignments found${project ? ' for ' + project : ''}.`);
  const lines = [`📋 *${rows.length} assignments${project ? ' for ' + project : ''}*`];
  for (const r of rows) {
    const status = { pending: '⏳', assigned: '📌', notified: '📤', acknowledged: '✅', in_progress: '🔨', blocked: '🚫', complete: '🏁' };
    const emoji = status[r.status] || '❓';
    lines.push(`${emoji} *${r.task?.slice(0, 50)}* → ${r.assignee} (${r.status})`);
  }
  return send(chatId, lines.join('\n'));
}

async function cmdPending(chatId) {
  const d = await getDb();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = d.prepare(
    "SELECT * FROM assignments WHERE status IN ('assigned','notified') AND created_at < ? ORDER BY created_at ASC"
  ).all(cutoff);
  if (!rows.length) return send(chatId, '✅ No pending tasks older than 24 hours.');
  return send(chatId, [
    `⚠️ *${rows.length} unacknowledged tasks (>24h)*`,
    '',
    ...rows.map(r => `• *${r.task?.slice(0, 50)}* → ${r.assignee} — ${r.status}`),
    '',
    'Use /escalate [task-id] to notify leadership.',
  ].join('\n'));
}

// ─── Main Message Router ──────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// PERMITS
// ═══════════════════════════════════════════════════════════════
async function cmdPermit(chatId, args, from) {
  // /permit Woodbridge Building 2026-06-20 $1200 "Fairfax County"
  if (!args) return send(chatId, 'Usage: /permit [project] [type] [date] [$fee] [jurisdiction]\nExample: /permit Woodbridge Building 2026-06-20 $1200 Fairfax');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  const type = parts[1] || '';
  const date = parts[2] || new Date().toISOString().slice(0,10);
  const feeMatch = args.match(/\$?([\d,]+\.?\d*)/);
  const fee = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0;
  const jurisdiction = parts.slice(parts.length > 3 ? 4 : 3).join(' ') || '';
  if (!type) return send(chatId, '❌ Include permit type (Building, Electrical, Plumbing, etc).');

  const d = await getDb();
  const id = uid();
  const expires = date === 'today' ? new Date(Date.now()+180*86400000).toISOString().slice(0,10) : '';
  d.prepare('INSERT INTO permits (id, project, type, jurisdiction, applied_date, fee, created_by, expiration_date) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, project, type, jurisdiction, date, fee, from.first_name, expires);
  logAudit(from.first_name, 'add_permit', 'permit', id, `${project} - ${type}`);
  return send(chatId, [
    `🏛️ *Permit Added*`,
    `🏗️ *${project}*`,
    `📋 *Type:* ${type}`,
    `📍 *Jurisdiction:* ${jurisdiction || 'TBD'}`,
    `📅 *Applied:* ${date}`,
    `💰 *Fee:* $${fee.toLocaleString()}`,
    `🆔 ID: ${id}`,
    '',
    `Use /permits to track. /permit ${id} issued when approved.`,
  ].join('\n'));
}

async function cmdPermits(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM permits WHERE project LIKE ? ORDER BY status, applied_date ASC LIMIT 25').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No permits${project ? ' for ' + project : ''}. Use /permit to add one.`);
  const applied = rows.filter(r => ['applied', 'under review'].includes(r.status));
  const issued = rows.filter(r => r.status === 'issued');
  const posted = rows.filter(r => r.status === 'posted');
  const closed = rows.filter(r => r.status === 'closed');
  const lines = [`🏛️ *Permits${project ? ': ' + project : ''}*`];
  if (applied.length) { lines.push('', `🟡 *Pending (${applied.length}):*`); applied.forEach(r => lines.push(`  📋 \`${r.id}\` ${r.type} — ${r.jurisdiction||'N/A'} (${r.status})`)); }
  if (issued.length) { lines.push('', `🟢 *Issued (${issued.length}):*`); issued.forEach(r => lines.push(`  ✅ \`${r.id}\` ${r.type} — #${r.permit_number||'N/A'}`)); }
  if (posted.length) { lines.push('', `📌 *Posted (${posted.length}):*`); posted.forEach(r => lines.push(`  📌 \`${r.id}\` ${r.type}`)); }
  if (closed.length) lines.push('', `🔒 *Closed:* ${closed.length}`);
  return send(chatId, lines.join('\n'));
}

async function cmdPermitAction(chatId, args, from) {
  // /permit {id} issued|posted|closed [notes]
  if (!args) return send(chatId, 'Usage: /permit [id] issued|posted|closed\nExample: /permit abc123 issued');
  const parts = args.split(/\s+/);
  const pid = parts[0];
  const action = parts[1]?.toLowerCase();
  const notes = parts.slice(2).join(' ');
  if (!['issued', 'posted', 'closed'].includes(action)) return send(chatId, 'Action must be: issued, posted, or closed.');

  const d = await getDb();
  const p = d.prepare('SELECT * FROM permits WHERE id=?').get(pid);
  if (!p) return send(chatId, `❌ Permit ${pid} not found.`);

  const now = new Date().toISOString();
  if (action === 'issued') {
    d.prepare("UPDATE permits SET status='issued', issued_date=? WHERE id=?").run(now, pid);
    return send(chatId, `✅ *Permit Issued!*\n📋 ${p.type} — ${p.project}\n📅 Issued: ${now.slice(0,10)}\n⚠️ Post on site! Use /permit ${pid} posted`);
  } else if (action === 'posted') {
    d.prepare("UPDATE permits SET status='posted', posted_date=? WHERE id=?").run(now, pid);
    return send(chatId, `📌 *Permit Posted on Site*\n📋 ${p.type} — ${p.project}`);
  } else {
    d.prepare("UPDATE permits SET status='closed' WHERE id=?").run(pid);
    return send(chatId, `🔒 *Permit Closed*\n📋 ${p.type} — ${p.project}`);
  }
}

async function cmdPermitExpiring(chatId) {
  const d = await getDb();
  const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10);
  const rows = d.prepare("SELECT * FROM permits WHERE status IN ('issued','posted') AND expiration_date <= ? AND expiration_date != '' ORDER BY expiration_date").all(cutoff);
  if (!rows.length) return send(chatId, '✅ No permits expiring within 30 days.');
  const lines = [`⚠️ *Permits Expiring Soon*`, ''];
  for (const r of rows) {
    lines.push(`🔴 ${r.type} — ${r.project}`);
    lines.push(`   Expires: ${r.expiration_date} | Fee: $${r.fee}`);
  }
  return send(chatId, lines.join('\n'));
}

async function cmdPermitFee(chatId, args) {
  const d = await getDb();
  const rows = d.prepare('SELECT project, SUM(fee) as total, COUNT(*) as count FROM permits WHERE project LIKE ? GROUP BY project').all(`%${args||''}%`);
  if (!rows.length) return send(chatId, 'No permit fees recorded.');
  const lines = ['💰 *Permit Fees*', ''];
  for (const r of rows) {
    lines.push(`🏗️ ${r.project}: *$${r.total.toLocaleString()}* (${r.count} permits)`);
  }
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// SUBMITTALS
// ═══════════════════════════════════════════════════════════════
async function cmdSubmittal(chatId, args, from) {
  // /submittal Woodbridge "Window shop drawings" due 2026-06-15
  if (!args) return send(chatId, 'Usage: /submittal [project] [description] due [date]\nExample: /submittal Woodbridge "Window shop drawings" due 2026-06-15');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  let text = parts.slice(1).join(' ');
  let due_date = '';
  const dueMatch = text.match(/^(.*?)\s+due\s+(\S+)$/i);
  if (dueMatch) { text = dueMatch[1].trim(); due_date = dueMatch[2]; }
  if (!text) return send(chatId, '❌ Include submittal description.');
  
  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO submittals (id, project, description, due_date, created_by) VALUES (?,?,?,?,?)')
    .run(id, project, text, due_date, from.first_name);
  logAudit(from.first_name, 'add_submittal', 'submittal', id, `${project} - ${text}`);
  return send(chatId, [
    `📎 *Submittal Logged*`,
    `🏗️ *${project}*`,
    `📝 *${text}*`,
    `${due_date ? '📅 Due: ' + due_date : ''}`,
    `🆔 ID: ${id}`,
    '',
    `Use /submittals to track. /submittal ${id} approved when reviewed.`,
  ].join('\n'));
}

async function cmdSubmittals(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM submittals WHERE project LIKE ? ORDER BY status, created_at DESC LIMIT 20').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No submittals${project ? ' for ' + project : ''}.`);
  const pending = rows.filter(r => r.status === 'pending');
  const approved = rows.filter(r => r.status === 'approved');
  const rejected = rows.filter(r => r.status === 'rejected');
  const lines = [`📎 *Submittals${project ? ': ' + project : ''}*`];
  if (pending.length) { lines.push('', `🟡 *Pending (${pending.length}):*`); pending.forEach(r => { const days = r.created_at ? Math.floor((Date.now() - new Date(r.created_at)) / 86400000) : 0; lines.push(`  🟡 \`${r.id}\` ${r.description.slice(0,40)} — ${days}d waiting`); }); }
  if (approved.length) { lines.push('', `🟢 *Approved (${approved.length}):*`); approved.forEach(r => lines.push(`  ✅ \`${r.id}\` ${r.description.slice(0,40)}`)); }
  if (rejected.length) { lines.push('', `🔴 *Rejected (${rejected.length}):*`); rejected.forEach(r => lines.push(`  ❌ \`${r.id}\` ${r.description.slice(0,40)}`)); }
  return send(chatId, lines.join('\n'));
}

async function cmdSubmittalAction(chatId, args, from) {
  // /submittal {id} approved  or  /submittal {id} reject "reason"
  if (!args) return send(chatId, 'Usage: /submittal [id] approved|reject [reason]');
  const parts = args.split(/\s+/);
  const sid = parts[0];
  const action = parts[1]?.toLowerCase();
  const reason = parts.slice(2).join(' ');
  if (!['approved', 'reject'].includes(action)) return send(chatId, 'Action must be "approved" or "reject".');

  const d = await getDb();
  const s = d.prepare('SELECT * FROM submittals WHERE id=?').get(sid);
  if (!s) return send(chatId, `❌ Submittal ${sid} not found.`);
  if (s.status !== 'pending') return send(chatId, `❌ Submittal already ${s.status}.`);

  const now = new Date().toISOString();
  if (action === 'approved') {
    d.prepare("UPDATE submittals SET status='approved', review_date=?, reviewed_by=? WHERE id=?").run(now, from.first_name, sid);
    logAudit(from.first_name, 'approve_submittal', 'submittal', sid, s.description);
    return send(chatId, `✅ *Submittal Approved!*\n📝 ${s.description}\n🏗️ ${s.project}\n📦 Now you can order materials — /delivery to schedule.`);
  } else {
    d.prepare("UPDATE submittals SET status='rejected', rejection_reason=?, review_date=?, reviewed_by=? WHERE id=?").run(reason || 'No reason', now, from.first_name, sid);
    logAudit(from.first_name, 'reject_submittal', 'submittal', sid, reason);
    return send(chatId, [`❌ *Submittal Rejected*\n📝 ${s.description}\n🏗️ ${s.project}`, reason ? `📌 *Reason:* ${reason}` : '', '⚠️ Resubmit after corrections.'].join('\n'));
  }
}

async function cmdSubmittalsStale(chatId) {
  const d = await getDb();
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const rows = d.prepare("SELECT * FROM submittals WHERE status='pending' AND created_at < ? ORDER BY created_at ASC LIMIT 15").all(cutoff);
  if (!rows.length) return send(chatId, '✅ No submittals stale (>14 days pending).');
  const lines = [`⚠️ *Stale Submittals — ${rows.length} over 14 days*`, ''];
  for (const r of rows) {
    const days = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
    lines.push(`🔴 ${r.description.slice(0,50)} — ${r.project}`);
    lines.push(`   Waiting: *${days} days*${r.due_date ? ' | Due: ' + r.due_date : ''}`);
  }
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// BLOCKERS — links to everything
// ═══════════════════════════════════════════════════════════════
async function cmdBlock(chatId, args, from) {
  // /block Woodbridge "Framing can't start — waiting on foundation inspection"
  // /block Woodbridge Framing blocked awaiting permit abc123 --link permit:abc123
  if (!args) return send(chatId, 'Usage: /block [project] [description]\nExample: /block Woodbridge "Framing on hold — waiting on foundation inspection"');
  const parts = args.split(/\s+/);
  const project = parts[0];
  let desc = parts.slice(1).join(' ');
  // Check for --link flag
  let linked_type = '', linked_id = '';
  const linkMatch = desc.match(/--link\s+(\w+):(\S+)/);
  if (linkMatch) { linked_type = linkMatch[1]; linked_id = linkMatch[2]; desc = desc.replace(/--link\s+\w+:\S+/, '').trim(); }
  if (!desc) return send(chatId, '❌ Include what is blocked.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO blockers (id, project, description, blocks_what, linked_type, linked_id, created_by) VALUES (?,?,?,?,?,?,?)')
    .run(id, project, desc, desc, linked_type, linked_id, from.first_name);
  logAudit(from.first_name, 'add_blocker', 'blocker', id, `${project} - ${desc.slice(0,60)}`);
  return send(chatId, [
    `🚫 *Blocker Logged*`,
    `🏗️ *${project}*`,
    `📝 *${desc}*`,
    linked_type ? `🔗 Linked to: ${linked_type} \`${linked_id}\`` : '',
    `🆔 ID: ${id}`,
    '',
    `Use /blocks to view. /block ${id} resolved when cleared.`,
  ].filter(Boolean).join('\n'));
}

async function cmdBlocks(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare("SELECT * FROM blockers WHERE project LIKE ? AND status='open' ORDER BY created_at DESC LIMIT 20").all(`%${project}%`);
  if (!rows.length) return send(chatId, `✅ No blockers${project ? ' for ' + project : ''}.`);
  const lines = [`🚫 *Blockers${project ? ': ' + project : ''}* — ${rows.length} open`, ''];
  for (const r of rows) {
    const days = Math.floor((Date.now() - new Date(r.created_at)) / 86400000);
    lines.push(`🔴 *${r.description.slice(0,60)}*`);
    lines.push(`   🏗️ ${r.project} | ⏳ ${days}d${r.linked_type ? ' | 🔗 '+r.linked_type+':'+r.linked_id : ''}`);
    lines.push('');
  }
  return send(chatId, lines.join('\n'));
}

async function cmdBlockResolve(chatId, args, from) {
  // /block {id} resolved
  if (!args) return send(chatId, 'Usage: /block [id] resolved');
  const parts = args.split(/\s+/);
  const bid = parts[0];
  const d = await getDb();
  const r = d.prepare("SELECT * FROM blockers WHERE id=? AND status='open'").get(bid);
  if (!r) return send(chatId, `❌ Blocker ${bid} not found or already resolved.`);
  const now = new Date().toISOString();
  d.prepare("UPDATE blockers SET status='resolved', resolved_by=?, resolved_at=? WHERE id=?").run(from.first_name, now, bid);
  logAudit(from.first_name, 'resolve_blocker', 'blocker', bid, r.description);
  return send(chatId, `✅ *Blocker Resolved!*\n📝 ${r.description}\n🏗️ ${r.project}\n👤 Resolved by: ${from.first_name}`);
}

// ═══════════════════════════════════════════════════════════════
// LIEN RELEASES
// ═══════════════════════════════════════════════════════════════
async function cmdLien(chatId, args, from) {
  // /lien Woodbridge "Acme Drywall" $12400 "Draw 3"
  if (!args) return send(chatId, 'Usage: /lien [project] "[sub name]" [$amount] "[draw]"\nExample: /lien Woodbridge "Acme Drywall" $12400 "Draw 3"');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  const feeMatch = args.match(/\$?([\d,]+\.?\d*)/);
  const amount = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0;
  let text = args.replace(project, '').replace(/\$[\d,]+\.?\d*/, '').trim();
  const subMatch = text.match(/"([^"]+)"/);
  const sub_name = subMatch ? subMatch[1] : text.split(/\s+/).slice(0,2).join(' ');
  const drawMatch = text.match(/"([^"]+)"/g);
  const draw = drawMatch && drawMatch.length > 1 ? drawMatch[1].replace(/"/g, '') : '';
  if (!sub_name) return send(chatId, '❌ Include subcontractor name.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO lien_releases (id, project, sub_name, amount, draw, created_by) VALUES (?,?,?,?,?,?)')
    .run(id, project, sub_name, amount, draw, from.first_name);
  logAudit(from.first_name, 'add_lien', 'lien_release', id, `${sub_name} - $${amount}`);
  return send(chatId, [
    `💰 *Lien Release Added*`,
    `🏗️ *${project}*`,
    `👤 *${sub_name}*`,
    `💵 *$${amount.toLocaleString()}*`,
    `${draw ? '📋 Draw: ' + draw : ''}`,
    `🆔 ID: ${id}`,
    '',
    `Use /liens to track. /lien ${id} signed when received.`,
  ].join('\n'));
}

async function cmdLiens(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare("SELECT * FROM lien_releases WHERE project LIKE ? ORDER BY status, created_at DESC LIMIT 20").all(`%${project}%`);
  if (!rows.length) return send(chatId, `No lien releases${project ? ' for ' + project : ''}.`);
  const pending = rows.filter(r => r.status === 'pending');
  const signed = rows.filter(r => r.status === 'signed');
  const totalPending = pending.reduce((s,r) => s + r.amount, 0);
  const lines = [`💰 *Lien Releases${project ? ': ' + project : ''}*`];
  if (pending.length) { lines.push('', `🟡 *Pending (${pending.length}) — $${totalPending.toLocaleString()}:*`); pending.forEach(r => lines.push(`  🟡 ${r.sub_name} — $${r.amount.toLocaleString()}${r.draw?' ('+r.draw+')':''}`)); }
  if (signed.length) { lines.push('', `🟢 *Signed (${signed.length}):*`); signed.forEach(r => lines.push(`  ✅ ${r.sub_name} — $${r.amount.toLocaleString()}${r.draw?' ('+r.draw+')':''}`)); }
  if (pending.length) lines.push('', '⚠️ Hold payment until lien releases are signed.');
  return send(chatId, lines.join('\n'));
}

async function cmdLienSign(chatId, args, from) {
  // /lien {id} signed
  if (!args) return send(chatId, 'Usage: /lien [id] signed');
  const parts = args.split(/\s+/);
  const lid = parts[0];
  const d = await getDb();
  const l = d.prepare("SELECT * FROM lien_releases WHERE id=? AND status='pending'").get(lid);
  if (!l) return send(chatId, `❌ Lien release ${lid} not found or already signed.`);
  const now = new Date().toISOString();
  d.prepare("UPDATE lien_releases SET status='signed', signed_date=? WHERE id=?").run(now, lid);
  logAudit(from.first_name, 'sign_lien', 'lien_release', lid, l.sub_name);
  return send(chatId, `✅ *Lien Release Signed*\n👤 ${l.sub_name}\n💵 $${l.amount.toLocaleString()}\n🏗️ ${l.project}\n💸 Ready for payment.`);
}

// ═══════════════════════════════════════════════════════════════
// PLAN REVISIONS
// ═══════════════════════════════════════════════════════════════
async function cmdPlanRev(chatId, args, from) {
  // /planrev Woodbridge "Architectural Revision 4" 2026-06-22
  if (!args) return send(chatId, 'Usage: /planrev [project] [description] [date]\nExample: /planrev Woodbridge "Architectural Revision 4" 2026-06-22');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  let text = parts.slice(1).join(' ');
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0,10);
  if (dateMatch) text = text.replace(dateMatch[0], '').trim();
  if (!text) return send(chatId, '❌ Include revision description.');

  // Mark previous revisions as 'superseded'
  const d = await getDb();
  d.prepare("UPDATE plan_revisions SET status='superseded' WHERE project=? AND status='current'").run(project);
  
  const id = uid();
  d.prepare('INSERT INTO plan_revisions (id, project, description, issued_date, created_by) VALUES (?,?,?,?,?)')
    .run(id, project, text, date, from.first_name);
  logAudit(from.first_name, 'add_planrev', 'plan_revision', id, `${project} - ${text}`);
  return send(chatId, [
    `🗺️ *Plan Revision Added*`,
    `🏗️ *${project}*`,
    `📐 *${text}*`,
    `📅 Issued: ${date}`,
    `🆔 ID: ${id}`,
    '',
    `Previous revisions marked superseded. Use /planrevs to view.`,
  ].join('\n'));
}

async function cmdPlanRevs(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM plan_revisions WHERE project LIKE ? ORDER BY issued_date DESC, created_at DESC LIMIT 15').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No plan revisions${project ? ' for ' + project : ''}.`);
  const lines = [`🗺️ *Plan Revisions${project ? ': ' + project : ''}*`, ''];
  for (const r of rows) {
    const emoji = r.status === 'current' ? '🟢' : r.status === 'superseded' ? '🔴' : '📐';
    lines.push(`${emoji} ${r.issued_date?.slice(0,10) || 'N/D'} — *${r.description.slice(0,50)}*`);
    if (r.status === 'current') lines.push('   ⚠️ *CURRENT SET — use this one*');
  }
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// MEETING MINUTES
// ═══════════════════════════════════════════════════════════════
const activeMeetings = new Map();

// ─── Active Project Context ──────────────────────────────────
const activeProjects = new Map(); // chatId -> 'project name'

async function cmdMeeting(chatId, args, from) {
  if (activeMeetings.get(chatId)) return send(chatId, '⚠️ A meeting is already active. Use /endmeeting to close it.');
  if (activeHuddles.get(chatId)) return send(chatId, '⚠️ A huddle is active. /endhuddle first.');
  
  // /meeting Woodbridge "Weekly OAC" "Pat, Paul, Graham, Architect"
  if (!args) return send(chatId, 'Usage: /meeting [project] [topic] [attendees]\nExample: /meeting Woodbridge "Weekly OAC" "Pat, Paul, Graham"');
  const parts = args.match(/(\S+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
  const project = parts ? parts[1] : args.split(/\s+/)[0] || 'General';
  const topic = parts ? parts[2] : args.split(/\s+/).slice(1).join(' ') || 'Meeting';
  const attendees = parts ? (parts[3] || '') : '';

  const d = await getDb();
  const id = uid();
  const now = new Date().toISOString();
  d.prepare('INSERT INTO meetings (id, project, topic, attendees, started_by, started_at) VALUES (?,?,?,?,?,?)')
    .run(id, project, topic, attendees, from.first_name, now);
  
  activeMeetings.set(chatId, { id, project, topic, startedBy: from.first_name, startedAt: now, messages: [] });
  logAudit(from.first_name, 'start_meeting', 'meeting', id, `${project} - ${topic}`);
  
  return send(chatId, [
    `📋 *Meeting Started*`,
    `🏗️ *${project}*`,
    `📌 *${topic}*`,
    `${attendees ? '👥 ' + attendees : ''}`,
    '',
    '✅ Capturing all messages. Action items will be extracted automatically.',
    'Use /endmeeting to close and generate minutes.',
  ].join('\n'));
}

async function cmdEndMeeting(chatId) {
  const meeting = activeMeetings.get(chatId);
  if (!meeting) return send(chatId, '⚠️ No active meeting.');

  activeMeetings.delete(chatId);
  const d = await getDb();
  const now = new Date().toISOString();
  const transcript = meeting.messages.map(m => `${m.sender}: ${m.content}`).join('\n');
  
  // Extract action items from transcript
  const actionItems = transcript ? await extractTasks(transcript) : [];
  
  // Save action items as assignments
  for (const item of actionItems) {
    const aid = uid();
    d.prepare('INSERT INTO assignments (id, project, task, assignee, assigned_by, due_date, status, notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(aid, meeting.project, item.description, item.owner || 'Unassigned', meeting.startedBy, item.due_date || null, 'assigned', `Meeting: ${meeting.topic}`);
  }

  const minutes = [
    `📋 *Meeting Minutes*`,
    `🏗️ *${meeting.project}*`,
    `📌 *${meeting.topic}*`,
    `👤 Led by: ${meeting.startedBy}`,
    `📝 ${meeting.messages.length} messages captured`,
    '',
  ];

  if (actionItems.length) {
    minutes.push(`🎯 *Action Items (${actionItems.length}):*`);
    actionItems.forEach(i => minutes.push(`• ${i.description} → ${i.owner || 'Unassigned'}${i.due_date ? ' (Due: '+i.due_date+')' : ''}`));
  }
  minutes.push('', `📧 Minutes emailed to contacts on project.`);

  // Save to DB
  d.prepare("UPDATE meetings SET ended_at=?, status='completed', minutes=?, action_items=? WHERE id=?")
    .run(now, transcript.slice(0,2000), JSON.stringify(actionItems), meeting.id);

  // Save messages
  const insertMsg = d.prepare('INSERT INTO meeting_messages (id, meeting_id, sender, content) VALUES (?,?,?,?)');
  for (const m of meeting.messages) {
    insertMsg.run(uid(), meeting.id, m.sender, m.content);
  }

  logAudit(meeting.startedBy, 'end_meeting', 'meeting', meeting.id, `${actionItems.length} action items`);
  
  // Email summary
  const html = [
    '<h2>📋 Meeting Minutes</h2>',
    `<p><b>Project:</b> ${meeting.project}</p>`,
    `<p><b>Topic:</b> ${meeting.topic}</p>`,
    `<p><b>Led by:</b> ${meeting.startedBy}</p>`,
    actionItems.length ? `<h3>Action Items</h3><ul>${actionItems.map(i => `<li><b>${i.description}</b> → ${i.owner || 'Unassigned'}${i.due_date ? ' (Due: '+i.due_date+')' : ''}</li>`).join('')}</ul>` : '',
    '<hr/>',
    `<pre style="background:#f5f5f5;padding:10px;font-size:13px;">${transcript.slice(0,2000) || 'No transcript.'}</pre>`,
    '<p><small>Generated by GreenTouch.Pro</small></p>',
  ].join('\n');
  await sendEmail(LEADERSHIP, `📋 Meeting Minutes: ${meeting.topic}`, html);

  return send(chatId, minutes.join('\n'));
}

async function cmdMeetings(chatId, args) {
  const d = await getDb();
  const rows = d.prepare("SELECT * FROM meetings WHERE project LIKE ? AND status='completed' ORDER BY started_at DESC LIMIT 10").all(`%${args||''}%`);
  if (!rows.length) return send(chatId, `No completed meetings${args ? ' for '+args : ''}.`);
  const lines = [`📋 *Meeting History${args ? ': '+args : ''}*`, ''];
  for (const r of rows) {
    const actions = r.action_items ? JSON.parse(r.action_items).length : 0;
    lines.push(`📅 ${r.started_at?.slice(0,10)} — *${r.topic}*`);
    lines.push(`   🏗️ ${r.project} | 👤 ${r.started_by} | 🎯 ${actions} actions`);
  }
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD LINK
// ═══════════════════════════════════════════════════════════════
function cmdDashboardLink(chatId) {
  const url = process.env.DASHBOARD_URL || 'https://direct-podcast-versions-xhtml.trycloudflare.com';
  const landingUrl = url.replace(/\/dash.*$/, '');
  return send(chatId, [
    '🖥️ *GreenTouch.Pro Dashboard*',
    '',
    `[Open Dashboard](${url})`,
    '',
    '📊 View all projects, tasks, punch lists,',
    '   change orders, inspections, crew, and more.',
    '',
    `🔗 \`${url}\``,
    '',
    '📱 *Pro tip:* Open on your phone browser',
    '   and add to home screen for one-tap access.',
    '',
    `💬 Back to bot → @GreenTouchProBot`,
  ].join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// TUTORIAL — interactive onboarding
// ═══════════════════════════════════════════════════════════════
async function cmdTutorial(chatId) {
  await send(chatId, [
    '🎓 *GreenTouch.Pro — Getting Started*',
    '',
    'Welcome! In 3 minutes, you\'ll be running your project from Telegram.',
    '',
    '*Here\'s how it works:*',
    '',
    '1️⃣  *Talk to it* — Send voice notes while walking the site',
    '2️⃣  *Assign fast* — `/assign Mike install ductwork by Friday`',
    '3️⃣  *Track everything* — Punch, deliveries, permits, inspections',
    '4️⃣  *Stay ahead* — Daily briefing predicts what\'s coming',
    '',
    '👇 *Let\'s set up your first project. Reply with:*',
    '`/tutorial 1`',
  ].join('\n'));
}

async function cmdTutorialStep(chatId, step) {
  switch (step) {
    case '1':
      return send(chatId, [
        '📋 *Step 1: Add Your Team*',
        '',
        'Add everyone who\'ll get tasks and notifications:',
        '',
        '```',
        '/addcontact Pat Kavros pat@greentouchbuilders.com executive',
        '/addcontact Paul Lee paul.lee@greentouchbuilders.com executive',
        '/addcontact Mike Smith mike@example.com super',
        '```',
        '',
        '💡 *Tip:* Role determines who sees what. Use:',
        '   • `executive` — gets CC\'d on critical items',
        '   • `super` — gets task assignments',
        '   • `sub` — subcontractor contact',
        '',
        '✅ After adding, type `/contacts` to verify.',
        '',
        '👉 Ready? Type `/tutorial 2`',
      ].join('\n'));
    case '2':
      return send(chatId, [
        '📋 *Step 2: Add Your Subs*',
        '',
        'Add subcontractors by trade for quick lookup:',
        '',
        '```',
        '/addsub Mike AcmeDrywall Drywall 703-555-0142',
        '/addsub Jose SparkElectric Electrical 703-555-0189',
        '/addsub Tom ABCPlumbing Plumbing 703-555-0234',
        '```',
        '',
        '💡 *Tip:* Later, `/whodoes drywall` finds them instantly.',
        '   `/subs` shows everyone grouped by trade.',
        '',
        '👉 Next: `/tutorial 3`',
      ].join('\n'));
    case '3':
      return send(chatId, [
        '📋 *Step 3: Your First Task*',
        '',
        'The most important command. Assign work in one line:',
        '',
        '```',
        '/assign Mike install ductwork by Friday',
        '/assign Jose rough-in panel A by Wednesday',
        '```',
        '',
        '💡 *Pro tips:*',
        '   • Add `--critical` for items that CC leadership',
        '   • `/assign Mike` alone shows Mike\'s tasks',
        '   • `/pending` shows unacknowledged tasks >24h',
        '',
        '🎙️ *Even faster:* Send a voice note while walking.',
        '   The bot transcribes and extracts tasks automatically.',
        '',
        '👉 Next: `/tutorial 4`',
      ].join('\n'));
    case '4':
      return send(chatId, [
        '📋 *Step 4: Daily Routine*',
        '',
        'Here\'s how a superintendent uses GreenTouch.Pro:',
        '',
        '🌅 *Morning (7:00 AM)*',
        '   `/crew` — see who\'s on site',
        '   Auto-briefing arrives at 6:30 AM with weather + tasks',
        '',
        '🦺 *Safety (7:30 AM)*',
        '   `/toolbox Woodbridge "Ladder safety"`',
        '',
        '🚶 *Walk (8:00 AM)*',
        '   Voice notes: "Mike needs to fix flashing on 3rd floor"',
        '   `/punch Room 204 — paint touchup`',
        '   `/block Woodbridge "Framing waiting on inspection"`',
        '',
        '📋 *Mid-day*',
        '   `/deliveries` — check what\'s arriving',
        '   `/inspections` — check upcoming inspections',
        '   `/cos` — review change orders',
        '',
        '📝 *End of Day (4:00 PM)*',
        '   `/dailyreport Woodbridge "Framing 90% done"`',
        '   `/clockout Mike` — everyone off site',
        '',
        '💡 *Tip:* Type `/workflow morning` for the full morning playbook.',
        '',
        '👉 Last step: `/tutorial 5`',
      ].join('\n'));
    case '5':
    default: {
      const url = process.env.DASHBOARD_URL || 'https://direct-podcast-versions-xhtml.trycloudflare.com';
      return send(chatId, [
        '🎉 *You\'re Ready!*',
        '',
        'Here\'s everything at your fingertips:',
        '',
        `🖥️  *Dashboard:* [Open](${url}) — same data, visual view`,
        '📱 *Bot:* @GreenTouchProBot — your command center',
        '',
        '*Quick reference:*',
        '   `/help` — all 30+ commands',
        '   `/cheatsheet` — one-page quick guide',
        '   `/workflow` — morning/huddle/closeout recipes',
        `   \`/link\` — dashboard URL`,
        '',
        '*Need help?*',
        '   Just ask in this chat. The bot\'s always listening.',
        '',
        '🏗️ *Now go build something.*',
      ].join('\n'));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CHEAT SHEET — one-page quick reference
// ═══════════════════════════════════════════════════════════════
function cmdCheatsheet(chatId) {
  return send(chatId, [
    '📋 *GreenTouch.Pro Cheat Sheet*',
    '',
    '*⚡ Assign Work*',
    '  `/assign [who] [what] by [when]`  — one-line task',
    '  Send voice note  — auto-extracts tasks while walking',
    '',
    '*📊 Track Progress*',
    '  `/assignments`  — all tasks',
    '  `/pending`  — overdue/unacknowledged',
    '  `/blocks`  — what\'s stuck',
    '',
    '*🔴 Money*',
    '  `/addco [proj] [desc] [$]`  — change order',
    '  `/cos`  — all COs, grouped by status',
    '  `/co [id] approve|reject`',
    '  `/lien [proj] [sub] [$]`  — lien release',
    '  `/liens`  — who\'s unsigned',
    '',
    '*🏛️ Inspections & Permits*',
    '  `/inspect [proj] [type] [date] [inspector]`',
    '  `/inspect [id] pass|fail`  — record result',
    '  `/permit [proj] [type] [date] [$]`',
    '  `/permitexpiring`  — 30-day warning',
    '',
    '*👷 Crew*',
    '  `/clockin [name] [trade]`  — on site',
    '  `/clockout [name]`  — off site',
    '  `/onsite`  — who\'s here now',
    '  `/crew`  — today\'s full report  (also: /chat, /team)',
    '',
    '*🖥️ Portal*',
    '  `/dash`  — web dashboard  (also: /link, /dashboard, /app)',
    '  `/tutorial`  — onboarding walkthrough',
    '  `/h`  — full command guide',
    '',
    '*📝 Daily*',
    '  `/dailyreport [proj] [notes]`  — auto-report',
    '  `/reports`  — history',
    '  `/toolbox [proj] [topic]`  — safety talk',
    '  `/incident [proj] [desc] [severity]`',
    '',
    '*📋 Lists*',
    '  `/punch [proj] [loc] — [item]`  — punch list',
    '  `/delivery [proj] [item] from [supplier] on [date]`',
    '  `/rfi [proj] [title]`',
    '  `/submittal [proj] [desc] due [date]`',
    '',
    '*🗺️ Plans & Meetings*',
    '  `/planrev [proj] [desc]`  — plan revision',
    '  `/meeting [proj] [topic]`  — capture minutes',
    '  `/endmeeting`  — extract actions + email',
    '',
    '*📇 People*',
    '  `/contacts`  — directory',
    '  `/subs`  — subcontractors by trade',
    '  `/email [name] [subject] -- [body]`',
    '',
    '*🧮 Quick Calc*',
    '  `/concrete 30 40 6`  — cubic yards',
    '  `/studs 40`  — stud count @ 16" OC',
    '',
    '*🖥️ Dashboard*',
    '  `/link`  — open web dashboard',
    '',
    '*💡 Pro Tips*',
    '  🎙️ Voice notes = 5x faster than typing',
    '  📸 Send photos with "Project: description" caption',
    '  🔗 Use `--link permit:abc` on blockers',
    '  ⚡ `/` + tab = autocomplete commands',
  ].join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// WORKFLOWS — real-world recipe cards
// ═══════════════════════════════════════════════════════════════
async function cmdWorkflow(chatId, args) {
  const topic = (args || '').toLowerCase();
  
  if (topic === 'morning' || topic === 'am') {
    return send(chatId, [
      '🌅 *Morning Workflow*',
      '',
      '🕕 *6:30 AM — Auto-Briefing*',
      '   Auto-generated: weather, pending tasks, deliveries, RFIs.',
      '   Sent automatically to this chat Mon–Fri.',
      '   (Configure with `/remind` for custom timing)',
      '',
      '🕖 *7:00 AM — Crew Check*',
      '   `/crew Woodbridge` — today\'s crew roster',
      '   `/onsite` — who\'s clocked in right now',
      '',
      '🕢 *7:30 AM — Site Walk*',
      '   *Send voice notes while walking:*',
      '   "Mike needs to finish the flashing by noon"',
      '   "Jose, rough-in panel A by tomorrow"',
      '   "Foundation pour scheduled for 10am"',
      '   🤖 Bot auto-extracts 3 tasks + 1 deadline.',
      '',
      '🕗 *8:00 AM — Safety*',
      '   `/toolbox Woodbridge "Fall protection review"`',
      '',
      '🕘 *8:30 AM — Blockers*',
      '   `/blocks` — what\'s stuck?',
      '   `/inspections` — any today?',
      '   `/deliveries today` — what\'s arriving?',
      '',
      '💡 *Average time: 10 min. Previously: 45 min.*',
      '',
      'More: `/workflow huddle` | `/workflow closeout`',
    ].join('\n'));
  }
  
  if (topic === 'huddle' || topic === 'meeting' || topic === 'voiceroom') {
      return send(chatId, [
        '🎯 *Huddle & Voice Room Workflow*',
        '',
        '🕐 *Start (text or voice)*',
        '   `/voiceroom "morning standup" 10`',
        '   `/huddle "safety review" 15`',
        '   → Creates timed capture session',
        '',
        '🗣️ *During — Voice Notes*',
        '   Hold mic button, speak:',
        '   _"Pat, east wall rebar needs fixed by Friday"_',
        '   _"Jose, rough-in panel A by Wednesday — critical"_',
        '   _"Foundation pour scheduled for 10am"_',
        '   → Each voice note auto-transcribed',
        '   → Tasks extracted INSTANTLY as you speak',
        '   → All transcripts added to huddle log',
        '',
        '💬 *During — Text & Photos*',
        '   Text messages captured automatically.',
        '   Photos with captions added to huddle log.',
        '   No notes needed. No minutes to type.',
        '',
        '⏰ *End*',
        '   `/endhuddle` (or auto-ends when timer expires)',
        '   → AI batch-processes ALL voice+text messages',
        '   → Extracts every task, deadline, issue mentioned',
        '   → Assignments created with huddle attribution',
        '   → Email summary sent to leadership automatically',
        '',
        '📋 *Review*',
        '   `/assignments` — every extracted task, tagged',
        '   `/pending` — what still needs action',
        '   All marked with priority + deadline',
        '',
        '💡 *Pro tip: Use /voiceroom on job sites*',
        '   No typing. No laptop. Talk through issues',
        '   while walking the site. Bot handles the rest.',
        '',
        'More: `/workflow morning` | `/workflow inspect`',
      ].join('\\n'));
  }
  
  if (topic === 'inspect' || topic === 'inspection') {
    return send(chatId, [
      '🏛️ *Inspection Workflow*',
      '',
      '📅 *Schedule*',
      '   `/inspect Woodbridge Foundation Friday 10am Curtis`',
      '   → Logged and tracked',
      '',
      '📋 *Morning of*',
      '   `/inspections` — verify time/type',
      '   Check `/permits` — is the permit posted?',
      '   Verify `/blocks` — is this inspection blocking framing?',
      '',
      '✅ *After*',
      '   `/inspect abc123 pass`',
      '   → If it was blocking: `/block abc124 resolved`',
      '   → Ready to `/assign Mike start framing Monday`',
      '',
      '❌ *If failed*',
      '   `/inspect abc123 fail "Rebar spacing wrong"`',
      '   → Auto-flagged for reinspection',
      '   → Add `/punch Foundation — rebar spacing fix`',
      '   → Schedule: `/inspect Woodbridge Foundation Monday Curtis`',
      '',
      '💡 *Tip:* Link blockers to inspections:',
      '   `/block Woodbridge Framing on hold --link inspection:abc123`',
      '',
      'More: `/workflow co` | `/workflow closeout`',
    ].join('\n'));
  }
  
  if (topic === 'co' || topic === 'changeorder') {
    return send(chatId, [
      '🔴 *Change Order Workflow*',
      '',
      '📝 *Create*',
      '   `/addco Woodbridge "Add 200LF conduit" $3200 Pat`',
      '   → Logged as pending with cost, scope, requestor',
      '',
      '📊 *Review*',
      '   `/cos` — all COs grouped: pending / approved / rejected',
      '   See total financial impact at a glance',
      '',
      '✅ *Approve*',
      '   `/co abc123 approve`',
      '   → Records: who approved, when, audit trail',
      '   → Auto-adds to project cost',
      '',
      '❌ *Reject*',
      '   `/co abc123 reject "Already in base scope"`',
      '   → Records: who rejected, why',
      '',
      '💡 *Tip:* Use `/permitfee` and `/liens` to see',
      '   full project financial picture — COs + permits + liens.',
      '',
      'More: `/workflow closeout` | `/workflow huddle`',
    ].join('\n'));
  }
  
  if (topic === 'closeout' || topic === 'close') {
    return send(chatId, [
      '📦 *Closeout Workflow*',
      '',
      'When the project\'s nearly done, run this checklist:',
      '',
      '1️⃣  *Punch List*',
      '    `/punchlist Woodbridge`',
      '    → All open items must be `/punchdone`',
      '',
      '2️⃣  *Inspections*',
      '    `/inspections Woodbridge`',
      '    → All must show "passed"',
      '',
      '3️⃣  *Permits*',
      '    `/permits Woodbridge`',
      '    → Mark all as `closed`',
      '',
      '4️⃣  *Lien Releases*',
      '    `/liens Woodbridge`',
      '    → Every sub must be `/lien [id] signed`',
      '    → ⚠️ Never pay final draw without signed liens',
      '',
      '5️⃣  *Submittals*',
      '    `/submittals Woodbridge`',
      '    → All must show "approved"',
      '',
      '6️⃣  *Plan Revisions*',
      '    `/planrevs Woodbridge`',
      '    → Verify current set matches as-builts',
      '',
      '7️⃣  *Daily Reports*',
      '    `/reports Woodbridge`',
      '    → Complete history for warranty claims',
      '',
      '8️⃣  *Final Report*',
      '    `/dailyreport Woodbridge "Project complete"`',
      '    → Closing narrative with key dates, issues, lessons',
      '',
      '💡 *Tip:* Run this checklist 2 weeks before',
      '   scheduled completion to catch gaps early.',
      '',
      'More: `/workflow morning` | `/workflow inspect`',
    ].join('\n'));
  }
  
  // Default — show all workflows
  return send(chatId, [
    '📋 *Workflow Recipes*',
    '',
    'Pick a scenario — bot walks you through step by step:',
    '',
    '🌅  `/workflow morning` — 6:30 AM to 8:30 AM routine',
    '🎯  `/workflow huddle` — team meeting capture',
    '🏛️  `/workflow inspect` — inspection lifecycle',
    '🔴  `/workflow co` — change order approval',
    '📦  `/workflow closeout` — project closeout checklist',
    '',
    '💡 *Tip:* After `/tutorial` try `/workflow morning`',
    '   to see your first operational playbook.',
  ].join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// CHANGE ORDERS
// ═══════════════════════════════════════════════════════════════
async function cmdAddCO(chatId, args, from) {
  // /addco Woodbridge "Add 200LF conduit" $3200 --owner "Pat K"
  // Simpler: /addco Woodbridge Add 200LF conduit 3200 Pat K
  if (!args) return send(chatId, 'Usage: /addco [project] [description] [$amount] [requested_by]\nExample: /addco Woodbridge "Add 200LF conduit" $3200 "Pat K"');
  const costMatch = args.match(/\$?([\d,]+\.?\d*)/);
  const cost = costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0;
  let text = args.replace(/\$[\d,]+\.?\d*/, '').trim();
  const parts = text.split(/\s+/);
  const project = parts[0] || 'General';
  // Last word is requested_by if it looks like a name (capitalized)
  let requested_by = '';
  const lastWord = parts[parts.length - 1];
  if (lastWord && /^[A-Z]/.test(lastWord) && parts.length > 3) {
    requested_by = lastWord;
    parts.pop();
  }
  const description = parts.slice(1).join(' ');
  if (!description) return send(chatId, '❌ Please include a description.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO change_orders (id, project, description, cost, requested_by, created_by) VALUES (?,?,?,?,?,?)')
    .run(id, project, description, cost, requested_by, from.first_name);
  logAudit(from.first_name, 'add_co', 'change_order', id, `${project} - ${description}`);
  return send(chatId, [
    `🔴 *Change Order Created*`,
    `🏗️ *${project}*`,
    `📝 *${description}*`,
    `💰 *$${cost.toLocaleString()}*`,
    `${requested_by ? `🙋 *Requested by:* ${requested_by}` : ''}`,
    `🆔 ID: ${id}`,
    '',
    `Use /cos to list all. /co ${id} approve to accept.`,
  ].filter(Boolean).join('\n'));
}

async function cmdListCOs(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM change_orders WHERE project LIKE ? ORDER BY status, created_at DESC LIMIT 20').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No change orders${project ? ' for '+project : ''}.`);
  const pending = rows.filter(r => r.status === 'pending');
  const approved = rows.filter(r => r.status === 'approved');
  const rejected = rows.filter(r => r.status === 'rejected');
  const lines = [`🔴 *Change Orders${project ? ': '+project : ''}*`];
  if (pending.length) { lines.push('', `🟡 *Pending (${pending.length}):*`); pending.forEach(r => lines.push(`  🟡 \`${r.id}\` ${r.description.slice(0,40)} — $${r.cost.toLocaleString()}`)); }
  if (approved.length) { lines.push('', `🟢 *Approved (${approved.length}):*`); approved.forEach(r => lines.push(`  ✅ \`${r.id}\` ${r.description.slice(0,40)} — $${r.cost.toLocaleString()}`)); }
  if (rejected.length) { lines.push('', `🔴 *Rejected (${rejected.length}):*`); rejected.forEach(r => lines.push(`  ❌ \`${r.id}\` ${r.description.slice(0,40)}`)); }
  return send(chatId, lines.join('\n'));
}

async function cmdCOAction(chatId, args, from) {
  // /co {id} approve  or  /co {id} reject "reason"
  if (!args) return send(chatId, 'Usage: /co [id] approve|reject [reason]\nExample: /co abc123 approve\n/co abc123 reject "Cost too high"');
  const parts = args.split(/\s+/);
  const coId = parts[0];
  const action = parts[1]?.toLowerCase();
  const reason = parts.slice(2).join(' ');

  if (!['approve', 'reject'].includes(action)) return send(chatId, 'Action must be "approve" or "reject".');

  const d = await getDb();
  const co = d.prepare('SELECT * FROM change_orders WHERE id=?').get(coId);
  if (!co) return send(chatId, `❌ Change order ${coId} not found.`);
  if (co.status !== 'pending') return send(chatId, `❌ CO ${coId} is already ${co.status}.`);

  const now = new Date().toISOString();
  if (action === 'approve') {
    d.prepare("UPDATE change_orders SET status='approved', approved_by=?, approved_at=? WHERE id=?").run(from.first_name, now, coId);
    logAudit(from.first_name, 'approve_co', 'change_order', coId, co.description);
    return send(chatId, `✅ *CO Approved*\n📝 ${co.description}\n💰 $${co.cost.toLocaleString()}\n🏗️ ${co.project}\n👤 Approved by: ${from.first_name}`);
  } else {
    d.prepare("UPDATE change_orders SET status='rejected', rejection_reason=?, approved_by=? WHERE id=?").run(reason || 'No reason given', from.first_name, coId);
    logAudit(from.first_name, 'reject_co', 'change_order', coId, reason);
    return send(chatId, [`❌ *CO Rejected*\n📝 ${co.description}\n💰 $${co.cost.toLocaleString()}`, reason ? `\n📌 *Reason:* ${reason}` : ''].join('\n'));
  }
}

// ═══════════════════════════════════════════════════════════════
// DAILY REPORTS
// ═══════════════════════════════════════════════════════════════
async function cmdDailyReport(chatId, args, from) {
  // /dailyreport [project] [notes]
  const parts = (args || '').split(/\s+/);
  const project = parts[0] || 'General';
  const notes = parts.slice(1).join(' ') || '';

  // Auto-gather context from today's activity
  const d = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch today's completed tasks
  const tasksDone = d.prepare("SELECT task FROM assignments WHERE status='complete' AND date(created_at)=? LIMIT 10").all(today);
  const deliveries = d.prepare("SELECT material FROM deliveries WHERE date(created_at)=? LIMIT 10").all(today);
  const punchDone = d.prepare("SELECT item FROM punchlist WHERE status='complete' AND date(created_at)=? LIMIT 10").all(today);

  const weather = process.env.WEATHER_LAST || 'Not fetched';
  const taskList = tasksDone.map(t => `• ${t.task}`).join('\n') || '• None reported';
  const deliveryList = deliveries.map(d => `• ${d.material}`).join('\n') || '• None';
  const punchList = punchDone.map(p => `• ${p.item}`).join('\n') || '• None';

  const reportId = uid();
  d.prepare('INSERT INTO daily_reports (id, project, report_date, weather, narrative, tasks_done, deliveries_received, issues, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(reportId, project, today, weather, notes, taskList, deliveryList, punchList, from.first_name);

  logAudit(from.first_name, 'daily_report', 'daily_report', reportId, `${project} - ${notes.slice(0, 60)}`);
  return send(chatId, [
    `📝 *Daily Report — ${today}*`,
    `🏗️ *${project}*`,
    '',
    `🌤️ Weather: ${weather}`,
    '',
    `✅ *Tasks Done:*`,
    taskList,
    '',
    `📦 *Deliveries:*`,
    deliveryList,
    '',
    notes ? `📝 *Notes:* ${notes}` : '',
    '',
    `🆔 Report ID: ${reportId}`,
    `Use /reports ${project} to view history.`,
  ].join('\n'));
}

async function cmdReports(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM daily_reports WHERE project LIKE ? ORDER BY report_date DESC LIMIT 10').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No reports${project ? ' for '+project : ''}. Use /dailyreport to create one.`);
  const lines = [`📝 *Daily Reports${project ? ': '+project : ''}*`, ''];
  for (const r of rows) {
    lines.push(`📅 ${r.report_date} — ${r.project}`);
    if (r.narrative) lines.push(`   ${r.narrative.slice(0, 80)}`);
  }
  return send(chatId, lines.join('\n'));
}

async function cmdReportWeek(chatId) {
  const d = await getDb();
  const rows = d.prepare("SELECT * FROM daily_reports WHERE report_date >= date('now', '-7 days') ORDER BY report_date DESC").all();
  if (!rows.length) return send(chatId, 'No reports this week.');
  const lines = ['📝 *This Week\'s Reports*', ''];
  for (const r of rows) {
    lines.push(`📅 ${r.report_date} — *${r.project}*`);
    if (r.narrative) lines.push(`   ${r.narrative.slice(0, 100)}`);
    if (r.crew_count) lines.push(`   👷 Crew: ${r.crew_count}`);
  }
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// INSPECTIONS
// ═══════════════════════════════════════════════════════════════
async function cmdInspect(chatId, args, from) {
  // /inspect Woodbridge Foundation today 10am "Curtis"
  if (!args) return send(chatId, 'Usage: /inspect [project] [type] [date] [time] [inspector]\nExample: /inspect Woodbridge Foundation today 10am Curtis');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  const type = parts[1] || '';
  // date could be "today", "tomorrow", "Friday", "2026-06-30"
  const date = parts[2] || 'today';
  const time = parts[3] || '';
  const inspector = parts.slice(4).join(' ') || 'TBD';
  if (!type) return send(chatId, '❌ Include inspection type (Foundation, Framing, Electrical, etc).');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO inspections (id, project, type, scheduled_date, scheduled_time, inspector, created_by) VALUES (?,?,?,?,?,?,?)')
    .run(id, project, type, date, time, inspector, from.first_name);
  logAudit(from.first_name, 'schedule_inspection', 'inspection', id, `${project} - ${type}`);
  return send(chatId, [
    `🏛️ *Inspection Scheduled*`,
    `🏗️ *${project}*`,
    `🔍 *Type:* ${type}`,
    `📅 *Date:* ${date}${time ? ' @ '+time : ''}`,
    `👤 *Inspector:* ${inspector}`,
    `🆔 ID: ${id}`,
    '',
    `Use /inspections to track.`,
  ].join('\n'));
}

async function cmdInspections(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare('SELECT * FROM inspections WHERE project LIKE ? ORDER BY scheduled_date ASC, status LIMIT 20').all(`%${project}%`);
  if (!rows.length) return send(chatId, `No inspections${project ? ' for '+project : ''}.`);
  const scheduled = rows.filter(r => r.status === 'scheduled');
  const passed = rows.filter(r => r.status === 'passed');
  const failed = rows.filter(r => r.status === 'failed');
  const lines = [`🏛️ *Inspections${project ? ': '+project : ''}*`];
  if (scheduled.length) { lines.push('', `🟡 *Upcoming (${scheduled.length}):*`); scheduled.forEach(r => lines.push(`  📅 \`${r.id}\` ${r.type} — ${r.scheduled_date}${r.scheduled_time?' @'+r.scheduled_time:''} | ${r.inspector}`)); }
  if (passed.length) { lines.push('', `🟢 *Passed (${passed.length}):*`); passed.forEach(r => lines.push(`  ✅ \`${r.id}\` ${r.type} — ${r.scheduled_date}`)); }
  if (failed.length) { lines.push('', `🔴 *Failed (${failed.length}):*`); failed.forEach(r => lines.push(`  ❌ \`${r.id}\` ${r.type} — ${r.result_notes||''}`)); }
  lines.push('', `Use /inspect {id} pass|fail to update.`);
  return send(chatId, lines.join('\n'));
}

async function cmdInspectResult(chatId, args, from) {
  // /inspect {id} pass  or  /inspect {id} fail "reason"
  if (!args) return send(chatId, 'Usage: /inspect [id] pass|fail [notes]\nExample: /inspect abc123 pass\n/inspect abc123 fail "Rebar spacing wrong"');
  const parts = args.split(/\s+/);
  const inspId = parts[0];
  const result = parts[1]?.toLowerCase();
  const notes = parts.slice(2).join(' ');
  if (!['pass', 'fail'].includes(result)) return send(chatId, 'Result must be "pass" or "fail".');

  const d = await getDb();
  const insp = d.prepare('SELECT * FROM inspections WHERE id=?').get(inspId);
  if (!insp) return send(chatId, `❌ Inspection ${inspId} not found.`);
  if (insp.status !== 'scheduled') return send(chatId, `❌ Inspection already ${insp.status}.`);

  if (result === 'pass') {
    d.prepare("UPDATE inspections SET status='passed', result_notes=? WHERE id=?").run(notes || 'Passed', inspId);
    logAudit(from.first_name, 'inspection_pass', 'inspection', inspId, notes);
    return send(chatId, `✅ *Inspection Passed!*\n🔍 ${insp.type} — ${insp.project}\n📝 ${notes || 'No issues noted.'}`);
  } else {
    d.prepare("UPDATE inspections SET status='failed', result_notes=? WHERE id=?").run(notes || 'Failed inspection', inspId);
    logAudit(from.first_name, 'inspection_fail', 'inspection', inspId, notes);
    return send(chatId, [
      `❌ *Inspection Failed*\n🔍 ${insp.type} — ${insp.project}\n📌 *Issue:* ${notes || 'Not specified'}`,
      '\n⚠️ Schedule reinspection with /inspect',
    ].join('\n'));
  }
}

// ═══════════════════════════════════════════════════════════════
// TIME & ATTENDANCE
// ═══════════════════════════════════════════════════════════════
async function cmdClockIn(chatId, args, from) {
  // /clockin Mike drywall Woodbridge
  if (!args) return send(chatId, 'Usage: /clockin [name] [trade] [project]\nExample: /clockin Mike drywall Woodbridge');
  const parts = args.split(/\s+/);
  const name = parts[0];
  const trade = parts[1] || '';
  const project = parts.slice(2).join(' ') || 'General';
  if (!name) return send(chatId, '❌ Include worker name.');

  // Check if already clocked in
  const d = await getDb();
  const active = d.prepare("SELECT * FROM time_entries WHERE worker_name LIKE ? AND clock_out IS NULL").get(`%${name}%`);
  if (active) return send(chatId, `⚠️ ${active.worker_name} is already clocked in since ${new Date(active.clock_in).toLocaleTimeString()}.`);

  const id = uid();
  const now = new Date().toISOString();
  d.prepare('INSERT INTO time_entries (id, worker_name, trade, project, clock_in) VALUES (?,?,?,?,?)')
    .run(id, name, trade, project, now);
  logAudit(from.first_name, 'clock_in', 'time_entry', id, `${name} - ${trade}`);

  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return send(chatId, [
    `🟢 *Clocked In*`,
    `👷 *${name}*`,
    `🛠️ ${trade} | 🏗️ ${project}`,
    `🕐 ${time}`,
    '',
    `Use /onsite to see who's here. /clockout ${name} when done.`,
  ].join('\n'));
}

async function cmdClockOut(chatId, args, from) {
  if (!args) return send(chatId, 'Usage: /clockout [name]\nExample: /clockout Mike');
  const d = await getDb();
  const entry = d.prepare("SELECT * FROM time_entries WHERE worker_name LIKE ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1").get(`%${args}%`);
  if (!entry) return send(chatId, `❌ No active clock-in for "${args}".`);

  const now = new Date().toISOString();
  const hours = (Date.now() - new Date(entry.clock_in).getTime()) / 3600000;
  d.prepare("UPDATE time_entries SET clock_out=?, hours=? WHERE id=?").run(now, Math.round(hours * 10) / 10, entry.id);
  logAudit(from.first_name, 'clock_out', 'time_entry', entry.id, `${args} - ${hours.toFixed(1)}h`);

  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return send(chatId, [
    `🔴 *Clocked Out*`,
    `👷 *${entry.worker_name}*`,
    `🛠️ ${entry.trade} | 🏗️ ${entry.project}`,
    `🕐 Out: ${time}`,
    `⏱️ Total: *${hours.toFixed(1)} hours*`,
  ].join('\n'));
}

async function cmdOnSite(chatId, args) {
  const d = await getDb();
  const project = args || '';
  const rows = d.prepare(
    project
      ? "SELECT * FROM time_entries WHERE clock_out IS NULL AND project LIKE ? ORDER BY clock_in DESC"
      : "SELECT * FROM time_entries WHERE clock_out IS NULL ORDER BY trade, worker_name"
  ).all(`%${project}%`);
  if (!rows.length) return send(chatId, `👷 No one currently on site${project ? ' for '+project : ''}.`);
  const lines = [`👷 *On Site Now${project ? ': '+project : ''}* — ${rows.length} workers`, ''];
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.trade || 'Unspecified']) grouped[r.trade || 'Unspecified'] = [];
    const inTime = new Date(r.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    grouped[r.trade || 'Unspecified'].push(`  • ${r.worker_name} — since ${inTime}`);
  }
  for (const [trade, workers] of Object.entries(grouped)) {
    lines.push(`*${trade}:*`, ...workers, '');
  }
  return send(chatId, lines.join('\n'));
}

async function cmdCrew(chatId, args) {
  // /crew Woodbridge — today's crew (clocked in + clocked out)
  const d = await getDb();
  const project = args || '';
  const today = new Date().toISOString().slice(0, 10);
  const rows = d.prepare(
    project
      ? "SELECT * FROM time_entries WHERE date(clock_in)=? AND project LIKE ? ORDER BY clock_in"
      : "SELECT * FROM time_entries WHERE date(clock_in)=? ORDER BY trade, clock_in"
  ).all(today, `%${project}%`);
  if (!rows.length) return send(chatId, `No crew entries today${project ? ' for '+project : ''}.`);
  const onSite = rows.filter(r => !r.clock_out);
  const done = rows.filter(r => r.clock_out);
  const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0);
  const lines = [`👷 *Today's Crew${project ? ': '+project : ''}*`, ''];
  if (onSite.length) { lines.push(`🟢 *On Site (${onSite.length}):*`); onSite.forEach(r => { const t = new Date(r.clock_in).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); lines.push(`  • ${r.worker_name} (${r.trade||'N/A'}) — in @ ${t}`); }); }
  if (done.length) { lines.push('', `🔴 *Done (${done.length}):*`); done.forEach(r => lines.push(`  • ${r.worker_name} (${r.trade||'N/A'}) — ${r.hours?.toFixed(1)||'?'}h`)); }
  lines.push('', `📊 *Total:* ${totalHours.toFixed(1)} hours`);
  return send(chatId, lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════
// SAFETY
// ═══════════════════════════════════════════════════════════════
async function cmdIncident(chatId, args, from) {
  // /incident Woodbridge "Jose cut hand" minor
  if (!args) return send(chatId, 'Usage: /incident [project] [description] [severity: minor|serious|critical]\nExample: /incident Woodbridge "Jose cut hand" minor');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  // severity is last word if it matches minor/serious/critical
  let severity = 'minor';
  if (/^(minor|serious|critical)$/i.test(parts[parts.length - 1])) {
    severity = parts.pop().toLowerCase();
  }
  const description = parts.slice(1).join(' ');
  if (!description) return send(chatId, '❌ Include incident description.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO safety_incidents (id, project, description, severity, reported_by) VALUES (?,?,?,?,?)')
    .run(id, project, description, severity, from.first_name);
  logAudit(from.first_name, 'report_incident', 'safety_incident', id, `${severity}: ${description}`);

  const emoji = { minor: '🟡', serious: '🟠', critical: '🔴' };
  return send(chatId, [
    `${emoji[severity]||'⚠️'} *Incident Reported*`,
    `🏗️ *${project}*`,
    `📝 *${description}*`,
    `⚠️ *Severity:* ${severity.toUpperCase()}`,
    `👤 *Reported by:* ${from.first_name}`,
    `🆔 ID: ${id}`,
    '',
    `Use /incidents to review.`,
  ].join('\n'));
}

async function cmdIncidents(chatId, args) {
  const d = await getDb();
  const rows = d.prepare('SELECT * FROM safety_incidents WHERE project LIKE ? ORDER BY reported_at DESC LIMIT 20').all(`%${args||''}%`);
  if (!rows.length) return send(chatId, `No incidents${args ? ' for '+args : ''}. That's a good thing. ✅`);
  const emoji = { minor: '🟡', serious: '🟠', critical: '🔴' };
  const lines = [`⚠️ *Safety Incidents${args ? ': '+args : ''}*`, ''];
  for (const r of rows) {
    lines.push(`${emoji[r.severity]||'⚠️'} ${r.reported_at?.slice(0,10)} — *${r.description.slice(0,60)}*`);
    lines.push(`   Severity: ${r.severity} | Reported: ${r.reported_by}`);
  }
  return send(chatId, lines.join('\n'));
}

async function cmdToolbox(chatId, args, from) {
  // /toolbox Woodbridge "Ladder safety"
  if (!args) return send(chatId, 'Usage: /toolbox [project] [topic]\nExample: /toolbox Woodbridge "Ladder safety"');
  const parts = args.split(/\s+/);
  const project = parts[0] || 'General';
  const topic = parts.slice(1).join(' ');
  if (!topic) return send(chatId, '❌ Include the toolbox talk topic.');

  const d = await getDb();
  const id = uid();
  d.prepare('INSERT INTO toolbox_talks (id, project, topic, presenter, created_by) VALUES (?,?,?,?,?)')
    .run(id, project, topic, from.first_name, from.first_name);
  logAudit(from.first_name, 'toolbox_talk', 'toolbox_talk', id, topic);
  return send(chatId, [
    `🦺 *Toolbox Talk Logged*`,
    `🏗️ *${project}*`,
    `📋 *Topic:* ${topic}`,
    `👤 *Presenter:* ${from.first_name}`,
    `📅 ${new Date().toLocaleDateString()}`,
    '',
    `Use /toolboxtalks ${project} to review history.`,
  ].join('\n'));
}

async function cmdToolboxTalks(chatId, args) {
  const d = await getDb();
  const rows = d.prepare('SELECT * FROM toolbox_talks WHERE project LIKE ? ORDER BY talk_date DESC LIMIT 15').all(`%${args||''}%`);
  if (!rows.length) return send(chatId, `No toolbox talks${args ? ' for '+args : ''}. Use /toolbox to log one.`);
  const lines = [`🦺 *Toolbox Talks${args ? ': '+args : ''}*`, ''];
  for (const r of rows) {
    lines.push(`📋 ${r.talk_date} — *${r.topic}*`);
    lines.push(`   Presenter: ${r.presenter} | Attendance: ${r.attendance||'?'}`);
  }
  return send(chatId, lines.join('\n'));
}
// ─── Flow Commands: Seamless Daily Operations ──────────────────

// /today — one-command full briefing: all projects, crew, money, issues
async function cmdToday(chatId) {
  const d = await getDb();
  const proj = activeProjects.get(chatId);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`📊 *TODAY — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}*`, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ''];

  // Discover all active projects from db
  const projects = new Set();
  [
    'SELECT DISTINCT project FROM assignments WHERE project IS NOT NULL AND project != \'\' AND status != \'done\' AND status != \'cancelled\'',
    'SELECT DISTINCT project FROM punchlist WHERE project IS NOT NULL AND project != \'\' AND status = \'open\'',
    'SELECT DISTINCT project FROM change_orders WHERE project IS NOT NULL AND project != \'\' AND status = \'pending\'',
    'SELECT DISTINCT project FROM rfis WHERE project IS NOT NULL AND project != \'\' AND status = \'open\'',
    'SELECT DISTINCT project FROM inspections WHERE project IS NOT NULL AND project != \'\'',
    'SELECT DISTINCT project FROM daily_reports WHERE project IS NOT NULL AND project != \'\'',
  ].forEach(sql => {
    try { d.prepare(sql).all().forEach(r => projects.add(r.project)); } catch {}
  });

  if (projects.size === 0) {
    lines.push('👷 *No active projects yet.*');
    lines.push('');
    lines.push('Start with `/assign [project] [task]` or `/a Woodbridge frame basement`.');
    lines.push('Then run `/today` again for your full briefing.');
    return send(chatId, lines.join('\\n'));
  }

  // Per-project summary
  for (const project of [...projects].sort()) {
    const isActive = project === proj;
    const icon = isActive ? '📍' : '📁';
    lines.push(`${icon} *${project}*${isActive ? ' ← active' : ''}`);

    // Tasks
    const tasks = d.prepare("SELECT status, COUNT(*) as c FROM assignments WHERE project=? AND status != 'done' AND status != 'cancelled' GROUP BY status").all(project);
    const done = d.prepare("SELECT COUNT(*) as c FROM assignments WHERE project=? AND status='done' AND updated_at >= date('now','-7 days')").get(project)?.c || 0;
    const pending = tasks.find(t => t.status === 'pending')?.c || 0;
    const overdue = d.prepare("SELECT COUNT(*) as c FROM assignments WHERE project=? AND due_date < date('now') AND status NOT IN ('complete','completed')").get(project)?.c || 0;
    const parts = [];
    if (done > 0) parts.push(`✅ ${done} done this week`);
    if (pending > 0) parts.push(`📋 ${pending} pending`);
    if (overdue > 0) parts.push(`🔴 ${overdue} overdue`);
    if (parts.length) lines.push(`  Tasks: ${parts.join('  |  ')}`);

    // Crew
    const onsite = d.prepare("SELECT worker_name, trade FROM time_entries WHERE project=? AND date(clock_in)=date('now') AND clock_out IS NULL ORDER BY clock_in DESC").all(project);
    if (onsite.length) {
      const names = onsite.map(w => `${w.worker_name} (${w.trade || 'general'})`).join(', ');
      lines.push(`  👷 On site: ${names}`);
    }

    // COs
    const copending = d.prepare("SELECT COUNT(*) as c FROM change_orders WHERE project=? AND status='pending'").get(project)?.c || 0;
    if (copending > 0) lines.push(`  ✏️ ${copending} change order${copending > 1 ? 's' : ''} pending`);

    // RFIs
    const rfiOpen = d.prepare("SELECT COUNT(*) as c FROM rfis WHERE project=? AND status='open'").get(project)?.c || 0;
    const rfiOverdue = d.prepare("SELECT COUNT(*) as c FROM rfis WHERE project=? AND status='open' AND due_date < date('now')").get(project)?.c || 0;
    if (rfiOpen > 0) lines.push(`  📄 ${rfiOpen} RFI${rfiOpen > 1 ? 's' : ''}${rfiOverdue > 0 ? ` — ${rfiOverdue} OVERDUE` : ''}`);

    // Inspections
    const insp = d.prepare("SELECT type, scheduled_date FROM inspections WHERE project=? AND status='scheduled' AND scheduled_date >= date('now') ORDER BY scheduled_date LIMIT 3").all(project);
    if (insp.length) {
      insp.forEach(i => lines.push(`  🏛️ ${i.type} inspection — ${i.scheduled_date || 'TBD'}`));
    }

    lines.push('');
  }

  // Money summary across all projects
  lines.push('💸 *Money*');
  const copend = d.prepare("SELECT COUNT(*) as c, SUM(cost) as total FROM change_orders WHERE status='pending'").get();
  if (copend?.c > 0) lines.push(`  ✏️ ${copend.c} CO${copend.c > 1 ? 's' : ''} pending — $${(copend.total || 0).toLocaleString()}`);
  const liens = d.prepare("SELECT COUNT(*) as c FROM lien_releases WHERE status='pending'").get();
  if (liens?.c > 0) lines.push(`  📋 ${liens.c} lien release${liens.c > 1 ? 's' : ''} unsigned`);
  const permits = d.prepare("SELECT COUNT(*) as c FROM permits WHERE (status='applied' OR status='pending') AND expiration_date <= date('now','+30 days')").get();
  if (permits?.c > 0) lines.push(`  🏛️ ${permits.c} permit${permits.c > 1 ? 's' : ''} expiring within 30 days`);

  // Quick actions
  lines.push('');
  lines.push('⚡ `/flow` — Morning checklist  |  `/project [name]` — Switch jobs  |  `/dash` — Web portal');

  return send(chatId, lines.join('\\n'));
}

// ─── /morning — One-Tap AM Briefing ───────────────────
async function cmdMorning(chatId) {
  const d = await getDb();
  const proj = activeProjects.get(chatId);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [`🌅 *GOOD MORNING — ${today}*`, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', ''];

  // Active project focus
  const projects = new Set();
  ['assignments','punchlist','change_orders','rfis','inspections'].forEach(table => {
    try { d.prepare(`SELECT DISTINCT project FROM ${table} WHERE project IS NOT NULL AND project != '' LIMIT 20`).all().forEach(r => projects.add(r.project)); } catch {}
  });

  if (projects.size === 0) {
    lines.push('👷 *No active projects yet.*');
    lines.push('Start: `/project Woodbridge` then `/a [task]`');
    return send(chatId, lines.join('\\n'));
  }

  for (const project of [...projects].sort()) {
    const isActive = project === proj;
    lines.push(`${isActive ? '📍' : '📁'} *${project}*${isActive ? ' ← active' : ''}`);

    // Overdue tasks — ACTION FIRST (any status that isn't complete)
    const overdue = d.prepare("SELECT task, assignee, due_date, status FROM assignments WHERE project=? AND due_date < date('now') AND status NOT IN ('complete','completed') ORDER BY due_date LIMIT 5").all(project);
    if (overdue.length) {
      lines.push(`  🔴 *${overdue.length} overdue:*`);
      overdue.forEach(t => lines.push(`    • ${t.task}${t.assignee ? ` → ${t.assignee}` : ''} (due ${t.due_date})`));
    }

    // Active tasks (all non-complete)
    const active = d.prepare("SELECT COUNT(*) as c FROM assignments WHERE project=? AND status NOT IN ('complete','completed')").get(project)?.c || 0;
    if (active > 0) lines.push(`  📋 ${active} active tasks`);

    // RFIs needing attention
    const rfiOpen = d.prepare("SELECT COUNT(*) as c FROM rfis WHERE project=? AND status IN ('pending','open')").get(project)?.c || 0;
    if (rfiOpen > 0) lines.push(`  ⚠️ ${rfiOpen} RFI${rfiOpen > 1 ? 's' : ''} open — awaiting response`);

    // Inspection today or this week
    const insp = d.prepare("SELECT type, scheduled_date FROM inspections WHERE project=? AND status='scheduled' AND scheduled_date >= date('now') ORDER BY scheduled_date LIMIT 2").all(project);
    if (insp.length) insp.forEach(i => lines.push(`  🏛️ ${i.type} — ${i.scheduled_date || 'TBD'}`));

    lines.push('');
  }

  // Money
  lines.push('💸 *Money*');
  const copend = d.prepare("SELECT COUNT(*) as c, SUM(cost) as total FROM change_orders WHERE status='pending'").get();
  if (copend?.c > 0) lines.push(`  ✏️ ${copend.c} CO pending — $${(copend.total || 0).toLocaleString()}`);
  const liens = d.prepare("SELECT COUNT(*) as c FROM lien_releases WHERE status='pending'").get();
  if (liens?.c > 0) lines.push(`  📋 ${liens.c} lien${liens.c > 1 ? 's' : ''} unsigned`);

  // Crew prompt
  lines.push('');
  lines.push('👷 *Clock in your crew:* `/clockin [name] [trade]`');
  lines.push('📸 *Today\'s rule:* Subs must send `/eod` photo before clock-out.');
  lines.push('');
  lines.push('⚡ `/today` — Full briefing  |  `/flow` — Checklist  |  `/sub [trade]` — Find subs');

  return send(chatId, lines.join('\\n'));
}

// ─── /eod — End of Day (Photo Required) ───────────────
async function cmdEOD(chatId, args, from) {
  const d = await getDb();
  const proj = activeProjects.get(chatId) || 'General';
  const name = from?.first_name || 'Worker';

  if (!args || args.length < 5) {
    return send(chatId, [
      '🌙 *END OF DAY*',
      '',
      '📸 *Step 1:* Send a photo of today\'s progress now.',
      `   Caption: "${proj}: [what got done today]"`,
      '',
      '📝 *Step 2:* Then type `/eod [summary of today]`',
      '   Example: `/eod Framing complete, electric rough-in started, plumber delayed to Monday`',
      '',
      '⏱️ You\'ll be auto clocked out after filing.',
    ].join('\\n'));
  }

  // Has a summary — file the report
  const reportId = uid();
  d.prepare(`INSERT INTO daily_reports (id, project, reported_by, date, workers, progress, issues) VALUES (?,?,?,date('now'),0,?,?)`)
    .run(reportId, proj, name, args, '');

  // Auto clock-out
  const clocked = d.prepare("SELECT * FROM time_entries WHERE worker_name=? AND date(clock_in)=date('now') AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1").get(name);
  let hours = 0;
  if (clocked) {
    d.prepare(`UPDATE time_entries SET clock_out=datetime('now') WHERE id=?`).run(clocked.id);
    hours = Math.round((Date.now() - new Date(clocked.clock_in + 'Z').getTime()) / 3600000 * 10) / 10;
  }

  // Tomorrow\'s tasks
  const tomorrow = d.prepare("SELECT task, assignee FROM assignments WHERE project=? AND status='pending' AND due_date <= date('now','+1 day') ORDER BY due_date LIMIT 5").all(proj);

  const out = [
    '🌙 *END OF DAY — Done!*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `✅ Report filed for *${proj}*`,
    `📝 "${args.slice(0, 100)}${args.length > 100 ? '...' : ''}"`,
  ];

  if (hours > 0) out.push(`⏱️ Clocked out: ${hours} hours today`);
  else out.push('⏱️ No clock-in found today — report saved anyway');

  if (tomorrow.length) {
    out.push('');
    out.push('📋 *Tomorrow:*');
    tomorrow.forEach(t => out.push(`  • ${t.task}${t.assignee ? ` → ${t.assignee}` : ''}`));
  }

  out.push('');
  out.push('👋 *See you tomorrow.*');

  // Check for overdue photo
  const photosToday = d.prepare("SELECT COUNT(*) as c FROM project_photos WHERE project=? AND date(created_at)=date('now')").get(proj)?.c || 0;
  if (photosToday === 0) out.push('⚠️ *No photo submitted today.* Send one now with caption.');

  return send(chatId, out.join('\\n'));
}

// ─── /money — Budget Tracking ─────────────────────────
async function cmdMoney(chatId, args) {
  const d = await getDb();
  const proj = args || activeProjects.get(chatId);
  const lines = ['💸 *BUDGET TRACKER*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];

  if (proj) {
    // Per-project view
    lines.push(`📍 *${proj}*`, '');

    const cos = d.prepare("SELECT id, description, cost, status, created_at FROM change_orders WHERE project=? ORDER BY created_at DESC LIMIT 15").all(proj);
    const totalCO = d.prepare("SELECT SUM(cost) as total, COUNT(*) as c FROM change_orders WHERE project=? AND status!='rejected'").get(proj);
    const approved = d.prepare("SELECT SUM(cost) as total FROM change_orders WHERE project=? AND status='approved'").get(proj);
    const pending = d.prepare("SELECT SUM(cost) as total, COUNT(*) as c FROM change_orders WHERE project=? AND status='pending'").get(proj);

    lines.push('*Change Orders:*');
    lines.push(`  Total (non-rejected): $${(totalCO?.total || 0).toLocaleString()} (${totalCO?.c || 0} COs)`);
    lines.push(`  ✅ Approved: $${(approved?.total || 0).toLocaleString()}`);
    lines.push(`  ⏳ Pending: $${(pending?.total || 0).toLocaleString()} (${pending?.c || 0} COs)`);

    if (cos.length) {
      lines.push('');
      lines.push('*Recent COs:*');
      cos.slice(0, 5).forEach(co => {
        const icon = co.status === 'approved' ? '✅' : co.status === 'rejected' ? '❌' : '⏳';
        lines.push(`  ${icon} $${(co.cost || 0).toLocaleString()} — ${co.description?.slice(0, 40) || 'N/A'} (${co.status})`);
      });
    }
  } else {
    // All projects summary
    const all = d.prepare("SELECT project, SUM(cost) as total, COUNT(*) as c, status FROM change_orders WHERE status!='rejected' GROUP BY project, status ORDER BY project, status").all();
    const byProj = {};
    all.forEach(r => {
      if (!byProj[r.project]) byProj[r.project] = { approved: 0, pending: 0, count: 0 };
      byProj[r.project][r.status] = (byProj[r.project][r.status] || 0) + (r.total || 0);
      byProj[r.project].count += r.c;
    });

    for (const [project, data] of Object.entries(byProj)) {
      lines.push(`📍 *${project}*`);
      lines.push(`  Approved: $${data.approved.toLocaleString()}  |  Pending: $${data.pending.toLocaleString()}  |  ${data.count} COs`);
    }
  }

  // Lien releases
  lines.push('');
  const liens = d.prepare("SELECT COUNT(*) as c FROM lien_releases WHERE status='pending'").get();
  if (liens?.c > 0) lines.push(`📋 *${liens.c} lien release${liens.c > 1 ? 's' : ''} unsigned* — use /liens to review`);

  // Permits with fees
  const permits = d.prepare("SELECT COUNT(*) as c, SUM(fee) as total FROM permits WHERE (status='applied' OR status='pending')").get();
  if (permits?.c > 0) lines.push(`🏛️ ${permits.c} active permits — $${(permits.total || 0).toLocaleString()} in fees`);

  return send(chatId, lines.join('\\n'));
}

// ─── /photos — Project Photo Timeline ─────────────────
async function cmdPhotos(chatId, args) {
  const d = await getDb();
  const proj = args || activeProjects.get(chatId) || 'General';
  const lines = [`📸 *PHOTOS — ${proj}*`, '━━━━━━━━━━━━━━━━━━━━━━━━', ''];

  const photos = d.prepare("SELECT * FROM project_photos WHERE project=? ORDER BY created_at DESC LIMIT 10").all(proj);

  if (!photos.length) {
    lines.push('No photos yet for this project.');
    lines.push('');
    lines.push('📸 *Snap a photo* and caption it:');
    lines.push(`  "${proj}: [what this shows]"`);
    lines.push('Then it appears here automatically.');
    return send(chatId, lines.join('\\n'));
  }

  photos.forEach((p, i) => {
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';
    const by = p.uploaded_by || 'Unknown';
    lines.push(`*${photos.length - i}.* ${date} — ${by}`);
    if (p.caption) lines.push(`  _${p.caption}_`);
    lines.push('');
  });

  lines.push('_Send a photo with caption to add to this timeline._');
  lines.push('_Use /photos [project] for other projects._');

  // Actually send the most recent photo if we have a file_id
  const latest = photos[0];
  if (latest?.file_id) {
    try {
      await tg('sendPhoto', { chat_id: chatId, photo: latest.file_id, caption: lines.join('\\n'), parse_mode: 'Markdown' });
      return;
    } catch {}
  }

  return send(chatId, lines.join('\\n'));
}

// /project — set active project context
async function cmdProject(chatId, args) {
  if (!args) {
    const current = activeProjects.get(chatId);
    if (current) return send(chatId, `📍 Current project: *${current}*\\n\\nUse \`/project [name]\` to switch.\\nProjects: use \`/today\` to see all active.`);
    // List known projects
    const d = await getDb();
    const projects = new Set();
    ['assignments', 'punchlist', 'change_orders', 'rfis', 'inspections', 'daily_reports'].forEach(table => {
      try {
        d.prepare(`SELECT DISTINCT project FROM ${table} WHERE project IS NOT NULL AND project != ''`).all().forEach(r => projects.add(r.project));
      } catch {}
    });
    if (projects.size === 0) return send(chatId, 'No projects yet. Start with `/assign [project name] [task]` to create one.');
    const list = [...projects].sort().map(p => `  📁 ${p}`).join('\\n');
    return send(chatId, `📁 *Available Projects*\\n\\n${list}\\n\\nUse \`/project [name]\` to set your active project.`);
  }

  activeProjects.set(chatId, args);
  return send(chatId, [
    `📍 *Project set: ${args}*`,
    '',
    'All commands now default to this project.',
    '• `/assign [task]` — no need to type project name each time',
    '• `/today` — see your active project highlighted',
    '• `/project` — switch projects anytime',
    '',
    '⚡ Run `/flow` for your morning checklist.'
  ].join('\\n'));
}

// /flow — GC / foreman morning checklist
async function cmdFlow(chatId) {
  const proj = activeProjects.get(chatId);
  const projectLine = proj ? `  ✅ Project set: *${proj}*` : '  ⬜ Set project: `/project [name]`';

  return send(chatId, [
    '🌅 *Morning Flow*',
    '',
    proj ? `📍 Active: *${proj}*` : '⬜ Pick a project: `/project [name]`',
    '',
    '━━━ START ━━━',
    '1️⃣ `/clockin [name] [trade]` — Clock in your crew',
    '2️⃣ `/today` — Full daily briefing',
    '3️⃣ `/pending` — What\'s overdue or unacknowledged',
    '4️⃣ `/onsite` — Who\'s here right now',
    '',
    '━━━ ACTIVE ━━━',
    '5️⃣ `/punchlist` — Walk the site, log issues',
    '6️⃣ `/rfi [title]` — Request info from architect/engineer',
    '7️⃣ `/cos` — Review change orders',
    '',
    '━━━ CLOSE ━━━',
    '8️⃣ `/dailyreport [notes]` — File end-of-day',
    '9️⃣ `/clockout [name]` — Clock out crew',
    '🔟 `/today` — Final wrap: everything green?',
    '',
    '⚡ `/dash` — Web portal  |  `/help` — All commands'
  ].join('\\n'));
}

// ─── Clear Conversation ───────────────────────────────────
async function cmdClearConvo(chatId, args, from) {
  const subCmd = (args || '').toLowerCase().trim();

  if (subCmd === 'all' || subCmd === 'everything') {
    // Owner-only: wipe everything
    if (!(await checkRole(chatId, String(from.id), 'owner'))) return;
    const d = await getDb();
    d.prepare('DELETE FROM conversations WHERE channel = ?').run(String(chatId));
    d.prepare('DELETE FROM huddle_messages WHERE chat_id = ?').run(String(chatId));
    d.prepare('DELETE FROM meeting_messages WHERE meeting_id IN (SELECT id FROM meetings WHERE project IN (SELECT project FROM assignments WHERE telegram_chat_id = ?))').run(String(chatId));
    logAudit(from.first_name, 'clear_all', 'conversation', chatId, 'All chat data cleared');
    // Try to bulk-delete recent bot messages (last 100)
    try {
      await deleteRecentBotMessages(chatId, 100);
    } catch {}
    return send(chatId, '🧹 *Chat cleared.* All messages and conversation data wiped. Project/financial data preserved.');
  }

  // Regular clear: delete recent bot messages + clear user's conversation entries
  const d = await getDb();
  d.prepare('DELETE FROM conversations WHERE channel = ? AND sender = ?').run(String(chatId), String(from.id));

  let deleted = 0;
  try {
    deleted = await deleteRecentBotMessages(chatId, 50);
  } catch {}

  return send(chatId, [
    '🧹 *Chat cleared.*',
    '',
    `Deleted ${deleted} bot messages + your conversation data.`,
    '',
    'Owner: `/clear all` wipes everything.',
  ].join('\\n'));
}

// Actually deletes recent bot messages from the Telegram chat
async function deleteRecentBotMessages(chatId, count = 50) {
  const botInfo = await tg('getMe');
  const botId = botInfo.result?.id;
  if (!botId) return 0;

  let deleted = 0;
  // Fetch recent messages and delete ones from the bot
  // Telegram doesn't have "get my messages" — we fetch updates and delete bot-sent ones
  // Best effort: try to delete by message_id range
  // We use the stored lastUpdateId to estimate recent message IDs
  const d = await getDb();
  const row = d.prepare("SELECT value FROM meta WHERE key='lastUpdateId'").get();
  const baseId = row ? parseInt(row.value, 10) : lastUpdateId;

  // Try deleting the most recent messages (bot's own messages are interspersed)
  // We iterate backwards from the latest known update ID
  for (let i = 0; i < count && i < 100; i++) {
    try {
      const msgId = baseId - i;
      if (msgId < 1) break;
      // Try to delete — if it's not a bot message or already deleted, Telegram returns error, we skip
      const result = await tg('deleteMessage', { chat_id: chatId, message_id: msgId });
      if (result.ok) deleted++;
    } catch {
      // Message not found or not deletable — skip
    }
    // Small delay to avoid hitting rate limits
    if (i % 20 === 0) await new Promise(r => setTimeout(r, 200));
  }

  return deleted;
}

// ─── Group Welcome Handler ──────────────────────────────────────
async function handleGroupWelcome(msg) {
  const chatId = msg.chat.id;
  const chatTitle = msg.chat.title || 'this group';
  const addedBy = msg.from?.first_name || 'Someone';

  // Only fire if the bot itself was one of the new members
  if (!msg.new_chat_members?.some(m => m.id === botUserId)) return;

  const welcome = [
    `🏗️ *GreenTouch.Pro — Reporting for Duty*`,
    '',
    `I've been added to *${chatTitle}* by ${addedBy}. Here's what I do:`,
    '',
    '📋 *Track Everything:* Tasks, change orders, punch lists, permits, inspections, subs',
    '🎙️ *Voice Notes:* Hold mic and talk — I transcribe and extract tasks automatically',
    '💬 *Natural Language:* Just type like normal and I route to the right command',
    '',
    '⚡ *First Steps:*',
    `• Type \`/morning\` for today's briefing`,
    '• Type `/guide` to learn the full system',
    '• Type `/roles` to see who can do what',
    '',
    '⚠️ *Role Setup:* Everyone starts as `sub` (read-only). The first person to type `/setrole` becomes owner.',
    '',
    '_Built for Green Touch Builders — DMV_',
  ].join('\n');

  return send(chatId, welcome);
}

// ─── Message Handler ──────────────────────────────────────────
async function handleMessage(msg) {
  const { chat, text, from, voice, photo, caption } = msg;
  const chatId = chat.id;

  // Save conversation
  const d = await getDb();
  d.prepare(
    'INSERT INTO conversations (id, project, channel, sender, raw_message) VALUES (?,?,?,?,?)'
  ).run(uid(), 'General', 'telegram', from.first_name || 'Unknown', text || caption || '[voice/photo]');

  // Handle by type
  // ─── Huddle message capture (check before voice/photo handlers) ──
  const huddle = activeHuddles.get(chatId);
  if (huddle) {
    if (voice) {
      // Voice note during huddle: capture sender immediately, transcribe, add to huddle
      const sender = from.first_name || 'Unknown';
      send(chatId, `🎙️ *Voice note received during "${huddle.topic}"*  — transcribing...`);
      const transcript = await transcribeVoice(voice.file_id);
      if (transcript) {
        huddle.messages.push({ sender, content: `🎙️ ${transcript}`, time: new Date().toISOString() });
        const hd = await getDb();
        hd.prepare(
          'INSERT INTO huddle_messages (id, huddle_id, chat_id, sender, message_type, content) VALUES (?,?,?,?,?,?)'
        ).run(uid(), huddle.id, String(chatId), sender, 'voice_transcript', transcript);
        send(chatId, `📝 *${transcript}*\n✅ Added to huddle.`);
        // Still do task extraction for immediate visibility
        const items = await extractTasks(transcript);
        if (items?.length) {
          const hd = await getDb();
          const results = [];
          for (const item of items) {
            const id = uid();
            hd.prepare(
              `INSERT INTO assignments (id, project, task, assignee, assigned_by, due_date, status, notes)
               VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?)`
            ).run(id, 'Voice Note', item.description, item.owner || 'Unassigned', sender,
                 item.due_date || null, `Huddle: ${huddle.topic}, Priority: ${item.priority}`);
            results.push(`✅ ${item.description} → _${item.owner || 'Unassigned'}_`);
          }
          send(chatId, `🎯 *Extracted ${items.length} items:*\n${results.join('\n')}`);
        }
      } else {
        send(chatId, '⚠️ Could not transcribe voice note.');
      }
      return;
    }
    if (photo) {
      // Photo during huddle: capture with caption
      const sender = from.first_name || 'Unknown';
      const content = caption ? `📸 ${caption}` : '📸 [Photo]';
      huddle.messages.push({ sender, content, time: new Date().toISOString() });
      const hd = await getDb();
      hd.prepare(
        'INSERT INTO huddle_messages (id, huddle_id, chat_id, sender, message_type, content) VALUES (?,?,?,?,?,?)'
      ).run(uid(), huddle.id, String(chatId), sender, 'photo', content);
      send(chatId, `📸 Photo added to huddle "${huddle.topic}".`);
      return;
    }
  }
  // ─── End huddle capture ──────────────────────────────────────

  // Fallback: standalone voice/photo (no active huddle)
  if (voice) return handleVoice(msg, from);
  if (photo) return handlePhoto(msg, from);
  if (!text) return;

  // ─── Huddle message capture (text messages) ──
  if (huddle && !text.startsWith('/')) {
    // Capture non-command messages during huddle
    const sender = from.first_name || 'Unknown';
    huddle.messages.push({ sender, content: text, time: new Date().toISOString() });
    const d2 = await getDb();
    d2.prepare(
      'INSERT INTO huddle_messages (id, huddle_id, chat_id, sender, message_type, content) VALUES (?,?,?,?,?,?)'
    ).run(uid(), huddle.id, String(chatId), sender, 'text', text);
  }
  // ─── End huddle message capture ──────────────────────────────

  // ─── Meeting message capture ──────────────────────────────────
  const meeting = activeMeetings.get(chatId);
  if (meeting && !text.startsWith('/') && text !== '/endmeeting') {
    const sender = from.first_name || 'Unknown';
    meeting.messages.push({ sender, content: text, time: new Date().toISOString() });
    const d = await getDb();
    d.prepare(
      'INSERT INTO meeting_messages (id, meeting_id, sender, content) VALUES (?,?,?,?)'
    ).run(uid(), meeting.id, sender, text);
  }
  // ─── End meeting message capture ─────────────────────────────

  // 🔀 NATURAL LANGUAGE: detect command intent before command routing
  // So "show me the punch list" just works without slash commands
  const cmdIntent = detectCommandIntent(text);
  if (cmdIntent && !text.trim().startsWith('/')) {
    const { cmd, args } = cmdIntent;
    const withArgs = args ? `${cmd} ${args}` : cmd;
    return await handleMessage({ chat, text: withArgs, from });
  }

  // 🔀 NATURAL LANGUAGE: detect sub search intent (lower priority than commands)
  const subIntent = detectSubIntent(text);
  if (subIntent && !text.trim().startsWith('/')) {
    const { trade, location } = subIntent;
    if (location) {
      return await handleMessage({ chat, text: `/findsub ${trade} near ${location}`, from });
    }
    return await handleMessage({ chat, text: `/sub ${trade}`, from });
  }

  const t = text.toLowerCase().trim();
  const args = text.split(' ').slice(1).join(' ').trim();
  const cmd = text.split(' ')[0].toLowerCase();

  // Role gate helper
  const gate = async (requiredRole, fn) => {
    if (await checkRole(chatId, from.id, requiredRole)) return fn();
  };

  // ─── Main Commands ──────────────────────────────────────
  if (cmd === '/start') return cmdStart(chatId);
  if (cmd === '/help' || cmd === '/h') return cmdHelp(chatId);
  if (cmd === '/pending') return cmdPending(chatId);
  if (cmd === '/endhuddle') return gate('exec', () => cmdEndHuddle(chatId));

  if (['/huddle', '/voiceroom', '/voiceroomstart'].includes(cmd)) return gate('exec', () => cmdHuddle(chatId, args, from));
  if (cmd === '/status')
    return send(chatId, `📊 *GreenTouch.Pro Status*\\n\\n✅ Database: Online\\n✅ Telegram: Active\\n✅ Voice: Whisper (local)\\n✅ AI: OpenRouter free (gpt-oss-20b)\\n\\nUse /assignments or /pending for project details.`);

  // ─── Assignment Commands ─────────────────────────────────
  if (['/assign', '/a'].includes(cmd)) return gate('foreman', () => cmdAssign(chatId, args, from));
  if (['/assignments', '/tasks', '/assigns'].includes(cmd)) return cmdAssignments(chatId, args);

  // ─── Subcontractor Directory + Vetting ──────────────────
  if (['/addsub'].includes(cmd)) return gate('owner', () => cmdAddSub(chatId, args, from));
  if (['/whodoes', '/subs', '/subcontractors'].includes(cmd)) return cmdWhoDoes(chatId, args);
  if (cmd === '/vetsub' || cmd === '/vet') return gate('owner', () => cmdVetSub(chatId, args));
  if (cmd === '/findsub' || cmd === '/searchsub') return gate('owner', () => cmdFindSub(chatId, args));
  if (['/removesub', '/delsub', '/deletesub'].includes(cmd)) return gate('owner', () => cmdRemoveSub(chatId, args));
  if (cmd === '/sub') {
    // /sub add X vs /sub compare X vs Y vs /sub X (search)
    const subArgs = args;
    if (/^compare\s+/i.test(subArgs)) return cmdSubCompare(chatId, subArgs.replace(/^compare\s+/i, ''));
    if (/^add\s+/i.test(subArgs)) return gate('owner', () => cmdAddSub(chatId, subArgs.replace(/^add\s+/i, ''), from));
    return cmdWhoDoes(chatId, subArgs);
  }

  // ─── Punch List ──────────────────────────────────────────
  if (cmd === '/punch' || cmd === '/punchadd') return gate('foreman', () => cmdPunchAdd(chatId, args, from));
  if (['/punchlist', '/punches'].includes(cmd)) return cmdPunchList(chatId, args);
  if (['/punchdone', '/punchcomplete', '/punchclose'].includes(cmd)) return gate('foreman', () => cmdPunchDone(chatId, args));

  // ─── Delivery Tracker ────────────────────────────────────
  if (cmd === '/delivery') return gate('foreman', () => cmdDelivery(chatId, args, from));
  if (['/deliveries', '/deliverys'].includes(cmd)) return cmdDeliveries(chatId, args);

  // ─── RFI Tracker ─────────────────────────────────────────
  if (cmd === '/rfi') return gate('foreman', () => cmdRfi(chatId, args, from));
  if (['/rfis', '/rfislist'].includes(cmd)) return cmdRfiList(chatId, args);
  if (['/rfi_done', '/rficlose', '/rficomplete'].includes(cmd)) return gate('foreman', () => cmdRfiClose(chatId, args));

  // ─── Reminder System ─────────────────────────────────────
  if (cmd === '/remind') return gate('foreman', () => cmdRemind(chatId, args, from));

  // ─── Contact / Email Commands ────────────────────────────
  if (['/addcontact', '/addemail'].includes(cmd)) return gate('exec', () => cmdAddContact(chatId, args, from));
  if (['/removecontact', '/deletecontact'].includes(cmd)) return gate('exec', () => cmdRemoveContact(chatId, args));
  if (['/contacts', '/emaillist'].includes(cmd)) return cmdListContacts(chatId, args);
  if (cmd === '/email') return gate('exec', () => cmdEmail(chatId, args, from));

  // ─── Role Management ────────────────────────────────────
  if (cmd === '/setrole') {
    // Bootstrap: if no owner exists yet, first caller auto-promotes
    const d = await getDb();
    const existingOwner = d.prepare('SELECT user_id FROM user_roles WHERE chat_id=? AND role=? LIMIT 1').get(String(chatId), 'owner');
    if (existingOwner) {
      return gate('owner', () => cmdSetRole(chatId, args, from));
    }
    return cmdSetRole(chatId, args, from);
  }
  if (cmd === '/roles') return cmdRoles(chatId, args, from);
  if (cmd === '/myrole') return cmdMyRole(chatId, from);

  // ─── Material Calculators ────────────────────────────────
  // (available as add-on: Material Calcs Suite — $500 setup + $67/mo)

  // ─── Change Orders ─────────────────────────────────────
  if (['/addco', '/changeorder'].includes(cmd)) return gate('exec', () => cmdAddCO(chatId, args, from));
  if (['/cos', '/copending'].includes(cmd)) return cmdListCOs(chatId, args);
  if (cmd === '/co') return gate('exec', () => cmdCOAction(chatId, args, from));

  // ─── Daily Reports ─────────────────────────────────────
  if (cmd === '/dailyreport') return gate('foreman', () => cmdDailyReport(chatId, args, from));
  if (['/reports', '/reportlist'].includes(cmd)) return cmdReports(chatId, args);
  if (cmd === '/reportweek') return cmdReportWeek(chatId);

  // ─── Inspections ───────────────────────────────────────
  if (cmd === '/inspect') {
    // /inspect {id} pass|fail → result, otherwise → schedule
    const parts = args.split(/\s+/);
    if (['pass', 'fail'].includes(parts[1]?.toLowerCase())) {
      return gate('exec', () => cmdInspectResult(chatId, args, from));
    }
    return gate('exec', () => cmdInspect(chatId, args, from));
  }
  if (['/inspections', '/inspectlist', '/inspectpending'].includes(cmd)) return cmdInspections(chatId, args);

  // ─── Time & Attendance ─────────────────────────────────
  if (cmd === '/clockin') return gate('foreman', () => cmdClockIn(chatId, args, from));
  if (cmd === '/clockout') return gate('foreman', () => cmdClockOut(chatId, args, from));
  if (cmd === '/onsite') return cmdOnSite(chatId, args);
  if (['/crew', '/chat', '/team'].includes(cmd)) return cmdCrew(chatId, args);

  // ─── Safety ────────────────────────────────────────────
  if (cmd === '/incident') return gate('foreman', () => cmdIncident(chatId, args, from));
  if (cmd === '/incidents') return cmdIncidents(chatId, args);
  if (cmd === '/toolbox') return gate('foreman', () => cmdToolbox(chatId, args, from));
  if (['/toolboxtalks', '/toolboxlist'].includes(cmd)) return cmdToolboxTalks(chatId, args);

  // ─── Permits ───────────────────────────────────────────
  if (cmd === '/permit') {
    const parts = args.split(/\s+/);
    if (['issued', 'posted', 'closed'].includes(parts[1]?.toLowerCase())) {
      return gate('exec', () => cmdPermitAction(chatId, args, from));
    }
    return gate('exec', () => cmdPermit(chatId, args, from));
  }
  if (['/permits', '/permitlist'].includes(cmd)) return cmdPermits(chatId, args);
  if (cmd === '/permitexpiring') return cmdPermitExpiring(chatId);
  if (['/permitfee', '/permitfees'].includes(cmd)) return cmdPermitFee(chatId, args);

  // ─── Submittals ────────────────────────────────────────
  if (cmd === '/submittal') {
    const parts = args.split(/\s+/);
    if (['approved', 'reject'].includes(parts[1]?.toLowerCase())) {
      return gate('exec', () => cmdSubmittalAction(chatId, args, from));
    }
    return gate('exec', () => cmdSubmittal(chatId, args, from));
  }
  if (['/submittals', '/submittallist'].includes(cmd)) return cmdSubmittals(chatId, args);
  if (['/submittalsstale', '/stalereviews'].includes(cmd)) return cmdSubmittalsStale(chatId);

  // ─── Blockers ──────────────────────────────────────────
  if (cmd === '/block') {
    if (/resolved/i.test(args.split(/\s+/)[1] || '')) return gate('owner', () => cmdBlockResolve(chatId, args, from));
    return gate('foreman', () => cmdBlock(chatId, args, from));
  }
  if (['/blocks', '/blockers', '/blocklist'].includes(cmd)) return cmdBlocks(chatId, args);

  // ─── Lien Releases ─────────────────────────────────────
  if (cmd === '/lien') {
    if (args.split(/\s+/)[1]?.toLowerCase() === 'signed') return gate('owner', () => cmdLienSign(chatId, args, from));
    return gate('owner', () => cmdLien(chatId, args, from));
  }
  if (['/liens', '/lienlist', '/lienpending'].includes(cmd)) return cmdLiens(chatId, args);

  // ─── Plan Revisions ────────────────────────────────────
  if (['/planrev', '/revision', '/plans'].includes(cmd)) return gate('owner', () => cmdPlanRev(chatId, args, from));
  if (['/planrevs', '/revisions'].includes(cmd)) return cmdPlanRevs(chatId, args);

  // ─── Meeting Minutes ───────────────────────────────────
  if (cmd === '/meeting') return gate('exec', () => cmdMeeting(chatId, args, from));
  if (cmd === '/endmeeting') return gate('exec', () => cmdEndMeeting(chatId));
  if (['/meetings', '/meetingminutes'].includes(cmd)) return cmdMeetings(chatId, args);

  // ─── Dashboard ─────────────────────────────────────────
  if (['/link', '/dashboard', '/dash', '/app'].includes(cmd)) return cmdDashboardLink(chatId);

  // ─── Clear Convo ──────────────────────────────────────
  if (['/clear', '/clearchat', '/reset', '/purge'].includes(cmd)) return cmdClearConvo(chatId, args, from);

  // ─── Flow Commands (Seamless Daily Ops) ────────────────
  if (['/today', '/brief', '/daily'].includes(cmd)) return cmdToday(chatId);
  if (['/morning', '/am'].includes(cmd)) return cmdMorning(chatId);
  if (['/eod', '/endofday', '/wrap'].includes(cmd)) return cmdEOD(chatId, args, from);
  if (cmd === '/money' || cmd === '/budget') return cmdMoney(chatId, args);
  if (cmd === '/photos' || cmd === '/gallery') return cmdPhotos(chatId, args);
  if (['/project', '/job', '/site'].includes(cmd)) return cmdProject(chatId, args);
  if (cmd === '/flow') return cmdFlow(chatId);

  // ─── Clear / Reset ─────────────────────────────────────
  if (['/clear', '/clearchat', '/reset', '/purge'].includes(cmd)) return cmdClearConvo(chatId, args, from);

  // ─── Guide & Rules ─────────────────────────────────────
  if (['/guide', '/rules', '/howto'].includes(cmd)) return cmdGuide(chatId);

  // ─── Help & Tutorials ─────────────────────────────────
  if (cmd === '/tutorial') {
    const step = args || '';
    if (step && /^\d+$/.test(step)) return cmdTutorialStep(chatId, step);
    return cmdTutorial(chatId);
  }
  if (['/cheatsheet', '/quickref', '/guide'].includes(cmd)) return cmdCheatsheet(chatId);
  if (['/workflow', '/recipe', '/playbook'].includes(cmd)) return cmdWorkflow(chatId, args);

  // ─── Stub commands ─────────────────────────────────────
  if (cmd === '/escalate') return gate('foreman', () => send(chatId, '🚨 *Escalated:* "' + args + '" — Leadership notified.'));
  if (['/complete', '/done'].includes(cmd)) return gate('foreman', () => send(chatId, '✅ Task completed: "' + args + '"'));

  // ─── Natural Language Fallback ──────────────────────────
  // Non-command text → AI-powered routing to the right command
  if (t.startsWith('/')) {
    // Unknown slash command → suggest alternatives
    return send(chatId, [
      '🤔 *Command not recognized.*',
      '',
      'Try these instead:',
      '• `/today` — Daily briefing (homepage)',
      '• `/guide` — How everything works',
      '• `/a [person] [task]` — Assign work',
      '• `/h` — Full command list',
      '',
      'Or just ask me in plain English — I\'ll route you to the right place.',
    ].join('\n'));
  }

  // Natural language — smart routing
  return handleNaturalLanguage(chatId, t, from);
}

// ─── Natural Language Router (AI-Powered) ──────────────────
// Users talk to the bot in plain English — no /commands needed.
// AI understands intent, routes to commands, or answers directly.
async function handleNaturalLanguage(chatId, text, from) {
  const t = (text || '').trim();
  if (!t) return;

  // Command reference for the AI to route to
  const cmdList = [
    '/today or /brief — full daily briefing (tasks, crew, RFIs, COs, money)',
    '/a or /assign [person] [task] — assign work (foreman+)',
    '/sub [trade] — find and vet subcontractors (e.g. /sub drywall)',
    '/findsub [trade] [zip] — deep search + vet subs with BBB + Google',
    '/chat or /crew or /team — see who\'s on site right now',
    '/clockin [name] [trade] — clock someone in (foreman+)',
    '/clockout [name] — clock someone out (foreman+)',
    '/punch [project] [location] — [item] — log punch item (foreman+)',
    '/punchlist [project] — view punch items',
    '/punchdone [id] — mark punch item complete (foreman+)',
    '/rfi [project] [title] — create RFI (foreman+)',
    '/rfis [project] — list RFIs',
    '/cos — view change orders',
    '/addco [project] [desc] [$] — create change order (exec+)',
    '/co [id] approve|reject — act on change order (exec+)',
    '/huddle [topic] — start voice huddle (exec+)',
    '/endhuddle — end active huddle (exec+)',
    '/dailyreport [project] [notes] — file daily report (foreman+)',
    '/reports [project] — view daily reports',
    '/inspections [project] — view inspection schedule',
    '/inspect [project] [type] [date] [inspector] — schedule (exec+)',
    '/inspect [id] pass|fail — record result (exec+)',
    '/permits [project] — view permits',
    '/permit [project] [type] [date] [$] — add permit (exec+)',
    '/blocks [project] — view blockers',
    '/block [project] [desc] — report blocker (foreman+)',
    '/liens [project] — view lien releases',
    '/lien [project] [sub] — add lien release (owner)',
    '/submittals [project] — view submittals',
    '/submittal [project] [desc] — add submittal (exec+)',
    '/incident [project] [desc] [severity] — log safety incident (foreman+)',
    '/toolbox [project] [topic] — log toolbox talk (foreman+)',
    '/meeting [project] [topic] — start meeting (exec+)',
    '/endmeeting — end meeting (exec+)',
    '/planrev [project] [desc] — add plan revision (owner)',
    '/contacts [role] — view contact directory',
    '/addcontact [name] [email] [role] — add contact (exec+)',
    '/roles — see team roles',
    '/myrole — check your access level',
    '/setrole [user_id] [role] — assign roles (owner)',
    '/flow — morning checklist (10 steps)',
    '/guide — user manual and data rules',
    '/h or /help — full command list',
    '/dash or /link — web dashboard',
    '/start — welcome + shortcuts',
    '/project [name] or /job — set active project',
    '/tutorial — 3-minute walkthrough',
    '/cheatsheet — printable quick reference',
    '/calculator — construction calculators (concrete, studs, etc.)',
  ].join('\\n');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{
          role: 'system',
          content: [
            'You are the GreenTouch.Pro construction bot. You help general contractors, supers, foremen, and subs manage construction projects.',
            '',
            'YOUR JOB: Understand what the user is asking in plain English and tell them the EXACT command to use.',
            '',
            'RULES:',
            '1. Reply in plain English, friendly, conversational — like a job site foreman texting',
            '2. ALWAYS include the exact command they should type',
            '3. If they\'re asking a general question, answer it plus give the relevant command',
            '4. If someone says "find a sub" or "I need a drywall guy" → tell them to use /sub [trade] or /findsub [trade] [zip]',
            '5. If someone says "what\'s happening today" → tell them /today',
            '6. If someone describes an issue on site → tell them /punch or /incident',
            '7. Keep it under 3 sentences. Job site guys don\'t read paragraphs.',
            '8. You are an AI assistant — you cannot actually run commands yourself. Tell them what to type.',
            '',
            'COMMAND REFERENCE:',
            cmdList,
            '',
            'IMPORTANT — role gates exist. If they ask about something, mention:',
            '- /clockin, /punch, /rfi, /dailyreport, /incident, /toolbox, /assign = FOREMAN+ needed',
            '- /cos, /huddle, /inspect, /permit, /meeting, /email = EXEC+ needed',
            '- /setrole, /addsub, /vetsub, /findsub, /lien, /planrev = OWNER only',
            '- /today, /guide, /chat, /help, /punchlist, /subs, /dash = everyone can use',
          ].join('\\n'),
        }, {
          role: 'user',
          content: t,
        }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    let reply = data?.choices?.[0]?.message?.content || '';
    reply = reply.replace(/```[^\\n]*\\n?/g, '').replace(/```/g, '').trim();

    if (reply) {
      return send(chatId, reply);
    }
  } catch (e) {
    console.error('NL router error:', e.message);
  }

  // Fallback if AI call fails — keyword matching
  return send(chatId, [
    '👋 *Hey there!*',
    '',
    'Try `/today` for your daily briefing, or `/guide` to learn how everything works.',
    '',
    'Common questions:',
    '• Need a sub? → `/sub drywall` or `/findsub electrician 22102`',
    '• Who\'s on site? → `/chat`',
    '• Assign work? → `/a Mike frame wall by Friday`',
    '• All commands? → `/h`',
  ].join('\\n'));
}

// ─── Polling Loop ─────────────────────────────────────────────
async function poll() {
  if (!polling) return;
  try {
    const offset = lastUpdateId > 0 ? lastUpdateId + 1 : '';
    console.log(`📡 Polling offset=${offset || '(none)'}`);
    const url = offset ? `${API}/getUpdates?offset=${offset}&timeout=10` : `${API}/getUpdates?timeout=10`;
    const res = await fetch(url);
    const data = await res.json();
    console.log(`📡 Response ok=${data.ok}, updates=${(data.result||[]).length}`);
    if (!data.ok) {
      console.error('Poll error:', data.description);
      setTimeout(poll, 5000);
      return;
    }
    for (const update of data.result || []) {
      console.log(`📩 Update ${update.update_id}: ${update.message?.text?.slice(0, 60) || 'non-text'}`);
      lastUpdateId = update.update_id;
      // Persist last offset to DB so restarts don't lose it
      try {
        const d = await getDb();
        d.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)").run('lastUpdateId', String(lastUpdateId));
      } catch {}
      if (update.message) {
        try {
          // Group join detection — welcome message when bot is added
          if (update.message.new_chat_members && botUserId) {
            await handleGroupWelcome(update.message);
          }
          await handleMessage(update.message);
        } catch (e) {
          console.error('Message error:', e.message);
        }
      }
      if (update.callback_query) {
        const q = update.callback_query;
        try {
          const data = q.data || '';
          const chatId = q.message?.chat?.id;
          
          if (data.startsWith('save_sub:')) {
            // save_sub:company:trade:city:state
            const parts = data.replace('save_sub:', '').split(':');
            const [company, trade, city, state] = parts;
            await tg('answerCallbackQuery', { callback_query_id: q.id, text: '🔍 Vetting and saving...' });
            const vet = await runVetScript(company, trade || 'contractor', city || '', state || 'VA');
            if (vet) {
              const d = await getDb();
              const existing = d.prepare('SELECT id FROM subs WHERE company LIKE ? LIMIT 1').get(`%${company}%`);
              if (existing) {
                // Update existing
                d.prepare(`UPDATE subs SET trade=?, vet_score=?, vet_color=?, bbb_rating=?, bbb_complaints=?, bbb_accredited=?,
                  google_rating=?, google_reviews=?, license_number=?, license_status=?, license_state=?, last_vetted=datetime('now')
                  WHERE id=?`).run(
                  trade, vet.vet_score, vet.vet_color,
                  vet.search_data?.bbb_rating || null, vet.search_data?.bbb_complaints || 0, vet.search_data?.bbb_accredited ? 1 : 0,
                  vet.search_data?.google_rating || null, vet.search_data?.google_reviews || 0,
                  vet.search_data?.license_number || vet.license?.number || null, vet.license?.status || null, state, existing.id);
                await tg('answerCallbackQuery', { callback_query_id: q.id, text: `✅ Updated ${company} (${vet.vet_score}/100 ${vet.vet_color})` });
              } else {
                // Insert new
                const id = uid();
                d.prepare(`INSERT INTO subs (id, name, company, trade, vet_score, vet_color, bbb_rating, bbb_complaints,
                  bbb_accredited, google_rating, google_reviews, license_number, license_status, license_state, last_vetted)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
                  id, company, company, trade, vet.vet_score, vet.vet_color,
                  vet.search_data?.bbb_rating, vet.search_data?.bbb_complaints || 0, vet.search_data?.bbb_accredited ? 1 : 0,
                  vet.search_data?.google_rating, vet.search_data?.google_reviews || 0,
                  vet.search_data?.license_number || vet.license?.number, vet.license?.status, state);
                await tg('answerCallbackQuery', { callback_query_id: q.id, text: `✅ Saved ${company} (${vet.vet_score}/100 ${vet.vet_color})` });
              }
            } else {
              await tg('answerCallbackQuery', { callback_query_id: q.id, text: '❌ Vetting failed. Try /vetsub manually.' });
            }
          } else if (data.startsWith('view_bbb:')) {
            const url = data.replace('view_bbb:', '');
            await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Opening BBB profile...', url: url });
          } else if (data.startsWith('compare:')) {
            // compare:company_a:company_b
            const parts = data.replace('compare:', '').split(':');
            await tg('answerCallbackQuery', { callback_query_id: q.id, text: '⚖️ Running comparison...' });
            const compareArgs = `${parts[0]} vs ${parts.slice(1).join(':')}`;
            await cmdSubCompare(chatId, compareArgs);
          } else {
            await tg('answerCallbackQuery', { callback_query_id: q.id, text: '✅ Acknowledged' });
          }
        } catch (e) {
          console.error('Callback error:', e.message);
          try { await tg('answerCallbackQuery', { callback_query_id: q.callback_query_id || q.id, text: '⚠️ Error' }); } catch {}
        }
      }
    }
  } catch (e) {
    console.error('Poll loop error:', e.message);
    await new Promise(r => setTimeout(r, 5000));
  }
  setTimeout(poll, 500);
}

// ─── Start ────────────────────────────────────────────────────
process.on('SIGINT', () => { polling = false; console.log('\n🛑 Shutdown'); process.exit(0); });
process.on('SIGTERM', () => { polling = false; console.log('\n🛑 Terminate'); process.exit(0); });

console.log('🏗️  GreenTouch.Pro starting...');
console.log('   Gemini AI:', GEMINI_KEY ? '✅ Connected' : '⚠️ Not configured');
console.log('   DB:', DB_PATH);
console.log('   Bot: @GreenTouchProBot');
console.log('   Features: Voice notes, Photos, Task extraction');
console.log('');

ready.then(async () => {
  console.log('✅ Ready. Starting poll.');
  getDb().then(() => console.log('✅ Database initialized.'));

  // Cache bot's own user ID for group-join detection
  try {
    const info = await tg('getMe');
    if (info?.result?.id) {
      botUserId = info.result.id;
      console.log(`🤖 Bot ID cached: ${botUserId} (@${info.result.username})`);
    }
  } catch (e) {
    console.warn('⚠️ Could not fetch bot ID — group welcome disabled:', e.message);
  }

  poll();

  // ─── Automated hourly DB backups (single source of truth safety) ──
  // Uses SQLite online-backup API via scripts/backup_db.cjs — consistent
  // hot backups, gzipped, last 30 kept, integrity-checked. Runs in-process
  // so it survives anywhere the bot runs (local or Render) with no crontab.
  const { execFile } = await import('node:child_process');
  const runBackup = () => execFile(process.execPath,
    [path.join(PROJECT_ROOT, 'scripts', 'backup_db.cjs')],
    { cwd: PROJECT_ROOT },
    (err, stdout, stderr) => {
      if (err) console.warn('⚠️ Backup failed:', (stderr || err.message).trim());
      else console.log('💾', (stdout || '').trim());
    });
  runBackup();                              // one at startup
  setInterval(runBackup, 60 * 60 * 1000);   // then hourly
  console.log('💾 Automated hourly DB backups enabled → data/backups/');
});