#!/usr/bin/env python3
"""Set the Telegram bot profile photo."""
import os, sys, json

root = '/opt/data/hermes-os'
with open(os.path.join(root, '.env')) as f:
    for line in f:
        if line.startswith('TELEGRAM_TOKEN='***            tok = line.split('=', 1)[1].strip()
            break

import subprocess
r = subprocess.run([
    'curl', '-s', '-X', 'POST',
    f'https://api.telegram.org/bot{tok}/setMyPhoto',
    '-F', f'photo=@/opt/data/image_cache/img_5c5302ce8cab.jpg'
], capture_output=True, text=True, timeout=30)
print(r.stdout)