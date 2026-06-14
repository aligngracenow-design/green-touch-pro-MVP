# 🏗️ Green Touch Pro — Construction Operations OS

The all-in-one operating system for commercial construction companies. Manage projects, budgets, leads, invoicing, client communications, and AI-powered insights — all in one place.

Built as a **full-stack, production-ready product**: React + TypeScript frontend, Express + SQLite backend, JWT auth, and a built-in demo mode so it runs anywhere (including Lovable preview) with zero configuration.

![Stack](https://img.shields.io/badge/React-18-61dafb) ![Stack](https://img.shields.io/badge/TypeScript-5-3178c6) ![Stack](https://img.shields.io/badge/Vite-5-646cff) ![Stack](https://img.shields.io/badge/Tailwind-3-38bdf8) ![Stack](https://img.shields.io/badge/Express-4-000000)

---

## ✨ Features

| Module | What it does |
|---|---|
| **Executive Dashboard** | Real-time KPIs, budget vs. spent charts, lead pipeline, project health scores |
| **Projects** | Full project lifecycle: budgets, phases, progress, addresses, permits |
| **Project Detail** | Tasks (add/check/delete), daily logs, subcontractors, documents, timeline |
| **Leads / CRM** | Pipeline with hot/warm/new statuses, contact info, inline status updates |
| **Invoicing** | Create, send, and mark-paid invoices; collections tracking |
| **AI Assistant** | Ask about risks, budgets, schedule, and pipeline — instant insights |
| **Communications** | Broadcast to Telegram, Email, Slack, SMS & Teams simultaneously |
| **Settings** | User management, backend status, live database record counts |

---

## 🧱 Tech Stack

**Frontend** — Vite · React 18 · TypeScript · Tailwind CSS · React Router · Recharts · Lucide icons
**Backend** — Node · Express · better-sqlite3 · JWT auth · bcrypt

This is **Lovable's native stack** — import the repo into Lovable and it previews & edits instantly.

---

## 🚀 Quick Start

### 1. Frontend (runs standalone in demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:5173 and log in:
- **Email:** `assignedvisionary@gmail.com`
- **Password:** `demo123`

> With no backend running, the app auto-detects and runs in **Demo Mode** on seeded sample data — fully clickable, no setup. Perfect for Lovable preview.

### 2. Backend (for live persistence)

```bash
cd server
cp .env.example .env      # then edit JWT_SECRET
npm install
npm start                 # API on http://localhost:4000
```

The Vite dev server proxies `/api` → `localhost:4000` automatically. Once the backend is up, the frontend switches from demo mode to **Live API** mode and all changes persist to SQLite.

---

## 🌐 Connecting Frontend to Backend in Production

Set `VITE_API_URL` to your deployed backend before building:

```bash
# .env
VITE_API_URL=https://your-backend.onrender.com/api
```

```bash
npm run build     # outputs static site to dist/
```

---

## 📦 Deployment

### Backend → Render / Railway
The included `render.yaml` provisions the API. Or deploy the `/server` folder as a Node service:
- Build: `npm install`
- Start: `npm start`
- Set env: `JWT_SECRET`, `CORS_ORIGINS` (your frontend URL)

### Frontend → Vercel / Netlify / Lovable
- Build command: `npm run build`
- Output directory: `dist`
- Set env: `VITE_API_URL` (your backend URL)

### Docker (full stack)
```bash
docker build -t green-touch-pro .
docker run -p 4000:4000 green-touch-pro
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|---|---|---|
| Owner | `assignedvisionary@gmail.com` | `demo123` |
| Viewer | `demo@greentouch.pro` | `demo` |

---

## 📁 Project Structure

```
green-touch-pro/
├── src/
│   ├── pages/          # 9 app pages (Dashboard, Projects, Leads, etc.)
│   ├── components/     # Layout, sidebar, Modal, Toaster, UI primitives
│   ├── context/        # AuthContext (JWT session)
│   ├── lib/            # api client (+ mock fallback), types, mock data, utils
│   ├── App.tsx         # router with protected routes
│   └── main.tsx        # entry
├── server/
│   ├── index.js        # Express REST API (auth, projects, leads, invoices, AI, comms)
│   ├── db.js           # SQLite schema + seed data
│   └── package.json
├── vite.config.ts      # dev proxy to backend
├── tailwind.config.js  # dark + gold theme
├── Dockerfile
└── render.yaml
```

---

## 📄 License

Proprietary — © Green Touch Builders. All rights reserved.
