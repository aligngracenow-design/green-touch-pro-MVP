import fs from 'fs';

// Read token from .env (same way the bot does)
const envFile = '/opt/data/hermes-os/.env';
const env = {};
fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
  const eq = line.indexOf('=');
  if (eq > 0 && !line.startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
});

const token = env.TELEGRAM_TOKEN;

// Find our chat ID by polling
const API = `https://api.telegram.org/bot${token}`;

async function test() {
  console.log('Token length:', token?.length);
  
  // Get bot info
  const me = await fetch(`${API}/getMe`).then(r => r.json());
  console.log('Bot:', me.ok ? me.result.username : 'FAILED: ' + me.description);
  
  if (!me.ok) { console.error('Bot token invalid'); return; }

  // Get recent updates to find chat ID
  const updates = await fetch(`${API}/getUpdates?limit=5`).then(r => r.json());
  const chatIds = new Set();
  if (updates.ok && updates.result.length) {
    for (const u of updates.result) {
      if (u.message?.chat?.id) chatIds.add(u.message.chat.id);
    }
  }
  
  if (chatIds.size === 0) {
    console.log('\n⚠️  No chats found. Open Telegram and send /start to @Greentouchdemobot first!');
    return;
  }

  // Send test message to the most recent chat
  const chatId = [...chatIds][0];
  const send = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      chat_id: chatId, 
      text: '✅ *Hermes Online*\n\nThe bot is fully operational.\nTry these commands:\n\n/help — Full guide\n/assign Mike test task\n/assignments — View all tasks\n\nSend a voice note or photo to test iPhone features!',
      parse_mode: 'Markdown'
    })
  }).then(r => r.json());
  
  console.log('Message sent:', send.ok ? '✅' : '❌ ' + send.description);
}

test().catch(e => console.error('Error:', e.message));