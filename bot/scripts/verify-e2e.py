#!/usr/bin/env python3
"""End-to-end verification of GreenTouch.Pro bot data layer + all feature queries."""
import sqlite3, sys

DB = '/opt/data/hermes-os/data/hermes.db'
db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

passed, failed = [], []

def check(name, ok, detail=""):
    (passed if ok else failed).append(f"{name}: {detail}")
    print(f"  {'✅' if ok else '❌'} {name} — {detail}")

print("=" * 60)
print("GREENTOUCH.PRO — END TO END DATA VERIFICATION")
print("=" * 60)

# 1. Sub finder — every trade returns results
print("\n[1] SUB FINDER (local directory search)")
trades = ['electric', 'plumb', 'roof', 'hvac', 'paint', 'drywall', 'concrete', 'framer', 'excavation', 'flooring', 'general']
for t in trades:
    n = db.execute("SELECT COUNT(*) c FROM subs WHERE trade LIKE ?", (f'%{t}%',)).fetchone()['c']
    check(f"/subs {t}", n > 0, f"{n} results")

# 2. Vetting data present
print("\n[2] VETTING DATA COMPLETENESS")
total = db.execute("SELECT COUNT(*) c FROM subs").fetchone()['c']
scored = db.execute("SELECT COUNT(*) c FROM subs WHERE vet_score > 0").fetchone()['c']
withbbb = db.execute("SELECT COUNT(*) c FROM subs WHERE bbb_rating IS NOT NULL").fetchone()['c']
withphone = db.execute("SELECT COUNT(*) c FROM subs WHERE phone IS NOT NULL").fetchone()['c']
check("Total subs", total >= 20, f"{total} subs")
check("Vet scores", scored == total, f"{scored}/{total} scored")
check("BBB ratings", withbbb == total, f"{withbbb}/{total} have BBB")
check("Phone numbers", withphone == total, f"{withphone}/{total} have phone")

# 3. Projects
print("\n[3] PROJECTS")
projs = db.execute("SELECT COUNT(*) c FROM projects").fetchone()['c']
active = db.execute("SELECT COUNT(*) c FROM projects WHERE status='active'").fetchone()['c']
check("Projects exist", projs > 0, f"{projs} projects")
check("Active projects", active > 0, f"{active} active")

# 4. Tasks / assignments (/morning, /today, /assign)
print("\n[4] TASKS (/morning /today /assignments)")
tasks = db.execute("SELECT COUNT(*) c FROM assignments").fetchone()['c']
overdue = db.execute("SELECT COUNT(*) c FROM assignments WHERE due_date < date('now') AND status NOT IN ('complete','completed')").fetchone()['c']
check("Tasks exist", tasks > 0, f"{tasks} tasks")
check("Overdue detection", overdue > 0, f"{overdue} overdue (for morning alert)")

# 5. Change orders (/addco /cos /money)
print("\n[5] CHANGE ORDERS (/cos /money)")
cos = db.execute("SELECT COUNT(*) c FROM change_orders").fetchone()['c']
pending = db.execute("SELECT COUNT(*) c, SUM(cost) s FROM change_orders WHERE status='pending'").fetchone()
check("COs exist", cos > 0, f"{cos} change orders")
check("Pending COs", pending['c'] > 0, f"{pending['c']} pending = ${pending['s'] or 0:,.0f}")

# 6. Punch list
print("\n[6] PUNCH LIST (/punchlist)")
punch = db.execute("SELECT COUNT(*) c FROM punchlist").fetchone()['c']
check("Punch items", punch > 0, f"{punch} items")

# 7. RFIs
print("\n[7] RFIs (/rfis)")
rfis = db.execute("SELECT COUNT(*) c FROM rfis").fetchone()['c']
openrfi = db.execute("SELECT COUNT(*) c FROM rfis WHERE status IN ('pending','open')").fetchone()['c']
check("RFIs exist", rfis > 0, f"{rfis} RFIs, {openrfi} open")

# 8. Inspections
print("\n[8] INSPECTIONS (/inspections)")
insp = db.execute("SELECT COUNT(*) c FROM inspections").fetchone()['c']
sched = db.execute("SELECT COUNT(*) c FROM inspections WHERE status='scheduled'").fetchone()['c']
check("Inspections", insp > 0, f"{insp} total, {sched} scheduled")

# 9. Permits
print("\n[9] PERMITS (/permits)")
perm = db.execute("SELECT COUNT(*) c FROM permits").fetchone()['c']
active_p = db.execute("SELECT COUNT(*) c FROM permits WHERE status='active'").fetchone()['c']
check("Permits", perm > 0, f"{perm} total, {active_p} active")

# 10. Roles / RBAC
print("\n[10] RBAC (user_roles)")
try:
    roles = db.execute("SELECT COUNT(*) c FROM user_roles").fetchone()['c']
    check("Roles table", True, f"{roles} role assignments (auto-promote on first /setrole)")
except Exception as e:
    check("Roles table", False, str(e))

print("\n" + "=" * 60)
print(f"RESULT: {len(passed)} passed, {len(failed)} failed")
print("=" * 60)
if failed:
    print("\n❌ FAILURES:")
    for f in failed:
        print(f"   - {f}")
    sys.exit(1)
else:
    print("\n🎯 ALL DATA CHECKS PASSED — bot backend is demo-ready.")
db.close()
