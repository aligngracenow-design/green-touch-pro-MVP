#!/usr/bin/env node
/**
 * GreenTouch.pro — DB restore
 * Restores the DB from a backup snapshot (default: latest).
 * Stops nothing for you — run when bot + dashboard are stopped.
 *
 * Usage:  node scripts/restore_db.js               # restores latest
 *         node scripts/restore_db.js hermes-2026-07-01T19-00-00.db.gz
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const DB = process.env.HERMES_DB || path.join(__dirname, '..', 'data', 'hermes.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');
const arg = process.argv[2] || 'hermes-latest.db.gz';
const gz = path.isAbsolute(arg) ? arg : path.join(BACKUP_DIR, arg);

if (!fs.existsSync(gz)) { console.error(`❌ No such backup: ${gz}`); process.exit(1); }

// Decompress to a temp file and verify BEFORE overwriting the live DB
const tmp = path.join(BACKUP_DIR, '.restore-tmp.db');
fs.writeFileSync(tmp, zlib.gunzipSync(fs.readFileSync(gz)));
const check = new Database(tmp, { readonly: true });
const ok = check.pragma('integrity_check', { simple: true });
check.close();
if (ok !== 'ok') { fs.unlinkSync(tmp); console.error(`❌ Backup is corrupt: ${ok}`); process.exit(1); }

// Safety copy of current DB before clobbering it
if (fs.existsSync(DB)) fs.copyFileSync(DB, DB + '.pre-restore');
// Clear WAL/SHM so the restored file is authoritative
['-wal', '-shm'].forEach(s => { try { fs.unlinkSync(DB + s); } catch {} });
fs.copyFileSync(tmp, DB);
fs.unlinkSync(tmp);
console.log(`✅ Restored ${path.basename(gz)} → ${DB}\n   (previous DB saved as ${path.basename(DB)}.pre-restore)`);
