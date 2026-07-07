#!/bin/bash
# GreenTouch Hermes Construction Bot — One-command launcher

cd "$(dirname "$0")"
export TELEGRAM_TOKEN=8841099621:AAEck9zlB5sowIcmzTl4T5t9vrGmaXzMLHA

echo "🤖 Starting Hermes Construction Bot..."
node server/start-hermes.js