# GreenTouch.pro — single production image (v20260708)
# Runs the dashboard API + React frontend + Telegram bot together,
# all against ONE SQLite database on a mounted persistent disk.

# ---- Stage 1: build the React frontend ----
FROM node:22-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build          # -> /app/dist

# ---- Stage 2: runtime ----
FROM node:22-slim
# Python3 (stdlib only — sub finder & license verifier) + ffmpeg (voice notes)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dashboard API deps
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Bot deps
COPY bot/package*.json ./bot/
RUN cd bot && npm install --omit=dev

# App code
COPY server/ ./server/
COPY bot/ ./bot/
COPY supervisor.mjs ./

# Built frontend served statically by the dashboard API
COPY --from=frontend /app/dist ./server/public

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/data
EXPOSE 4000

# Persistent disk mounts at /data (hermes.db + backups live here)
VOLUME ["/data"]

CMD ["node", "supervisor.mjs"]
