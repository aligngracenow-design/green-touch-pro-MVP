#!/usr/bin/env node
/**
 * GreenTouch.pro — Production supervisor
 * Runs BOTH the dashboard API (server/index.js) and the Telegram bot
 * (bot/src/telegram/bot.js) in ONE container, both pointed at ONE
 * SQLite database on the persistent disk. This is what makes GreenTouch.pro
 * a single archived source of truth.
 *
 * DATA_DIR (env) → where hermes.db + backups live. On Render this is the
 * mounted persistent disk (e.g. /data). Locally defaults to ./persist.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'persist');
const DB_FILE = path.join(DATA_DIR, 'hermes.db');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

// One-time seed: if the persistent disk is empty but a seed DB ships in the
// image, copy it in so first boot isn't blank. Never overwrites live data.
const SEED_DB = path.join(__dirname, 'bot', 'data', 'hermes.db');
if (!fs.existsSync(DB_FILE) && fs.existsSync(SEED_DB)) {
  fs.copyFileSync(SEED_DB, DB_FILE);
  console.log(`📦 Seeded fresh persistent DB from image → ${DB_FILE}`);
}

// Shared env: both processes read/write the SAME file on the persistent disk.
const sharedEnv = {
  ...process.env,
  DB_PATH: DB_FILE,        // both bot and dashboard read DB_PATH
  HERMES_DB: DB_FILE,      // legacy support
  BACKUP_DIR: path.join(DATA_DIR, 'backups'),
};

const procs = [];
function launch(name, file, cwd) {
  const p = spawn(process.execPath, [file], { cwd, env: sharedEnv, stdio: 'inherit' });
  p.on('exit', (code, sig) => {
    console.error(`⚠️  ${name} exited (code=${code}, sig=${sig}) — restarting in 3s`);
    setTimeout(() => launch(name, file, cwd), 3000); // auto-restart on crash
  });
  procs.push(p);
  console.log(`▶️  ${name} started (pid ${p.pid})`);
}

console.log('🏗️  GreenTouch.pro supervisor');
console.log('   DATA_DIR:', DATA_DIR);
console.log('   DB:', DB_FILE);

// Dashboard API (also serves the built React frontend from server/public)
launch('dashboard', path.join(__dirname, 'server', 'index.js'), path.join(__dirname, 'server'));
// Telegram bot
launch('bot', path.join(__dirname, 'bot', 'src', 'telegram', 'bot.js'), path.join(__dirname, 'bot'));

// Clean shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log(`\n🛑 ${sig} — stopping`); procs.forEach(p => p.kill(sig)); process.exit(0); });
}
