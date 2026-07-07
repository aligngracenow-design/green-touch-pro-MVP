#!/usr/bin/env python3
"""Seed rich subcontractor directory for DC/NoVA/Baltimore metro area demo."""
import sqlite3, uuid

DB = '/opt/data/hermes-os/data/hermes.db'
db = sqlite3.connect(DB)

def uid():
    return f"sub_{uuid.uuid4().hex[:8]}"

db.execute("DELETE FROM subs WHERE id LIKE 'sub_%' OR id LIKE 'demo_%'")
db.execute("DELETE FROM subs WHERE id LIKE 'seed_%'")

subs = [
    # name, company, trade, phone, bbb_rating, bbb_complaints, bbb_accredited,
    # google_rating, google_reviews, license_number, license_status, license_state,
    # vet_score, vet_color
    ("Dominion Electric", "Dominion Electric Services, Inc.", "electrician", "(703) 555-0142",
     "A+", 0, 1, 4.8, 127, "ELE-2019-04421", "active", "VA", 92, "green"),
    ("Nova Wiring Solutions", "Nova Wiring Solutions LLC", "electrician", "(571) 555-0188",
     "A", 2, 1, 4.3, 64, "ELE-2020-01278", "active", "VA", 78, "yellow"),
    ("Capitol Electric Co", "Capitol Electric Co.", "electrician", "(202) 555-0221",
     "A+", 0, 1, 4.6, 93, "EC-2021-00563", "active", "DC", 85, "green"),
    ("Potomac Power Systems", "Potomac Power Systems, Inc.", "electrician", "(301) 555-0333",
     "A-", 4, 0, 4.1, 41, "MEL-2018-00921", "active", "MD", 71, "yellow"),
    ("Tri-State Electrical", "Tri-State Electrical Contractors", "electrician", "(410) 555-0441",
     "B+", 8, 1, 3.8, 22, "BAL-2020-00345", "active", "MD", 64, "red"),

    # Plumbers
    ("Potomac Plumbing", "Potomac Plumbing & Heating", "plumber", "(703) 555-0552",
     "A+", 0, 1, 4.7, 112, "PLB-2018-00678", "active", "VA", 88, "green"),
    ("Old Dominion Plumbing", "Old Dominion Plumbing Co.", "plumber", "(571) 555-0660",
     "A", 1, 1, 4.4, 78, "PLB-2019-00234", "active", "VA", 82, "green"),
    ("Bay State Plumbing", "Bay State Plumbing & Mechanical", "plumber", "(301) 555-0777",
     "B", 12, 0, 3.5, 18, "MD-PL-2017-00891", "active", "MD", 55, "red"),

    # HVAC
    ("Climate Control DMV", "Climate Control DMV, LLC", "hvac", "(703) 555-0885",
     "A+", 0, 1, 4.9, 156, "HVC-2019-00123", "active", "VA", 90, "green"),
    ("Heritage Heating & Air", "Heritage Heating & Air Conditioning", "hvac", "(202) 555-0993",
     "A", 3, 1, 4.2, 55, "DC-HVC-2020-00456", "active", "DC", 76, "yellow"),
    ("ComfortPro Services", "ComfortPro HVAC Services", "hvac", "(410) 555-1101",
     "A-", 5, 0, 4.0, 34, "MD-HV-2021-00123", "active", "MD", 69, "yellow"),

    # Roofers
    ("Skyline Roofing", "Skyline Roofing & Siding", "roofer", "(703) 555-1211",
     "A+", 0, 1, 4.9, 168, "ROF-2018-00789", "active", "VA", 91, "green"),
    ("Atlas Exteriors", "Atlas Exteriors, Inc.", "roofer", "(571) 555-1310",
     "A", 4, 1, 4.1, 49, "ROF-2019-00567", "active", "VA", 73, "yellow"),
    ("Peak Roofing Solutions", "Peak Roofing Solutions LLC", "roofer", "(202) 555-1442",
     "B-", 15, 0, 3.4, 12, "DC-ROF-2020-00890", "active", "DC", 58, "red"),

    # Concrete / Foundation
    ("Piedmont Concrete", "Piedmont Concrete & Foundation", "concrete", "(540) 555-1555",
     "A", 1, 1, 4.5, 89, "CON-2019-00345", "active", "VA", 86, "green"),
    ("Capital Foundation", "Capital Foundation Systems", "concrete", "(301) 555-1663",
     "B+", 7, 0, 3.9, 31, "MD-CON-2018-00678", "active", "MD", 62, "yellow"),

    # Drywall / Paint
    ("Miller Drywall", "Miller Drywall & Finishing", "drywall", "(703) 555-1771",
     "A", 3, 1, 4.3, 56, "DRY-2020-00456", "active", "VA", 75, "yellow"),
    ("Capital Drywall Inc", "Capital Drywall, Inc.", "drywall", "(202) 555-1882",
     "A+", 0, 1, 4.6, 74, "DC-DRY-2019-00123", "active", "DC", 84, "green"),
    ("Prestige Painting", "Prestige Painting & Finishing", "painter", "(301) 555-1994",
     "A+", 0, 1, 4.8, 143, "PNT-2018-00789", "active", "MD", 89, "green"),
    ("Metro Paint Co", "Metro Paint Company", "painter", "(571) 555-2100",
     "A-", 5, 1, 4.0, 38, "PNT-2021-00321", "active", "VA", 67, "yellow"),

    # Framers
    ("Precision Framing", "Precision Framing LLC", "framer", "(703) 555-2211",
     "A", 2, 1, 4.4, 61, "FRM-2019-00891", "active", "VA", 80, "green"),
    ("Blue Ridge Carpentry", "Blue Ridge Carpentry & Framing", "framer", "(540) 555-2330",
     "A-", 4, 0, 4.1, 27, "FRM-2020-00567", "active", "VA", 72, "yellow"),

    # Excavation
    ("Sterling Excavation", "Sterling Excavation & Grading", "excavation", "(703) 555-2448",
     "A+", 1, 1, 4.7, 94, "EXC-2018-00456", "active", "VA", 87, "green"),
    ("Potomac Earthworks", "Potomac Earthworks, Inc.", "excavation", "(301) 555-2555",
     "B", 11, 0, 3.6, 15, "MD-EXC-2019-00789", "active", "MD", 60, "red"),

    # General Contractors
    ("Hitt Contracting", "Hitt Contracting, Inc.", "general contractor", "(703) 555-2666",
     "A", 2, 1, 4.2, 88, "GC-0176270522", "active", "VA", 77, "green"),
    ("Clark Construction", "Clark Construction Group", "general contractor", "(301) 555-2777",
     "A+", 0, 1, 4.5, 112, "GC-2019-00345", "active", "MD", 83, "green"),

    # Flooring
    ("Premier Flooring", "Premier Flooring Solutions", "flooring", "(571) 555-2888",
     "A", 1, 1, 4.4, 67, "FLR-2020-00123", "active", "VA", 81, "green"),
    ("Chesapeake Hardwood", "Chesapeake Hardwood Floors", "flooring", "(410) 555-2999",
     "A-", 4, 1, 4.2, 43, "MD-FLR-2019-00678", "active", "MD", 70, "yellow"),
]

for name, company, trade, phone, bbb_rating, bbb_complaints, bbb_accredited, google_rating, google_reviews, license_number, license_status, license_state, vet_score, vet_color in subs:
    db.execute("""
        INSERT INTO subs (id, name, company, trade, phone,
                         bbb_rating, bbb_complaints, bbb_accredited,
                         google_rating, google_reviews,
                         license_number, license_status, license_state,
                         vet_score, vet_color, last_vetted)
        VALUES (?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, datetime('now'))
    """, (uid(), name, company, trade, phone,
          bbb_rating, bbb_complaints, bbb_accredited,
          google_rating, google_reviews,
          license_number, license_status, license_state,
          vet_score, vet_color))

db.commit()

print(f"✅ Seeded {len(subs)} subs\n")

counts = db.execute("SELECT trade, COUNT(*) as cnt FROM subs GROUP BY trade ORDER BY cnt DESC").fetchall()
print("📊 Sub Directory by Trade:")
for t, c in counts:
    print(f"   {t}: {c}")

colors = db.execute("SELECT vet_color, COUNT(*) FROM subs GROUP BY vet_color").fetchall()
print(f"\n🎯 Vetting Distribution:")
for color, cnt in colors:
    print(f"   {color}: {cnt} subs")

avg = db.execute("SELECT AVG(vet_score) FROM subs").fetchone()[0]
print(f"\n📈 Average Vet Score: {avg:.1f}/100")
print(f"📋 Total Subs: {db.execute('SELECT COUNT(*) FROM subs').fetchone()[0]}")
db.close()
print("\n🎯 Ready for demo.")