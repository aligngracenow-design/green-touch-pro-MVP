#!/usr/bin/env python3
"""Auto-restart watchdog for GreenTouch.Pro services.

Keeps the Telegram bot and dashboard running.
If either process dies, restarts it after 5 seconds.
"""
import subprocess
import time
import os
import signal
import sys

SERVICES = {
    'bot': {
        'cmd': ['node', 'src/telegram/bot.js'],
        'cwd': '/opt/data/hermes-os',
    },
    'dashboard': {
        'cmd': ['node', 'dist/server.cjs'],
        'cwd': '/opt/data/hermes-os/dashboard',
    },
}

processes = {}
running = True

def handle_signal(sig, frame):
    global running
    print(f'\n🛑 Shutting down watchdog...')
    running = False
    for name, proc in processes.items():
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    sys.exit(0)

signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)

print('🔄 GreenTouch.Pro Watchdog starting...')

while running:
    for name, config in SERVICES.items():
        proc = processes.get(name)
        if proc is None or proc.poll() is not None:
            if proc and proc.poll() is not None:
                exit_code = proc.poll()
                print(f'⚠️  {name} exited (code {exit_code}). Restarting in 5s...')
                time.sleep(5)
            print(f'� Starting {name}...')
            try:
                proc = subprocess.Popen(
                    config['cmd'],
                    cwd=config['cwd'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                processes[name] = proc
                print(f'✅ {name} started (PID {proc.pid})')
            except Exception as e:
                print(f'❌ Failed to start {name}: {e}')
    time.sleep(10)