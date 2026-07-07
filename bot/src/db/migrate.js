/**
 * GreenTouch.Pro — Database Schema & Migration
 * 
 * Phase 1 Core Tables:
 *   users, projects, project_members, assignments, 
 *   assignment_notifications, daily_reports, conversations,
 *   messages, audit_logs, reliability_scores
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hermes.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    -- ─── Users ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT,
      role          TEXT DEFAULT 'worker',
      telegram_username TEXT,
      telegram_chat_id  TEXT,
      avatar_url    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );

    -- ─── Projects ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      status        TEXT DEFAULT 'active',
      health_score  INTEGER DEFAULT 100,
      address       TEXT,
      client_name   TEXT,
      start_date    TEXT,
      end_date      TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );

    -- ─── Project Members ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS project_members (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL,
      user_id       TEXT NOT NULL,
      role          TEXT DEFAULT 'worker',
      added_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ─── Assignments (THE CORE) ────────────────────────────
    CREATE TABLE IF NOT EXISTS assignments (
      id                TEXT PRIMARY KEY,
      project_id        TEXT,
      project_name      TEXT,
      task              TEXT NOT NULL,
      description       TEXT,
      assignee_id       TEXT,
      assignee_name     TEXT NOT NULL,
      assignee_email    TEXT,
      assignee_telegram TEXT,
      assigned_by       TEXT DEFAULT 'GreenTouch.Pro',
      assigned_by_name  TEXT,
      due_date          TEXT,
      priority          TEXT DEFAULT 'normal',
      is_critical       INTEGER DEFAULT 0,
      status            TEXT DEFAULT 'pending',
      notified_at       TEXT,
      notified_method   TEXT,
      acknowledged_at   TEXT,
      acknowledged_via  TEXT,
      completed_at      TEXT,
      escalated_at      TEXT,
      blocked_reason    TEXT,
      notes             TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      created_by        TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_assignments_status 
      ON assignments(status);
    CREATE INDEX IF NOT EXISTS idx_assignments_project 
      ON assignments(project_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_assignee 
      ON assignments(assignee_name);

    -- ─── Assignment Notifications ──────────────────────────
    CREATE TABLE IF NOT EXISTS assignment_notifications (
      id                TEXT PRIMARY KEY,
      assignment_id     TEXT NOT NULL,
      notification_type TEXT DEFAULT 'assignment',
      method            TEXT NOT NULL,
      recipient         TEXT NOT NULL,
      recipient_type    TEXT DEFAULT 'assignee',
      subject           TEXT,
      body              TEXT,
      sent_at           TEXT,
      delivered         INTEGER DEFAULT 0,
      error_message     TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id)
    );

    -- ─── Daily Reports ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS daily_reports (
      id            TEXT PRIMARY KEY,
      project_id    TEXT,
      project_name  TEXT,
      reported_by   TEXT,
      date          TEXT,
      workers_count INTEGER DEFAULT 0,
      progress_note TEXT,
      issues        TEXT,
      safety_notes  TEXT,
      weather       TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- ─── Conversations ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS conversations (
      id            TEXT PRIMARY KEY,
      project_id    TEXT,
      channel       TEXT,
      source        TEXT DEFAULT 'telegram',
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- ─── Messages ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id       TEXT,
      sender_name     TEXT,
      content         TEXT NOT NULL,
      classification  TEXT,
      confidence      REAL DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    -- ─── Audit Logs (IMMUTABLE) ────────────────────────────
    CREATE TABLE IF NOT EXISTS audit_logs (
      id            TEXT PRIMARY KEY,
      actor_id      TEXT,
      actor_name    TEXT,
      action        TEXT NOT NULL,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT NOT NULL,
      old_value     TEXT,
      new_value     TEXT,
      metadata      TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- ─── Reliability Scores ────────────────────────────────
    CREATE TABLE IF NOT EXISTS reliability_scores (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      user_name     TEXT,
      score         INTEGER DEFAULT 100,
      total_assignments   INTEGER DEFAULT 0,
      acknowledged_count  INTEGER DEFAULT 0,
      completed_on_time   INTEGER DEFAULT 0,
      missed_deadlines    INTEGER DEFAULT 0,
      escalated_count     INTEGER DEFAULT 0,
      calculated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ─── Change Orders ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_orders (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      description   TEXT NOT NULL,
      cost          REAL DEFAULT 0,
      requested_by  TEXT,
      status        TEXT DEFAULT 'pending',
      approved_by   TEXT,
      approved_at   TEXT,
      rejection_reason TEXT,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );
  `);

  // ─── Daily Reports ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      report_date   TEXT NOT NULL,
      weather       TEXT,
      temp_high     INTEGER,
      temp_low      INTEGER,
      crew_count    INTEGER DEFAULT 0,
      narrative     TEXT,
      tasks_done    TEXT,
      deliveries_received TEXT,
      issues         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );
  `);

  // ─── Inspections ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      type          TEXT NOT NULL,
      scheduled_date TEXT,
      scheduled_time TEXT,
      inspector     TEXT,
      status        TEXT DEFAULT 'scheduled',
      result_notes  TEXT,
      reinspection_date TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );
  `);

  // ─── Time & Attendance ──────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id            TEXT PRIMARY KEY,
      worker_name   TEXT NOT NULL,
      trade         TEXT,
      project       TEXT,
      clock_in      TEXT NOT NULL,
      clock_out     TEXT,
      hours         REAL,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── Safety ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      description   TEXT NOT NULL,
      severity      TEXT DEFAULT 'minor',
      reported_by   TEXT,
      reported_at   TEXT DEFAULT (datetime('now')),
      notes         TEXT
    );
    CREATE TABLE IF NOT EXISTS toolbox_talks (
      id            TEXT PRIMARY KEY,
      project       TEXT NOT NULL,
      topic         TEXT NOT NULL,
      presenter     TEXT,
      attendance    INTEGER DEFAULT 0,
      talk_date     TEXT DEFAULT (date('now')),
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      created_by    TEXT
    );
  `);

  console.log('✅ GreenTouch.Pro database schema initialized:', DB_PATH);
  return db;
}

// ─── Seed Demo Data ──────────────────────────────────────────
export async function seed() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) return { seeded: false, message: 'Data already exists' };

  const { nanoid } = await import('nanoid');

  // Leadership users
  const users = [
    { id: nanoid(), name: 'Pat Kavros',    email: 'pat@greentouchbuilders.com',       role: 'executive' },
    { id: nanoid(), name: 'Paul Lee',      email: 'paul.lee@greentouchbuilders.com',  role: 'executive' },
    { id: nanoid(), name: 'Graham Morris', email: 'graham@greentouchbuilders.com',    role: 'executive' },
    { id: nanoid(), name: 'Mike',          email: null, role: 'super' },
    { id: nanoid(), name: 'Sarah',         email: null, role: 'pm' },
    { id: nanoid(), name: 'John',          email: null, role: 'worker' },
  ];

  const insert = db.prepare(
    'INSERT INTO users (id, name, email, role) VALUES (?,?,?,?)'
  );
  for (const u of users) insert.run(u.id, u.name, u.email, u.role);

  // Demo project
  const projectId = nanoid();
  db.prepare('INSERT INTO projects (id, name, status) VALUES (?,?,?)')
    .run(projectId, 'Woodbridge Medical Office', 'active');

  console.log('✅ Demo data seeded:', users.length, 'users, 1 project');
  return { seeded: true };
}

export default db;