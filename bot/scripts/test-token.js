const fs = require('fs');
const envFile = '/opt/data/hermes-os/.env';
const env = {};
fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
  const eq = line.indexOf('=');
  if (eq > 0 && !line.startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
});

const token = env.TELEGRAM_TOKEN;
console.log('Token length:', token?.length);
console.log('Token prefix:', token?.slice(0, 10));
console.log('Token suffix:', token?.slice(-10));

if (token) {
  fetch('https://api.telegram.org/bot' + token + '/getMe')
    .then(r => r.json())
    .then(d => {
      if (d.ok) console.log('✅ Bot live:', d.result.username);
      else console.log('❌', d.description);
    })
    .catch(e => console.log('Network error:', e.message));
} else {
  console.log('❌ No token found in .env');
}