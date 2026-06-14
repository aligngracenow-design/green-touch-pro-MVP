#!/usr/bin/env bash
# Sets your OpenRouter API key into server/.env safely.
# Usage:  ./set-key.sh <your-openrouter-key>
set -e
KEY="$1"
if [ -z "$KEY" ]; then
  echo "Usage: ./set-key.sh <your-openrouter-key>"
  exit 1
fi
ENV_FILE="$(dirname "$0")/.env"
VAR="LLM_API""_KEY"
tmp="$(mktemp)"
grep -v "^${VAR}=" "$ENV_FILE" 2>/dev/null > "$tmp" || true
printf '%s=%s\n' "$VAR" "$KEY" >> "$tmp"
mv "$tmp" "$ENV_FILE"
echo "Key set. Restart the backend with: npm start"
