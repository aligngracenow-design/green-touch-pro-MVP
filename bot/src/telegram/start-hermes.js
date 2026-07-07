#!/usr/bin/env node
/**
 * GreenTouch.Pro — Bot Launcher
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// Find project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load .env from project root
process.chdir(PROJECT_ROOT);
await import('dotenv/config');

// Decode base64 token
const raw = process.env.TELEGRAM_TOKEN_B64 || '';
if (raw && !process.env.TELEGRAM_TOKEN) {
  process.env.TELEGRAM_TOKEN=Buffer...utf-8');
}

import { handleCommand, handleCallback } from './commands.js';
import { initSchema } from '../db/migrate.js';

const TELEGRAM = process.env.TELEGRAM_TOKEN;
const API = TELEGRAM ? `https://api.telegram.org/bot${TELEGRAM}` : null;
let lastUpdateId = 0;
let polling = true;

if (!TELEGRAM) {
  console.error('❌ No TELEGRAM_TOKEN found in .env');
  process.exit(1);
}

initSchema();
console.log('✅ Database initialized');

async function poll() {
  if (!polling) return;
  try {
    const res = await fetch(`${API}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`);
    const data = await res.json();
    if (!data.ok) { console.error('getUpdates error:', data.description); setTimeout(poll, 3000); return; }
    for (const update of data.result || []) {
      lastUpdateId = update.update_id;
      if (update.message?.text) {
        const { chat, text, from } = update.message;
        console.log(`📩 [${from.first_name}] ${text}`);
        await handleCommand(chat.id, text.trim(), from).catch(e => console.error('Cmd error:', e.message));
      }
      if (update.callback_query) {
        const q = update.callback_query;
        console.log(`🔄 Callback: ${q.data}`);
        await handleCallback(q).catch(e => console.error('Cb error:', e.message));
      }
    }
  } catch (e) {
    console.error('Poll error:', e.message);
    await new Promise(r => setTimeout(r, 3000));
  }
  setTimeout(poll, 1000);
}

process.on('SIGINT', () => { console.log('\n🛑 Shutdown'); polling = false; process.exit(0); });
process.on('SIGTERM', () => { console.log('\n🛑 Terminate'); polling = false; process.exit(0); });

console.log('🏗️  GreenTouch.Pro polling... Send /start to @Greentouchdemobot');
poll();