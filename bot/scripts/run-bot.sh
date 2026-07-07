#!/usr/bin/env bash
cd /opt/data/hermes-os
exec node src/telegram/bot.js >> /tmp/hermes-bot3.log 2>&1
