#!/usr/bin/env python3
"""
GreenTouch.Pro — Morning Briefing Generator
Fetches weather, pending tasks, deliveries, and open RFIs from SQLite DB.
Outputs a formatted briefing message.
"""

import sqlite3
import json
import sys
import os
import subprocess
from datetime import datetime, timedelta

DB_PATH = os.environ.get('DB_PATH', '/opt/data/hermes-os/data/hermes.db')
LOCATION = os.environ.get('BRIEFING_LOCATION', 'Manassas+VA')
TELEGRAM_CHAT_ID = os.environ.get('BRIEFING_CHAT_ID', '')

try:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    today = datetime.now().strftime('%Y-%m-%d')
    weekday = datetime.now().strftime('%A')

    # ─── Weather ─────────────────────────────────────────
    weather = 'N/A'
    try:
        result = subprocess.run(
            ['curl', '-s', f'wttr.in/{LOCATION}?format=%C+%t+%w&m'],
            capture_output=True, text=True, timeout=10
        )
        weather = result.stdout.strip() or 'N/A'
    except Exception:
        weather = 'Weather unavailable'

    # ─── Pending tasks (not acknowledged >12h) ─────────────
    pending = 0
    try:
        pending = db.execute("""
            SELECT COUNT(*) as cnt FROM assignments
            WHERE status IN ('pending','assigned','notified')
            AND created_at < datetime('now', '-12 hours')
        """).fetchone()['cnt']
    except Exception:
        pass

    # ─── Overdue tasks ─────────────────────────────────────
    overdue = []
    try:
        overdue = db.execute("""
            SELECT task, assignee, due_date FROM assignments
            WHERE status NOT IN ('complete','completed')
            AND due_date IS NOT NULL
            AND due_date != ''
            ORDER BY due_date ASC LIMIT 5
        """).fetchall()
    except Exception:
        pass

    # ─── Today's deliveries ────────────────────────────────
    today_deliveries = []
    try:
        today_deliveries = db.execute("""
            SELECT item, project, supplier, scheduled_date, material
            FROM deliveries
            WHERE status = 'scheduled'
            AND (scheduled_date LIKE ? OR scheduled_date LIKE ?)
            ORDER BY scheduled_date ASC LIMIT 10
        """, (f'%{today}%', f'%{weekday[:3]}%',)).fetchall()

        if not today_deliveries:
            today_deliveries = db.execute("""
                SELECT item, project, supplier, scheduled_date, material
                FROM deliveries
                WHERE status = 'scheduled'
                ORDER BY scheduled_date ASC LIMIT 5
            """).fetchall()
    except Exception:
        pass

    # ─── Open RFIs ─────────────────────────────────────────
    open_rfis = 0
    try:
        open_rfis = db.execute("""
            SELECT COUNT(*) as cnt FROM rfis WHERE status = 'open'
        """).fetchone()['cnt']
    except Exception:
        pass

    # ─── Total subs in directory ───────────────────────────
    sub_count = 0
    try:
        sub_count = db.execute("""
            SELECT COUNT(*) as cnt FROM subs
        """).fetchone()['cnt']
    except Exception:
        pass

    # ─── Open punch items ─────────────────────────────────
    open_punch = 0
    try:
        open_punch = db.execute("""
            SELECT COUNT(*) as cnt FROM punchlist WHERE status = 'open'
        """).fetchone()['cnt']
    except Exception:
        pass

    # ─── Build Briefing ────────────────────────────────────
    lines = ['🌅 *Good Morning — GreenTouch.Pro Daily Briefing*', '']
    lines.append(f'🌤️ *Weather:* {weather}')
    lines.append(f'📅 {weekday}, {today}')
    lines.append('')

    # Task summary
    lines.append('📋 *Task Summary:*')
    if overdue:
        lines.append(f'⚠️ *{len(overdue)} overdue tasks:*')
        for t in overdue[:3]:
            lines.append(f'  • {t["task"]} → {t["assignee"]} (due {t["due_date"]})')
    else:
        lines.append('  ✅ No overdue tasks')
    lines.append(f'  ⏳ {pending} tasks pending >12h')
    lines.append('')

    # Deliveries
    lines.append('📦 *Upcoming Deliveries:*')
    if today_deliveries:
        for d in today_deliveries:
            mat = d['material'] or d['item'] or 'materials'
            lines.append(f'  • {mat} → {d["project"]} ({d["supplier"]}, {d["scheduled_date"]})')
    else:
        lines.append('  ✅ No upcoming deliveries')
    lines.append('')

    # RFIs
    lines.append(f'📝 *Open RFIs:* {open_rfis}')
    lines.append(f'🛠️ *Open Punch Items:* {open_punch}')
    lines.append(f'📋 *Subcontractors in Directory:* {sub_count}')
    lines.append('')
    lines.append('_Use /assignments, /deliveries, /rfis for details._')

    print('\n'.join(lines))

except Exception as e:
    print(f'❌ *Briefing Error:* {e}', file=sys.stderr)
    sys.exit(1)
