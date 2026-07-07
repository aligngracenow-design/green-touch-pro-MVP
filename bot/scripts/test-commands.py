#!/usr/bin/env python3
"""Test all bot commands via Telegram API"""
import subprocess, json, sys, re

# Read env
with open('/opt/data/hermes-os/.env') as f:
    env = dict(line.strip().split('=', 1) for line in f if '=' in line and not line.startswith('#'))
token = env.get('TELEGRAM_TOKEN', '')
if not token:
    print("No token found")
    sys.exit(1)

chat = "6795294283"  # Based Dev Based

tests = [
    ("/addsub Mike AcmeDrywall Drywall 703-555-0142", "addsub"),
    ("/whodoes Drywall", "whodoes"),
    ("/punch Woodbridge Room 204 -- touch up paint", "punch"),
    ("/delivery Woodbridge lumber from Builders Supply on Monday 8am", "delivery"),
    ("/rfi Woodbridge Waiting on window detail from architect", "rfi"),
    ("/remind Woodbridge Lumber delivery at 9am", "remind"),
    ("/concrete 30 40 6", "concrete"),
    ("/studs 40 16", "studs"),
    ("/deliveries", "deliveries"),
    ("/rfis", "rfis"),
    ("/punchlist", "punchlist"),
    ("/subs", "subs"),
    ("/help", "help"),
]

passed = 0
failed = 0
for text, name in tests:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    result = subprocess.run(
        ["curl", "-s", url, "-d", f"chat_id={chat}&text={text}&parse_mode=Markdown"],
        capture_output=True, text=True, timeout=10
    )
    try:
        d = json.loads(result.stdout)
        if d.get('ok'):
            print(f"  ✅ {name:15s}: OK")
            passed += 1
        else:
            print(f"  ❌ {name:15s}: {d.get('description', 'unknown')}")
            failed += 1
    except:
        print(f"  ❌ {name:15s}: parse error - {result.stdout[:100]}")
        failed += 1

print(f"\n{'='*40}")
print(f"  ✅ Passed: {passed}  ❌ Failed: {failed}")
