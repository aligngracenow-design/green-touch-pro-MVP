import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'greentouch.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT,
      status TEXT DEFAULT 'active',
      sqft INTEGER DEFAULT 0,
      budget REAL DEFAULT 0,
      spent REAL DEFAULT 0,
      start TEXT,
      completion TEXT,
      progress INTEGER DEFAULT 0,
      phase TEXT,
      health TEXT DEFAULT 'good',
      address TEXT DEFAULT '',
      permit TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      date TEXT,
      text TEXT,
      photos INTEGER DEFAULT 0,
      submitted_by TEXT,
      category TEXT DEFAULT 'general',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT,
      type TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      size TEXT DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      due_date TEXT,
      paid_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      client_name TEXT,
      client_email TEXT,
      description TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT,
      company TEXT,
      phone TEXT,
      email TEXT,
      project_desc TEXT,
      sqft INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new',
      date TEXT,
      notes TEXT,
      source TEXT DEFAULT 'website'
    );
    CREATE TABLE IF NOT EXISTS subs (
      id TEXT PRIMARY KEY,
      name TEXT,
      trade TEXT,
      phone TEXT,
      email TEXT,
      project_id TEXT,
      status TEXT DEFAULT 'active',
      rate REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task TEXT,
      assignee TEXT,
      priority TEXT DEFAULT 'med',
      status TEXT DEFAULT 'open',
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      channel TEXT,
      message TEXT,
      sent_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'sent'
    );
    CREATE TABLE IF NOT EXISTS ai_chat (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      question TEXT,
      answer TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      amount REAL,
      method TEXT,
      status TEXT,
      date TEXT,
      client_email TEXT
    );
  `);
}

export function seed() {
  // Check multiple tables to detect existing data (hermes.db from bot, etc.)
  const tables = ['users','projects','subs','tasks','crew'];
  for (const t of tables) {
    try {
      const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
      if (c > 0) return { seeded: false };
    } catch { /* table may not exist yet */ }
  }

  const ownerPw = bcrypt.hashSync('demo123', 10);
  const viewerPw = bcrypt.hashSync('demo', 10);

  db.prepare(`INSERT INTO users (id,email,name,company,role,password) VALUES (?,?,?,?,?,?)`)
    .run('user-graham', 'assignedvisionary@gmail.com', 'Graham Morris', 'Green Touch Builders', 'owner', ownerPw);
  db.prepare(`INSERT INTO users (id,email,name,company,role,password) VALUES (?,?,?,?,?,?)`)
    .run('user-demo', 'demo@greentouch.pro', 'Demo Viewer', 'Green Touch Pro Guest', 'viewer', viewerPw);

  const projects = [
    ['GTB-2024-001','Woodhouse Day Spa — Leesburg','Woodhouse Day Spa','completed',5500,425000,418000,'2024-01-15','2024-05-20',100,'Completed','excellent','102 Harrison St SE, Leesburg, VA 20175','BP-2024-0012'],
    ['GTB-2024-002','Black Squirrel — Vienna','Black Squirrel Restaurant','active',3460,380000,295000,'2024-03-01','2024-07-15',78,'Interior Finishes','good','170 Maple Ave W, Vienna, VA 22180','BP-2024-0045'],
    ['GTB-2024-003','Pure Sweat Float — Georgetown','Pure Sweat LLC','active',2000,210000,145000,'2024-04-01','2024-08-01',65,'MEP Rough-In','good','3333 M St NW, Washington, DC 20007','BP-2024-0078'],
    ['GTB-2024-004','Alloy Personal Training — Alexandria','Alloy Franchise Group','active',2495,195000,82000,'2024-05-15','2024-09-01',42,'Demo & Framing','warning','701 N Washington St, Alexandria, VA 22314','BP-2024-0101'],
    ['GTB-2024-005','Serotonin Anti-Aging — Sterling','Serotonin Med Spa','planning',4500,350000,15000,'2024-07-01','2024-11-15',5,'Preconstruction','good','46900 Cedar Lakes Plaza, Sterling, VA 20164','Pending'],
  ];
  const insP = db.prepare(`INSERT INTO projects (id,name,client,status,sqft,budget,spent,start,completion,progress,phase,health,address,permit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  projects.forEach(p => insP.run(...p));

  const logs = [
    ['GTB-2024-002','2024-06-14','Bar countertops installed. Final plumbing connections complete.',3,'Mike','construction'],
    ['GTB-2024-002','2024-06-13','Kitchen hood system tested and passed inspection.',2,'Mike','inspection'],
    ['GTB-2024-002','2024-06-12','Flooring complete in dining area. Wall tiles grouted.',4,'Jose','construction'],
    ['GTB-2024-003','2024-06-14','HVAC ductwork complete. Electrical rough-in inspected.',3,'Jose','construction'],
    ['GTB-2024-003','2024-06-13','Float room waterproofing tested — passed.',2,'Mike','inspection'],
    ['GTB-2024-004','2024-06-14','New wall framing underway. Door openings marked.',3,'Jose','construction'],
    ['GTB-2024-004','2024-06-11','Demo 95% complete. Dumpster scheduled for pickup.',2,'Mike','demolition'],
    ['GTB-2024-001','2024-05-20','Final walkthrough completed. Keys handed to client.',5,'Graham','closeout'],
    ['GTB-2024-005','2024-06-10','Preconstruction walkthrough completed. Scope drafted.',1,'Graham','planning'],
  ];
  const insL = db.prepare(`INSERT INTO daily_logs (id,project_id,date,text,photos,submitted_by,category) VALUES (?,?,?,?,?,?,?)`);
  logs.forEach(l => insL.run(nanoid(8), ...l));

  const invoices = [
    ['INV-2024-001','GTB-2024-001',425000,'paid','2024-06-01','2024-05-28','Woodhouse Day Spa','billing@woodhouse.com','Final payment — Woodhouse Day Spa buildout'],
    ['INV-2024-002','GTB-2024-002',150000,'sent','2024-06-20',null,'Black Squirrel','accounts@blacksquirrel.com','Progress billing — Interior finishes milestone'],
    ['INV-2024-003','GTB-2024-003',85000,'sent','2024-06-25',null,'Pure Sweat LLC','finance@puresweat.com','MEP rough-in completion payment'],
    ['INV-2024-004','GTB-2024-004',65000,'draft','2024-07-05',null,'Alloy Franchise Group','ap@alloyfitness.com','Demo & framing milestone'],
    ['INV-2024-005','GTB-2024-005',35000,'draft','2024-07-15',null,'Serotonin Med Spa','billing@serotoninmed.com','Preconstruction consulting retainer'],
  ];
  const insI = db.prepare(`INSERT INTO invoices (id,project_id,amount,status,due_date,paid_date,client_name,client_email,description) VALUES (?,?,?,?,?,?,?,?,?)`);
  invoices.forEach(i => insI.run(...i));

  const leads = [
    ['Michael Miller','Cyxtera Technologies','(703) 555-0142','mmiller@cyxtera.com','Data center office renovation — 8,000 sq ft',8000,'hot','2024-06-08','Existing client. Needs quick turnaround on RFP.','referral'],
    ['Sarah Chen','Bloom Yoga Studio','(571) 555-0189','sarah@bloomyoga.com','New yoga studio buildout — Reston',3200,'warm','2024-06-07','Looking at 3 spaces. Needs budget range by Friday.','website'],
    ['James Wilson','Wilson Dental Group','(202) 555-0223','jwilson@wilsondental.com','Dental office expansion — 1,500 sq ft',1500,'new','2024-06-10','Referred by M&T Bank. Call ASAP for site visit.','referral'],
    ['Lisa Park','CorePower Yoga','(703) 555-0345','lisa@corepower.com','New studio — 3,500 sq ft, Tysons Corner',3500,'warm','2024-06-12','National account. Submit as preferred vendor.','rfi'],
    ['Tom Richards','Bold Fork Restaurant','(202) 555-0456','tom@boldfork.com','Full restaurant buildout — 2,800 sq ft',2800,'new','2024-06-14','Smith Group referred. Fire suppression needed.','referral'],
  ];
  const insLead = db.prepare(`INSERT INTO leads (id,name,company,phone,email,project_desc,sqft,status,date,notes,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  leads.forEach(l => insLead.run('LD-' + nanoid(6).toUpperCase(), ...l));

  const subTpl = [['Mega Mechanical','HVAC','mike@megamech.com'],['Premier Plumbing','Plumbing','jose@premierplumb.com'],['Elite Electric','Electrical','sarah@eliteelec.com']];
  try {
    const insSub = db.prepare(`INSERT INTO subs (id,name,trade,phone,email,project_id,status,rate) VALUES (?,?,?,?,?,?,?,?)`);
    ['GTB-2024-002','GTB-2024-003','GTB-2024-004'].forEach(pid => {
      subTpl.forEach(([name, trade, email], i) => {
        insSub.run(`SUB-${pid.slice(-3)}-${i + 1}`, `${name} (${trade})`, trade, email.split('@')[0], email, pid, 'active', 25000 + Math.floor(Math.random() * 60000));
      });
    });
  } catch { /* subs table may have different schema (hermes.db) */ }

  try {
    const docs = [
      ['GTB-2024-002','Lease Agreement — Black Squirrel'],['GTB-2024-002','Structural Drawings Set 2'],
      ['GTB-2024-003','Permit Approval — Georgetown'],['GTB-2024-003','MEP Plans Rev C'],
      ['GTB-2024-004','Demolition Permit (Approved)'],['GTB-2024-004','Floor Plan — Framing Layout'],
      ['GTB-2024-005','Preconstruction Scope Draft'],
    ];
    const insD = db.prepare(`INSERT INTO documents (id,project_id,name,type,size) VALUES (?,?,?,?,?)`);
    docs.forEach(([pid, name]) => insD.run('DOC-' + nanoid(6).toUpperCase(), pid, name, 'pdf', '1.2 MB'));
  } catch { /* documents table may have different schema */ }

  const todos = [
    ['GTB-2024-002','Schedule final health inspection','Graham','high','open','2024-06-25'],
    ['GTB-2024-002','Order custom bar stools (lead time 3wk)','Mike','med','open','2024-06-30'],
    ['GTB-2024-004','Submit revised framing plan to county','Graham','high','open','2024-06-20'],
    ['GTB-2024-003','Confirm float tank delivery date','Jose','med','open','2024-07-01'],
    ['GTB-2024-005','Finalize preconstruction budget','Graham','high','open','2024-06-22'],
  ];
  const insT = db.prepare(`INSERT INTO todos (id,project_id,task,assignee,priority,status,due_date) VALUES (?,?,?,?,?,?,?)`);
  todos.forEach(t => insT.run('TODO-' + nanoid(6), ...t));

  return { seeded: true };
}

export default db;
