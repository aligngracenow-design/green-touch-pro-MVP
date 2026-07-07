/**
 * GreenTouch.Pro — Notification Engine
 * Sends Telegram messages + Email + CCs Leadership
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
  LEADERSHIP_EMAILS, TELEGRAM_TOKEN
} = process.env;

const leadership = (LEADERSHIP_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

// ─── Email Transporter ───────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (!transporter && SMTP_HOST && SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '465'),
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// ─── Telegram Send ──────────────────────────────────────────
export async function sendTelegram(chatId, message) {
  if (!TELEGRAM_TOKEN) return { ok: false, error: 'No TELEGRAM_TOKEN' };
  if (!chatId) return { ok: false, error: 'No chat_id' };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );
    const data = await res.json();
    return { ok: data.ok, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Telegram with Inline Buttons ────────────────────────────
export async function sendAssignmentNotification(chatId, {
  task, project, dueDate, assignmentId
}) {
  if (!TELEGRAM_TOKEN || !chatId) return { ok: false };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: [
            `🚧 *New Task Assigned*`,
            '',
            `*Project:* ${project}`,
            `*Task:* ${task}`,
            `*Due:* ${dueDate || 'ASAP'}`,
            '',
            'Please acknowledge:',
          ].join('\n'),
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Accept', callback_data: `ack_${assignmentId}_accept` },
                { text: '❌ Cannot do', callback_data: `ack_${assignmentId}_reject` },
              ],
            ],
          },
        }),
      }
    );
    const data = await res.json();
    return { ok: data.ok, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Email Send ──────────────────────────────────────────────
export async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();
  if (!mailer) return { ok: false, error: 'Email not configured' };
  if (!to) return { ok: false, error: 'No recipient' };

  try {
    await mailer.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html: html || text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Leadership CC (critical/escalated only) ─────────────────
export async function notifyLeadership({ task, project, assignee, dueDate, reason }) {
  if (!leadership.length) return [];

  const subject = `${reason === 'critical' ? '🔴 CRITICAL' : '🚨 ESCALATED'}: ${task}`;
  const text = [
    `Task: ${task}`,
    `Project: ${project}`,
    `Assignee: ${assignee}`,
    `Due: ${dueDate || 'ASAP'}`,
    `Reason: ${reason}`,
    '',
    '— GreenTouch.Pro',
  ].join('\n');

  const results = [];
  for (const email of leadership) {
    const result = await sendEmail({ to: email, subject, text });
    results.push({ email, ...result });
  }
  return results;
}

// ─── Full Assignment Notification Flow ───────────────────────
export async function notifyAssignment({
  assignmentId,
  task,
  project,
  assigneeName,
  assigneeChatId,
  assigneeEmail,
  dueDate,
  isCritical,
}) {
  const results = [];

  // 1. Telegram to assignee (primary)
  if (assigneeChatId) {
    const tgResult = await sendAssignmentNotification(assigneeChatId, {
      task, project, dueDate, assignmentId,
    });
    results.push({ method: 'telegram', ...tgResult });
  }

  // 2. Email to assignee (fallback)
  if (assigneeEmail) {
    const emailResult = await sendEmail({
      to: assigneeEmail,
      subject: `New Task: ${task} (${project})`,
      text: [
        `You have been assigned a task:`,
        `  Task:    ${task}`,
        `  Project: ${project}`,
        `  Due:     ${dueDate || 'ASAP'}`,
        '',
        'Please acknowledge in Telegram or reply to this email.',
        '— GreenTouch.Pro',
      ].join('\n'),
    });
    results.push({ method: 'email', recipient: assigneeEmail, ...emailResult });
  }

  // 3. CC Leadership if critical
  if (isCritical) {
    const leadershipResults = await notifyLeadership({
      task, project, assignee: assigneeName, dueDate,
      reason: 'critical',
    });
    results.push({ method: 'leadership_cc', results: leadershipResults });
  }

  return results;
}

export default {
  sendTelegram,
  sendAssignmentNotification,
  sendEmail,
  notifyLeadership,
  notifyAssignment,
};