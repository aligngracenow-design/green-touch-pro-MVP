#!/usr/bin/env node
/**
 * GreenTouch.pro — DB backup engine
 * Makes a consistent, hot backup of the single source-of-truth SQLite DB
 * using SQLite's online backup API (safe even while bot + dashboard write).
 * Keeps last N daily snapshots, gzipped, plus a "latest" copy.
 *
 * Usage:  node scripts/backup_db.js
 * Cron:   handled by systemd timer / crontab (see GO-LIVE runbook)
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const DB = process.env.HERMES_DB || path.join(__dirname, '..', 'data', 'hermes.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');
const KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10); // keep 30 snapshots

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rawPath = path.join(BACKUP_DIR, `hermes-${stamp}.db`);

(async () => {
  const src = new Database(DB, { readonly: true });
  // Online backup — consistent snapshot without locking writers out
  await src.backup(rawPath);
  src.close();

  // Verify the snapshot is a valid, non-corrupt DB before we trust it
  const check = new Database(rawPath, { readonly: true });
  const ok = check.pragma('integrity_check', { simple: true });
  const tables = check.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table'").get().c;
  check.close();
  if (ok !== 'ok') {
    fs.unlinkSync(rawPath);
    console.error(`❌ Backup FAILED integrity_check: ${ok}`);
    process.exit(1);
  }

  // Gzip it, drop the raw copy + any WAL/SHM sidecars from the verify open
  const gz = path.join(BACKUP_DIR, `hermes-${stamp}.db.gz`);
  fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(rawPath)));
  ['', '-wal', '-shm'].forEach(s => { try { fs.unlinkSync(rawPath + s); } catch {} });

  // Maintain a "latest" pointer for easy restore
  fs.copyFileSync(gz, path.join(BACKUP_DIR, 'hermes-latest.db.gz'));

  // Prune old snapshots (keep newest N, never touch "latest")
  const snaps = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^hermes-\d/.test(f) && f.endsWith('.db.gz'))
    .sort();
  while (snaps.length > KEEP) {
    fs.unlinkSync(path.join(BACKUP_DIR, snaps.shift()));
  }

  const sizeKB = (fs.statSync(gz).size / 1024).toFixed(1);
  console.log(`✅ Backup OK  ${path.basename(gz)}  (${tables} tables, ${sizeKB} KB, integrity=ok, kept=${snaps.length})`);
})().catch(e => { console.error('❌ Backup error:', e.message); process.exit(1); });
