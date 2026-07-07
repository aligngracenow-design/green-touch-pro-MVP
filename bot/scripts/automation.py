#!/usr/bin/env python3
"""GreenTouch Pro — Automation Script
Called by cron jobs to generate and send Telegram messages from hermes.db data.

Usage:
  python3 automation.py morning   — Morning briefing (tasks, crew, inspections, money)
  python3 automation.py watchdog  — Overdue items alert (tasks, permits, unsigned liens)
  python3 automation.py eod       — End-of-day nag (photo reminder, clock-out prompt)
"""

import sqlite3
import os
import sys
import json
import urllib.request
from datetime import datetime, timedelta

DB_PATH = os.path.expanduser('/opt/data/hermes-os/data/hermes.db')
TOKEN = '8951692205:AAEF8MkLHIO6kZyQ9UNEA-gJfBdILuOp5W0'
CHAT_ID = '6795294283'

def send_telegram(text):
    """Send a message via Telegram Bot API. Returns True if sent."""
    url = f'https://api.telegram.org/bot{TOKEN}/sendMessage'
    data = json.dumps({
        'chat_id': CHAT_ID,
        'text': text,
        'parse_mode': 'Markdown',
        'disable_web_page_preview': True,
    }).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read()).get('ok', False)
    except Exception as e:
        print(f'Telegram send failed: {e}', file=sys.stderr)
        return False

def query(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return rows

def morning_briefing():
    today = datetime.now().strftime('%Y-%m-%d')
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')

    # Today's inspections
    inspections = query(
        "SELECT type, project, scheduled_date, scheduled_time, inspector, status FROM inspections WHERE scheduled_date = ? OR scheduled_date = ? ORDER BY scheduled_date, scheduled_time",
        (today, tomorrow)
    )
    insp_lines = '\n'.join([f"  🔍 {i['type']} — {i['project']} {i['scheduled_date']} {i['scheduled_time']} ({i['status']})" for i in inspections]) or '  ✅ None scheduled'

    # Crew on site
    crew = query("SELECT worker_name, trade, project FROM time_entries WHERE date(clock_in) = ? AND clock_out IS NULL", (today,))
    crew_lines = '\n'.join([f"  👷 {c['worker_name']} ({c['trade']}) — {c['project']}" for c in crew]) or '  ⚠️ No crew clocked in yet'

    # Overdue tasks (from todos and assignments)
    overdue = query(
        "SELECT task, project_id as project, assignee, due_date FROM todos WHERE status = 'open' AND due_date < ? ORDER BY due_date LIMIT 5",
        (today,)
    )
    overdue_lines = '\n'.join([f"  ❗ {o['task']} — {o['project']} (assigned: {o['assignee']}, due: {o['due_date']})" for o in overdue]) or '  ✅ Nothing overdue'

    # Pending COs
    pending_cos = query("SELECT description, project, cost FROM change_orders WHERE status = 'pending' LIMIT 5")
    cos_total = sum(c['cost'] for c in pending_cos)
    cos_lines = '\n'.join([f"  📋 {c['description'][:60]} — ${c['cost']:,}" for c in pending_cos]) or '  ✅ No pending COs'
    if cos_total > 0:
        cos_lines += f'\n  💰 *Total pending: ${cos_total:,}*'

    msg = f"""☀️ *Good Morning, Graham*

📅 *Today's Inspections*
{insp_lines}

👷 *Crew On Site*
{crew_lines}

❗ *Overdue Items*
{overdue_lines}

💰 *Pending Change Orders*
{cos_lines}

📸 Reminder: end-of-day photos required from all sites before 5pm.

_{datetime.now().strftime('%A, %B %d')}_"""

    return send_telegram(msg)

def watchdog():
    today = datetime.now().strftime('%Y-%m-%d')
    soon = (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')

    alerts = []

    # Expiring permits (within 30 days)
    expiring = query(
        "SELECT type, project, jurisdiction, expiration_date FROM permits WHERE status = 'issued' AND expiration_date <= ? ORDER BY expiration_date",
        (soon,)
    )
    for p in expiring:
        alerts.append(f"⚠️ Permit expiring: {p['type']} — {p['project']} ({p['jurisdiction']}) expires {p['expiration_date']}")

    # Overdue tasks
    overdue = query(
        "SELECT task, project_id as project, assignee, due_date FROM todos WHERE status = 'open' AND due_date < ? ORDER BY due_date",
        (today,)
    )
    for t in overdue:
        alerts.append(f"❗ Overdue: {t['task']} — {t['project']} (assigned: {t['assignee']}, due: {t['due_date']})")

    # Unsigned lien releases
    unsigned = query(
        "SELECT sub_name, project, amount FROM lien_releases WHERE status = 'unsigned'"
    )
    for l in unsigned:
        alerts.append(f"🔒 Unsigned lien: {l['sub_name']} — {l['project']}: ${l['amount']:,}")

    if not alerts:
        # Silent — nothing to report
        return True

    msg = '🔔 *GreenTouch Pro Alerts*\n\n' + '\n'.join(alerts)
    return send_telegram(msg)

def eod_nag():
    hour = datetime.now().hour
    today = datetime.now().strftime('%Y-%m-%d')

    # Count who's still clocked in
    on_site = query("SELECT COUNT(*) as c FROM time_entries WHERE date(clock_in) = ? AND clock_out IS NULL", (today,))
    count = on_site[0]['c'] if on_site else 0

    if hour < 18:
        # 4pm: gentle reminder
        msg = f"""🌅 *End of Day Reminder*

{count} worker(s) still on site. Don't forget:

1. 📸 Send your end-of-day photo for each project
2. ✅ Mark completed tasks
3. 🕐 Clock out when done

Reply with photos or use /eod to wrap up."""
    else:
        # 6pm: escalation
        msg = f"""🚨 *Still On Site?*

{count} worker(s) haven't clocked out yet. Please:

1. Send EOD photo NOW
2. Clock out with /eod
3. Or update status if working late

_This is your automated 6pm check-in._"""

    return send_telegram(msg)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'morning'
    success = {
        'morning': morning_briefing,
        'watchdog': watchdog,
        'eod': eod_nag,
    }.get(cmd, morning_briefing)()

    if success:
        print(f'[{cmd}] Message sent successfully')
    else:
        print(f'[{cmd}] Failed to send', file=sys.stderr)
        sys.exit(1)
