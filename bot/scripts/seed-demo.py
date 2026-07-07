#!/usr/bin/env python3
"""Seed hermes.db with demo data for the Graham/Paul/Pat showcase."""
import sqlite3, uuid, datetime

DB = '/opt/data/hermes-os/data/hermes.db'
db = sqlite3.connect(DB)

def uid(): return f"demo_{uuid.uuid4().hex[:12]}"

today = datetime.date.today()
yesterday = today - datetime.timedelta(days=1)
tomorrow = today + datetime.timedelta(days=1)
next_week = today + datetime.timedelta(days=7)
two_days_ago = today - datetime.timedelta(days=2)
three_days_ago = today - datetime.timedelta(days=3)

# ── Helper: get table columns ──
def cols(table):
    return {r[1] for r in db.execute(f"PRAGMA table_info({table})")}

def insert(table, data_dict):
    """Insert a row, only using columns that exist in the table."""
    available = cols(table)
    filtered = {k: v for k, v in data_dict.items() if k in available}
    placeholders = ', '.join('?' * len(filtered))
    columns = ', '.join(filtered.keys())
    sql = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
    db.execute(sql, tuple(filtered.values()))

# ── 1. Clean up old demo data ──
for table in ['assignments', 'change_orders', 'inspections', 'permits', 'punchlist', 'rfis', 'project_photos']:
    try:
        db.execute(f"DELETE FROM {table} WHERE id LIKE 'demo_%' OR id LIKE 'h_%'")
    except:
        pass

# ── 2. Assignments ──
tasks = [
    ("GTB-2024-002", "Frame interior partition walls — main dining room", "Graham", "assigned", str(tomorrow)),
    ("GTB-2024-002", "Rough-in electrical for kitchen line", "Pat", "in_progress", str(tomorrow)),
    ("GTB-2024-002", "HVAC ductwork — second floor", "Mike D", "in_progress", str(yesterday)),
    ("GTB-2024-002", "Order custom millwork — bar top and shelving", "Sarah", "assigned", str(next_week)),
    ("GTB-2024-002", "Plumbing rough-in inspection prep", "Pat", "assigned", str(tomorrow)),
    ("GTB-2024-002", "Fire suppression system sign-off", "Graham", "assigned", str(two_days_ago)),
    ("GTB-2024-003", "Demo existing bathroom fixtures — all 3 rooms", "Pat", "completed", str(three_days_ago)),
    ("GTB-2024-003", "Waterproofing — wet areas (float rooms)", "Graham", "in_progress", str(today)),
    ("GTB-2024-003", "Order specialty ventilation for float rooms", "Sarah", "assigned", str(next_week)),
    ("GTB-2024-003", "Electrical — dedicated circuits for sauna + float tanks", "Mike D", "in_progress", str(yesterday)),
    ("GTB-2024-004", "Floor leveling compound — entire gym floor", "Graham", "assigned", str(tomorrow)),
    ("GTB-2024-004", "Install rubber flooring — 1,200 sq ft", "Pat", "assigned", str(next_week)),
    ("GTB-2024-004", "Mirror wall installation — main training area", "Mike D", "assigned", str(next_week)),
    ("GTB-2024-004", "HVAC — supplemental cooling for gym zone", "Graham", "in_progress", str(two_days_ago)),
]
for project, task, assignee, status, due in tasks:
    insert('assignments', {
        'id': uid(), 'project': project, 'task': task, 'assignee': assignee,
        'assigned_by': 'Ryan', 'status': status, 'due_date': due,
        'notes': 'Demo showcase task', 'created_at': datetime.datetime.now().isoformat()
    })

# ── 3. Change Orders ──
cos = [
    ("GTB-2024-002", "Additional framing — east wall reinforcement", 2850.00, "pending"),
    ("GTB-2024-002", "Upgrade kitchen tile to Italian porcelain (+$4/sq ft)", 3200.00, "approved"),
    ("GTB-2024-003", "Extra waterproofing — third float room added", 4750.00, "pending"),
    ("GTB-2024-003", "Electrical panel upgrade — 400A service", 6100.00, "pending"),
    ("GTB-2024-004", "Rubber flooring upgrade to 8mm commercial grade", 1800.00, "approved"),
    ("GTB-2024-004", "Additional mirror panels — west wall full coverage", 950.00, "pending"),
]
for project, desc, cost, status in cos:
    insert('change_orders', {
        'id': uid(), 'project': project, 'description': desc, 'cost': cost,
        'requested_by': 'Ryan', 'status': status, 'created_at': datetime.datetime.now().isoformat()
    })

# ── 4. Inspections ──
inspections = [
    ("GTB-2024-002", "Framing inspection — interior walls", "Fairfax County", str(tomorrow), "scheduled"),
    ("GTB-2024-002", "Electrical rough-in", "Fairfax County", str(next_week), "scheduled"),
    ("GTB-2024-003", "Plumbing rough-in — float rooms", "DCRA", str(two_days_ago), "passed"),
    ("GTB-2024-003", "Waterproofing inspection", "DCRA", str(today), "scheduled"),
    ("GTB-2024-004", "Final building inspection", "Alexandria City", str(next_week), "scheduled"),
]
for project, itype, inspector, date, status in inspections:
    insert('inspections', {
        'id': uid(), 'project': project, 'type': itype, 'inspector': inspector,
        'scheduled_date': date, 'status': status, 'created_at': datetime.datetime.now().isoformat()
    })

# ── 5. Permits ──
permits = [
    ("GTB-2024-002", "BLD-2024-0892", "Building", "Fairfax County", str(three_days_ago), str(today + datetime.timedelta(days=90)), "active"),
    ("GTB-2024-002", "ELEC-2024-0451", "Electrical", "Fairfax County", str(two_days_ago), str(today + datetime.timedelta(days=90)), "active"),
    ("GTB-2024-003", "BLD-2024-1103", "Building", "DCRA", str(today - datetime.timedelta(days=14)), str(today + datetime.timedelta(days=76)), "active"),
    ("GTB-2024-003", "PLUMB-2024-0678", "Plumbing", "DCRA", str(today - datetime.timedelta(days=10)), str(today + datetime.timedelta(days=80)), "active"),
    ("GTB-2024-004", "BLD-2024-1345", "Building", "Alexandria City", str(today - datetime.timedelta(days=30)), str(today + datetime.timedelta(days=60)), "active"),
]
for project, number, ptype, authority, issued, expires, status in permits:
    insert('permits', {
        'id': uid(), 'project': project, 'permit_number': number, 'type': ptype,
        'issuing_authority': authority, 'issued_date': issued, 'expiration_date': expires,
        'status': status, 'created_at': datetime.datetime.now().isoformat()
    })

# ── 6. Punch List ──
punches = [
    ("GTB-2024-002", "Master bath — paint touchup above vanity", "open", "high", "Pat noticed during walkthrough"),
    ("GTB-2024-002", "Kitchen — cabinet door #3 doesn't close flush", "open", "medium", "Hinge adjustment needed"),
    ("GTB-2024-003", "Float room 2 — drywall seam visible under paint", "open", "high", "Must fix before waterproofing"),
    ("GTB-2024-003", "Hallway — baseboard gap at corner", "open", "low", "Caulk and paint"),
    ("GTB-2024-004", "Entry — door closer tension too high", "open", "medium", "Adjust hydraulic closer"),
]
for project, desc, status, priority, notes in punches:
    insert('punchlist', {
        'id': uid(), 'project': project, 'description': desc, 'status': status,
        'priority': priority, 'notes': notes, 'created_at': datetime.datetime.now().isoformat()
    })

# ── 7. RFIs ──
rfis = [
    ("GTB-2024-002", "Can we relocate the fire sprinkler head in the dining room? Architect drawing shows interference with decorative beam.", "Ryan", "pending", "Architect"),
    ("GTB-2024-003", "Float room waterproofing spec calls for RedGard — can we substitute HydroBan given humidity levels?", "Ryan", "pending", "Engineer"),
]
for project, question, asked_by, status, directed_to in rfis:
    insert('rfis', {
        'id': uid(), 'project': project, 'question': question,
        'asked_by': asked_by, 'status': status, 'directed_to': directed_to,
        'created_at': datetime.datetime.now().isoformat()
    })

db.commit()

# ── 8. Verify ──
print("✅ Demo data seeded:\n")
for table in ['assignments', 'change_orders', 'inspections', 'permits', 'punchlist', 'rfis']:
    try:
        cnt = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"   {table}: {cnt} rows")
    except: pass

print(f"\n📋 Tasks by project:")
for r in db.execute("SELECT project, COUNT(*) as cnt FROM assignments GROUP BY project ORDER BY cnt DESC"):
    print(f"   {r[0]}: {r[1]} tasks")

print(f"\n⚠️  Overdue tasks:")
for r in db.execute("SELECT task, assignee, due_date FROM assignments WHERE due_date < date('now') AND status != 'completed'"):
    print(f"   {r[0]} → {r[1]} (due {r[2]})")

print("\n💰 Change orders:")
for r in db.execute("SELECT status, COUNT(*), SUM(cost) FROM change_orders GROUP BY status"):
    print(f"   {r[0]}: {r[1]} COs, ${r[2]:,.2f}")

db.close()
print("\n🎯 Ready for demo.")
