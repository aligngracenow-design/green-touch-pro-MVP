#!/usr/bin/env node
/**
 * Hermes Construction Bot — Persistent Launcher
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startPolling, stopPolling } from './telegram-router.js';

// Force load .env from THIS exact file's folder
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

// HARD FALLBACK for the token we just set
if (!process.env.TELEGRAM_TOKEN) {
  process.env.TELEGRAM_TOKEN = '884109...MLHA';
}

console.log('🤖 Hermes Construction Bot starting...');
console.log('   Token prefix:', (process.env.TELEGRAM_TOKEN || '').slice(0, 8) + '...');

if (!process.env.TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN still missing after forced fallback');
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Hermes...');
  stopPolling();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating Hermes...');
  stopPolling();
  process.exit(0);
});

async function main() {
  try {
    await startPolling();
    console.log('✅ Hermes bot polling active.');
    console.log('   Send /start to @Greentouchdemobot in Telegram.');
    console.log('   Press Ctrl+C to stop.');
  } catch (err) {
    console.error('❌ Failed to start polling:', err.message);
    console.log('Retrying in 10 seconds...');
    setTimeout(main, 10000);
  }
}

main();