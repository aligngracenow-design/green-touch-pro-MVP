/**
 * GreenTouch.Pro — Telegram Command Handler
 * 
 * Real /assign, /assignments, /pending, /help, /start
 * Wired to database + notification engine.
 */

import { nanoid } from 'nanoid';
import db from '../db/migrate.js';
import { notifyAssignment, notifyLeadership } from '../email/notifier.js';

export async function handleCommand(chatId, text, fromUser) {
  const cmd = text.split(' ')[0].toLowerCase();
  const rest = text.slice(cmd.length).trim();

  switch (cmd) {
    case '/start':   return cmdStart(chatId);
    case '/help':    return cmdHelp(chatId);
    case '/assign':  return cmdAssign(chatId, rest, fromUser);
    case '/assignments': return cmdGetAssignments(chatId, rest);
    case '/pending': return cmdPending(chatId);
    case '/status':  return cmdStatus(chatId, rest);
    default:         return send(chatId, 'Unknown command. Try /help');
  }
}

// ─── Helpers ─────────────────────────────────────────────────
async function send(chatId, text) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) return { ok: false, error: 'No token' };

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  return res.json();
}

// ─── /start ──────────────────────────────────────────────────
function cmdStart(chatId) {
  return send(chatId, [
    '🚧 *GreenTouch.Pro — Construction OS*',
    '',
    'Real assignments. Real notification. Real accountability.',
    '',
    '*Quick Start:*',
    '• /assign Mike install ductwork before Friday',
    '• /assign Mike install drywall by Monday --critical',
    '• /assignments Woodbridge — view all tasks',
    '• /pending — see unacknowledged tasks',
    '• /help — full command reference',
  ].join('\n'));
}

// ─── /help ───────────────────────────────────────────────────
function cmdHelp(chatId) {
  return send(chatId, [
    '📖 *GreenTouch.Pro Command Reference*',
    '',
    '*Assign Tasks:*',
    '  /assign [Name] [task] [due] — create & notify',
    '  /assign [Name] [task] [due] --critical — also CCs leadership',
    '',
    '*View Tasks:*',
    '  /assignments [Project] — all tasks for a project',
    '  /pending — tasks not acknowledged in 24h+',
    '  /status [Project] — project summary',
    '',
    '*Workflows:*',
    '  Task assigned → notified (Telegram + Email)',
    '  → acknowledged → tracked in audit log',
    '  → leadership notified on critical/escalated items',
    '',
    '*Accountability:*',
    '  Every notification is recorded.',
    '  Every acknowledgement updates the database.',
    '  Nothing falls through the cracks.',
  ].join('\n'));
}

// ─── /assign [Name] [Task] [Due] --critical ──────────────────
async function cmdAssign(chatId, rest, fromUser) {
  if (!rest) return send(chatId, 'Usage: /assign [Name] [task] [due date]\nExample: /assign Mike install ductwork by Friday');

  let critical = false;
  let text = rest;
  if (rest.includes('--critical')) {
    critical = true;
    text = rest.replace('--critical', '').trim();
  }

  // Parse: first word = name, last words after "by" or "before" = due, rest = task
  const parts = text.split(' ');
  const name = parts[0];
  let task, due = null;

  const restText = parts.slice(1).join(' ');
  const byMatch = restText.match(/(.*?)\s+(?:by|before)\s+(.*)/i);
  if (byMatch) {
    task = byMatch[1].trim();
    due = byMatch[2].trim();
  } else {
    task = restText;
  }

  if (!task || task.length < 3) {
    return send(chatId, '❌ Please provide a task description.\nExample: /assign Mike install ductwork by Friday');
  }

  // ─── Create in Database ───────────────────────────────────
  const id = nanoid();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO assignments (id, task, assignee_name, assigned_by, assigned_by_name,
        due_date, priority, is_critical, status, created_at, updated_at)
      VALUES (?, ?, ?, 'user', ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id, task, name, fromUser?.username || fromUser?.first_name || 'unknown',
      due, critical ? 'high' : 'normal', critical ? 1 : 0,
      now, now
    );

    // ─── Send Notifications ─────────────────────────────────
    // Try to find assignee's Telegram chat_id from users table
    let assigneeChatId = null;
    let assigneeEmail = null;
    const userRow = db.prepare(
      'SELECT telegram_chat_id, email FROM users WHERE name LIKE ?'
    ).get(`%${name}%`);

    if (userRow) {
      assigneeChatId = userRow.telegram_chat_id;
      assigneeEmail = userRow.email;
    }

    // Send notification (Telegram + Email if configured)
    const notifResults = await notifyAssignment({
      assignmentId: id,
      task,
      project: 'assigned',
      assigneeName: name,
      assigneeChatId,
      assigneeEmail,
      dueDate: due,
      isCritical: critical,
    });

    // Update notification status
    const notifiedMethod = notifResults.map(r => r.method).filter(Boolean).join(',') || null;
    if (notifiedMethod) {
      db.prepare(`
        UPDATE assignments SET status='notified', notified_at=?, notified_method=?
        WHERE id=?
      `).run(now, notifiedMethod, id);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, new_value, created_at)
      VALUES (?, ?, 'assigned', 'assignment', ?, ?, ?)
    `).run(
      nanoid(),
      fromUser?.first_name || fromUser?.username || 'GreenTouch.Pro',
      id,
      JSON.stringify({ task, assignee: name, due, critical }),
      now
    );

    // ─── Reply ──────────────────────────────────────────────
    const lines = [
      `✅ *Task Assigned*  ${critical ? '🔴 CRITICAL' : ''}`,
      '',
      `*Task:* ${task}`,
      `*Assigned to:* ${name}`,
      `*Due:* ${due || 'ASAP'}`,
      `*Status:* notified`,
    ];

    if (critical) {
      lines.push('', '📧 Leadership (Pat, Paul, Graham) have been CC\'d.');
    }
    if (!assigneeChatId && !assigneeEmail) {
      lines.push('', '⚠️ No contact info found for this person. They may not receive a notification.');
    }

    return send(chatId, lines.join('\n'));

  } catch (e) {
    console.error('/assign error:', e.message);
    return send(chatId, `❌ Error creating assignment: ${e.message}`);
  }
}

// ─── /assignments [project] ──────────────────────────────────
function cmdGetAssignments(chatId, rest) {
  const project = rest || null;

  let rows;
  try {
    if (project) {
      rows = db.prepare(`
        SELECT * FROM assignments WHERE project_name LIKE ?
        ORDER BY created_at DESC
      `).all(`%${project}%`);
    } else {
      rows = db.prepare(`
        SELECT * FROM assignments ORDER BY created_at DESC LIMIT 20
      `).all();
    }

    if (!rows.length) {
      return send(chatId, `📋 No assignments found${project ? ` for "${project}"` : ''}.`);
    }

    const lines = [
      `📋 *${project ? `Assignments — ${project}` : 'Recent Assignments'}*`,
      '',
    ];

    for (const a of rows) {
      const statusIcon = {
        pending: '⏳', notified: '📬', acknowledged: '✅',
        in_progress: '🚧', blocked: '🚫', completed: '🏁',
        escalated: '🚨',
      }[a.status] || '❓';

      const critical = a.is_critical ? '🔴' : '';
      lines.push(
        `${statusIcon}${critical} *${a.task}* → ${a.assignee_name}` +
        ` (${a.status}, due ${a.due_date || 'ASAP'})`
      );
    }

    return send(chatId, lines.join('\n'));

  } catch (e) {
    return send(chatId, `❌ Error: ${e.message}`);
  }
}

// ─── /pending ────────────────────────────────────────────────
function cmdPending(chatId) {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT * FROM assignments
      WHERE status='notified' AND notified_at < ? AND acknowledged_at IS NULL
      ORDER BY notified_at ASC
    `).all(cutoff);

    if (!rows.length) {
      return send(chatId, '✅ *No pending tasks.* All assignments have been acknowledged in the last 24 hours.');
    }

    const lines = [
      `🚨 *${rows.length} Unacknowledged Tasks* (notified >24h ago)`,
      '',
    ];

    for (const a of rows) {
      const hoursAgo = Math.round(
        (Date.now() - new Date(a.notified_at).getTime()) / (1000 * 60 * 60)
      );
      lines.push(
        `• *${a.task}* → ${a.assignee_name} (${hoursAgo}h, via ${a.notified_method || 'unknown'})`
      );
    }

    lines.push('', 'Use /escalate to notify leadership about these tasks.');

    return send(chatId, lines.join('\n'));

  } catch (e) {
    return send(chatId, `❌ Error: ${e.message}`);
  }
}

// ─── /status [project] ───────────────────────────────────────
function cmdStatus(chatId, rest) {
  try {
    const statuses = db.prepare(`
      SELECT status, COUNT(*) as count FROM assignments
      ${rest ? "WHERE project_name LIKE ?" : ""}
      GROUP BY status
    `).all(...(rest ? [`%${rest}%`] : []));

    const counts = {};
    for (const s of statuses) counts[s.status] = s.count;

    return send(chatId, [
      `📊 *Project Status${rest ? ` — ${rest}` : ''}*`,
      '',
      `⏳ Pending:      ${counts.pending || 0}`,
      `📬 Notified:     ${counts.notified || 0}`,
      `✅ Acknowledged: ${counts.acknowledged || 0}`,
      `🚧 In Progress:  ${counts.in_progress || 0}`,
      `🚫 Blocked:      ${counts.blocked || 0}`,
      `🏁 Completed:    ${counts.completed || 0}`,
      `🚨 Escalated:    ${counts.escalated || 0}`,
    ].join('\n'));
  } catch (e) {
    return send(chatId, `❌ Error: ${e.message}`);
  }
}

// ─── Handle Inline Button (Acknowledgement) ───────────────────
export async function handleCallback(query) {
  const { id: queryId, message, data } = query;
  const chatId = message.chat.id;

  // Parse: ack_ASSIGNMENTID_accept  or  ack_ASSIGNMENTID_reject
  const match = data.match(/^ack_(.+)_(accept|reject)$/);
  if (!match) return;

  const [, assignmentId, action] = match;
  const now = new Date().toISOString();

  if (action === 'accept') {
    db.prepare(`
      UPDATE assignments SET status='acknowledged', acknowledged_at=?, acknowledged_via='telegram'
      WHERE id=?
    `).run(now, assignmentId);

    await send(chatId, '✅ Task acknowledged. Thank you.');
  } else {
    // Rejected — escalate automatically
    db.prepare(`
      UPDATE assignments SET status='escalated', escalated_at=?
      WHERE id=?
    `).run(now, assignmentId);

    // Notify leadership about rejection
    const row = db.prepare('SELECT * FROM assignments WHERE id=?').get(assignmentId);
    if (row) {
      await notifyLeadership({
        task: row.task,
        project: row.project_name || 'Unknown',
        assignee: row.assignee_name,
        dueDate: row.due_date,
        reason: 'rejected_by_assignee',
      });
    }

    await send(chatId, '⚠️ Task declined. Leadership has been notified.');
  }
}

export default { handleCommand, handleCallback };