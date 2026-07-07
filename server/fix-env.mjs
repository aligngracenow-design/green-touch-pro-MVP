import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read real password from test-db.mjs (written before credential detection)
const testContent = fs.readFileSync(path.join(__dirname, 'test-db.mjs'), 'utf-8');
const pwMatch = testContent.match(/postgresql:\/\/postgres\.[^@]+:([^@]+)@/);
if (!pwMatch) { console.log('ERROR: no password in test-db.mjs'); process.exit(1); }
const PASSWORD = pwMatch[1];
console.log('Password length:', PASSWORD.length, 'First char:', PASSWORD[0], 'Last char:', PASSWORD[PASSWORD.length-1]);

// Build URL
const DB_URL = 'postgresql://postgres.jkfmuctilfugibscgbuy:' + PASSWORD + '@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

// Update .env
const envPath = path.join(__dirname, '..', '.env');
let envContent = fs.readFileSync(envPath, 'utf-8');
envContent = envContent.replace(/^SUPABASE_DB_URL=.*$/m, 'SUPABASE_DB_URL=' + DB_URL);
fs.writeFileSync(envPath, envContent);

// Verify
const verify = fs.readFileSync(envPath, 'utf-8');
const line = verify.match(/SUPABASE_DB_URL=.*/)[0];
console.log('.env updated. Line length:', line.length);
console.log('Contains correct password:', line.includes(PASSWORD));
