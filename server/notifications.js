/**
 * Hermes Notifications — Telegram + Email with leadership escalation
 */

import nodemailer from 'nodemailer';
import { nanoid } from 'nanoid';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || process.env.HERMES_DB || path.join(__dirname, 'data', 'greentouch.db');
const db = new Database(dbPath);

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
} = process.env;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(SMTP_PORT || '465'),
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// Green Touch leadership (always CC on critical/escalated items)
const LEADERSHIP = [
  { name: "Pat Kavros", email: "pat@greentouchbuilders.com" },
  { name: "Paul Lee", email: "paul.lee@greentouchbuilders.com" },
  { name: "Graham Morris", email: "graham@greentouchbuilders.com" },
];

function logAssignment(assign) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO assignments
    (id, project, task, assignee, assignee_email, telegram_chat_id,
     assigned_by, assigned_at, due_date, status,
     notified_at, notified_method, acknowledged_at, acknowledged_method, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  stmt.run(
    assign.id, assign.project, assign.task, assign.assignee,
    assign.assignee_email || null, assign.telegram_chat_id || null,
    assign.assigned_by || 'Hermes', assign.assigned_at || new Date().toISOString(),
    assign.due_date || null, assign.status || 'pending',
    assign.notified_at || null, assign.notified_method || null,
    assign.acknowledged_at || null, assign.acknowledged_method || null,
    assign.notes || null
  );
}

export async function createAssignment({
  project,
  task,
  assignee,
  assignee_email = null,
  telegram_chat_id = null,
  due_date = null,
  assigned_by = 'Hermes',
  critical = false,           // NEW: whether this is a critical-path task
  escalate = false,           // NEW: manual escalation
}) {
  const id = nanoid(10);
  const assign = {
    id, project, task, assignee, assignee_email, telegram_chat_id,
    assigned_by, assigned_at: new Date().toISOString(), due_date,
    status: 'pending', critical, escalate,
  };

  let notified_method = null;
  let notified_at = new Date().toISOString();

  // 1. Always notify the assignee first (Telegram preferred)
  if (telegram_chat_id) {
    // Will be implemented in telegram-router.js
    notified_method = 'telegram';
  }

  // 2. Email to assignee (fallback or dual)
  if (assignee_email) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM || 'ryan@greentouch.pro',
        to: assignee_email,
        subject: `New Task: ${task} (${project})`,
        text: `Assigned by ${assigned_by}\nProject: ${project}\nTask: ${task}\nDue: ${due_date || 'ASAP'}`,
      });
      notified_method = notified_method ? 'both' : 'email';
    } catch (e) {
      console.error('[EMAIL] Assignee failed:', e.message);
    }
  }

  // 3. Leadership escalation (critical or manually escalated)
  if (critical || escalate) {
    const toList = LEADERSHIP.map(p => p.email).join(',');
    try {
      await transporter.sendMail({
        from: SMTP_FROM || 'ryan@greentouch.pro',
        to: toList,
        subject: `[Hermes] ${critical ? 'CRITICAL' : 'ESCALATED'} Task — ${project}`,
        text: `Task: ${task}\nAssignee: ${assignee}\nDue: ${due_date || 'ASAP'}\nAssigned by: ${assigned_by}\n\nPlease monitor.`,
      });
      assign.notes = `Leadership CC: ${toList}`;
    } catch (e) {
      console.error('[EMAIL] Leadership failed:', e.message);
    }
  }

  assign.notified_at = notified_at;
  assign.notified_method = notified_method || 'pending';
  assign.status = 'notified';

  logAssignment(assign);
  return assign;
}

export function acknowledgeAssignment(id, method = 'telegram_inline') {
  const stmt = db.prepare(`
    UPDATE assignments
    SET status='acknowledged', acknowledged_at=?, acknowledged_method=?
    WHERE id=?
  `);
  stmt.run(new Date().toISOString(), method, id);
  return db.prepare('SELECT * FROM assignments WHERE id=?').get(id);
}

export function getProjectAssignments(project) {
  return db.prepare(`
    SELECT * FROM assignments
    WHERE project LIKE ?
    ORDER BY assigned_at DESC
  `).all(`%${project}%`);
}

export function getStaleAssignments(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM assignments
    WHERE status='notified' AND notified_at < ? AND acknowledged_at IS NULL
    ORDER BY notified_at ASC
  `).all(cutoff);
}

export default {
  createAssignment,
  acknowledgeAssignment,
  getProjectAssignments,
  getStaleAssignments,
  LEADERSHIP,
};