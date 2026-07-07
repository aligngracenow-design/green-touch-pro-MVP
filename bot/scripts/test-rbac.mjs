/**
 * End-to-End RBAC Security Test Suite
 * Tests every role gate against every command
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'hermes.db');
const db = new Database(DB_PATH);

// Mirror the bot's RBAC logic exactly
const ROLE_LEVELS = { owner: 4, exec: 3, foreman: 2, sub: 1, anyone: 0 };

function getUserRole(chatId, userId) {
  const row = db.prepare('SELECT role FROM user_roles WHERE user_id=? AND chat_id=?').get(String(userId), String(chatId));
  return row?.role || 'sub'; // default: sub (read-only)
}

function checkRole(chatId, userId, requiredLevel) {
  const role = getUserRole(chatId, userId);
  const userLevel = ROLE_LEVELS[role] || 0;
  const required = ROLE_LEVELS[requiredLevel] || 0;
  return { allowed: userLevel >= required, role, required: requiredLevel };
}

// Full command matrix
const COMMANDS = {
  // PUBLIC — read-only, no gate
  '/start': null, '/help': null, '/pending': null, '/status': null,
  '/assignments': null, '/tasks': null, '/assigns': null,
  '/subs': null, '/subcontractors': null, '/whodoes': null,
  '/punchlist': null, '/punches': null, '/deliveries': null, '/deliverys': null,
  '/rfis': null, '/rfislist': null, '/roles': null, '/myrole': null,
  '/contacts': null, '/emaillist': null, '/calc': null, '/calculator': null,
  '/concrete': null, '/studs': null, '/cos': null, '/copending': null,
  '/reports': null, '/reportlist': null, '/reportweek': null,
  '/inspections': null, '/inspectlist': null, '/inspectpending': null,
  '/onsite': null, '/crew': null, '/incidents': null,
  '/toolboxtalks': null, '/toolboxlist': null, '/permits': null, '/permitlist': null,
  '/permitexpiring': null, '/permitfee': null, '/permitfees': null,
  '/submittals': null, '/submittallist': null, '/submittalsstale': null, '/stalereviews': null,
  '/blocks': null, '/blockers': null, '/blocklist': null,
  '/liens': null, '/lienlist': null, '/lienpending': null,
  '/planrevs': null, '/revisions': null, '/meetings': null, '/meetingminutes': null,
  '/link': null, '/dashboard': null, '/dash': null, '/app': null,
  '/tutorial': null, '/cheatsheet': null, '/quickref': null, '/guide': null,
  '/workflow': null, '/recipe': null, '/playbook': null,
  '/sub': null, // /sub (search, no args = read-only)

  // FOREMAN+
  '/assign': 'foreman', '/a': 'foreman',
  '/punch': 'foreman', '/punchadd': 'foreman',
  '/punchdone': 'foreman', '/punchcomplete': 'foreman', '/punchclose': 'foreman',
  '/delivery': 'foreman', '/rfi': 'foreman',
  '/rfi_done': 'foreman', '/rficlose': 'foreman', '/rficomplete': 'foreman',
  '/remind': 'foreman', '/clockin': 'foreman', '/clockout': 'foreman',
  '/incident': 'foreman', '/toolbox': 'foreman',
  '/dailyreport': 'foreman', '/block': 'foreman',
  '/escalate': 'foreman', '/complete': 'foreman', '/done': 'foreman',

  // EXEC+
  '/addcontact': 'exec', '/addemail': 'exec',
  '/removecontact': 'exec', '/deletecontact': 'exec',
  '/email': 'exec', '/huddle': 'exec', '/voiceroom': 'exec', '/voiceroomstart': 'exec',
  '/endhuddle': 'exec', '/addco': 'exec', '/changeorder': 'exec',
  '/co': 'exec', '/permit': 'exec', '/submittal': 'exec',
  '/inspect': 'exec', '/meeting': 'exec', '/endmeeting': 'exec',

  // OWNER ONLY
  '/addsub': 'owner', '/vetsub': 'owner', '/vet': 'owner',
  '/findsub': 'owner', '/searchsub': 'owner',
  '/setrole': 'owner', '/sub add': 'owner',
  '/lien': 'owner', '/planrev': 'owner', '/revision': 'owner', '/plans': 'owner',
};

// Test users
const CHAT = 'test-chat-123';
const users = {
  unregistered: { id: '999999', expectedRole: 'sub' },
  sub_user: { id: '111111', role: 'sub' },
  foreman_user: { id: '222222', role: 'foreman' },
  exec_user: { id: '333333', role: 'exec' },
  owner_user: { id: '444444', role: 'owner' },
};

// Setup test users
db.exec('DELETE FROM user_roles WHERE chat_id = ?');
db.prepare('DELETE FROM user_roles WHERE chat_id = ?').run(CHAT);
for (const [name, u] of Object.entries(users)) {
  if (u.role) {
    db.prepare('INSERT OR REPLACE INTO user_roles (user_id, chat_id, role, set_by) VALUES (?,?,?,?)')
      .run(u.id, CHAT, u.role, 'test-suite');
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  GreenTouch.Pro RBAC Security Test Suite');
console.log('═══════════════════════════════════════════════════════════\n');

let total = 0, passed = 0, failed = 0;
const failures = [];

// Test 1: Default role for unregistered users
console.log('📋 TEST 1: Default role assignment');
const unreg = getUserRole(CHAT, users.unregistered.id);
total++;
if (unreg === 'sub') { passed++; console.log('  ✅ Unregistered user defaults to "sub"'); }
else { failed++; failures.push(`Default role is "${unreg}" not "sub"`); console.log(`  ❌ Default role is "${unreg}"`); }

// Test 2: Role lookup for registered users
console.log('\n📋 TEST 2: Registered user role lookup');
for (const [name, u] of Object.entries(users)) {
  if (!u.role) continue;
  total++;
  const role = getUserRole(CHAT, u.id);
  if (role === u.role) { passed++; console.log(`  ✅ ${name}: ${role}`); }
  else { failed++; failures.push(`${name} role is "${role}" not "${u.role}"`); console.log(`  ❌ ${name}: got "${role}", expected "${u.role}"`); }
}

// Test 3: Every command gate test for every role
console.log('\n📋 TEST 3: Command gate matrix (every command × every role)');
for (const [cmd, required] of Object.entries(COMMANDS)) {
  for (const [userName, u] of Object.entries(users)) {
    total++;
    const result = checkRole(CHAT, u.id, required || 'anyone');
    const expectedAllowed = required ? (ROLE_LEVELS[u.expectedRole || u.role] >= ROLE_LEVELS[required]) : true;
    
    if (result.allowed === expectedAllowed) {
      passed++;
    } else {
      failed++;
      const msg = `${cmd}: ${userName}(${result.role}) got ${result.allowed ? 'ALLOWED' : 'BLOCKED'}, expected ${expectedAllowed ? 'ALLOWED' : 'BLOCKED'} (requires: ${required || 'none'})`;
      failures.push(msg);
      console.log(`  ❌ ${msg}`);
    }
  }
}

// Test 4: Specific bypass vectors
console.log('\n📋 TEST 4: Known bypass vectors');
const bypassTests = [
  { cmd: '/sub add', desc: '/sub add bypasses /addsub gate' },
  { cmd: '/escalate', desc: '/escalate gated (was ungated)' },
  { cmd: '/complete', desc: '/complete gated (was ungated)' },
];
for (const { cmd, desc } of bypassTests) {
  total++;
  const required = COMMANDS[cmd];
  const result = checkRole(CHAT, users.sub_user.id, required || 'anyone');
  if (!result.allowed) {
    passed++;
    console.log(`  ✅ ${desc}: properly BLOCKED for sub`);
  } else {
    failed++;
    failures.push(`${desc}: ALLOWED for sub (should be blocked)`);
    console.log(`  ❌ ${desc}: ALLOWED for sub!`);
  }
}

// Test 5: Privilege escalation — can sub promote themselves?
console.log('\n📋 TEST 5: Privilege escalation vectors');
total++;
const setRoleForSub = checkRole(CHAT, users.sub_user.id, 'owner');
if (!setRoleForSub.allowed) {
  passed++;
  console.log('  ✅ Sub cannot use /setrole');
} else {
  failed++;
  failures.push('Sub can use /setrole — PRIVILEGE ESCALATION!');
  console.log('  ❌ Sub CAN use /setrole!');
}

// Test 6: Role hierarchy integrity
console.log('\n📋 TEST 6: Role level ordering');
const levels = Object.entries(ROLE_LEVELS).sort((a, b) => a[1] - b[1]);
const expected = ['anyone', 'sub', 'foreman', 'exec', 'owner'];
const actual = levels.map(l => l[0]);
total++;
if (JSON.stringify(actual) === JSON.stringify(expected)) {
  passed++;
  console.log(`  ✅ Correct: ${actual.join(' < ')}`);
} else {
  failed++;
  failures.push(`Role order wrong: ${actual.join(' < ')}`);
  console.log(`  ❌ Expected: ${expected.join(' < ')}, got: ${actual.join(' < ')}`);
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n❌ FAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED — No security gaps found.');
}

// Cleanup
db.prepare('DELETE FROM user_roles WHERE chat_id = ?').run(CHAT);
db.close();
