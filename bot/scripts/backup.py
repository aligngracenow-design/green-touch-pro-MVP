#!/usr/bin/env python3
"""Nightly backup of GreenTouch.Pro database and assets.

- Copies hermes.db to backup dir with timestamp
- Keeps last 30 days of backups
- Reports to bot log
"""
import sqlite3
import shutil
import os
import glob
from datetime import datetime, timedelta

DB_PATH = '/opt/data/hermes-os/data/hermes.db'
BACKUP_DIR = '/opt/data/hermes-os/backups'
MAX_BACKUPS = 30

os.makedirs(BACKUP_DIR, exist_ok=True)

# Create timestamped backup
ts = datetime.now().strftime('%Y-%m-%d_%H%M')
backup_path = os.path.join(BACKUP_DIR, f'hermes_{ts}.db')

# Use SQLite backup API for safe copy
src = sqlite3.connect(DB_PATH)
dst = sqlite3.connect(backup_path)
src.backup(dst)
dst.close()
src.close()

size_mb = os.path.getsize(backup_path) / (1024*1024)
print(f'✅ Backup: {backup_path} ({size_mb:.2f} MB)')

# Verify the backup opens
v = sqlite3.connect(backup_path)
count = v.execute('SELECT COUNT(*) FROM assignments').fetchone()[0]
v.close()
print(f'   Verified: {count} assignments in backup')

# Cleanup old backups
backups = sorted(glob.glob(os.path.join(BACKUP_DIR, 'hermes_*.db')))
if len(backups) > MAX_BACKUPS:
    for old in backups[:-MAX_BACKUPS]:
        os.remove(old)
        print(f'   Cleaned: {os.path.basename(old)}')

print(f'   Total backups: {len(backups)} (max {MAX_BACKUPS})')