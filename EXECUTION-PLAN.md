# GreenTouch Pro — Execution Plan to First Dollar
*From current state → paying customer. No fluff. DoD per step.*

---

## Current Reality Check
| What Works | What Doesn't |
|---|---|
| Bot: 80 commands, NL routing, voice, AI sub finder | Multi-tenancy (org_id) — **demo only, not SaaS** |
| Dashboard: 27 CRUD pages, PWA, green brand | Stripe — **zero billing** |
| Sync: SQLite → Supabase every 5 min | Render deploy — **tunnel URL dies on restart** |
| Cron: morning, EOD, backup, sync all green | Onboarding — **zero self-serve** |

**Gap to revenue:** 4 things. Everything else is noise.

---

## Phase 1: Sellable Foundation (Week 1)
**Goal:** Stranger pays → gets working org → zero human touch

### 1.1 Render Deploy (Day 1–2)
- Push `green-touch-pro-react` to GitHub (SSH key added)
- Render reads `render.yaml` → builds Docker → deploys `supervisor.mjs`
- Persistent disk at `/data` → SQLite survives restarts
- **DoD:** `https://app.greentouch.pro` returns dashboard, bot polls, DB persists

### 1.2 Multi-Tenancy Schema (Day 2–3)
```sql
-- Add org_id to every table, default 'demo'
ALTER TABLE projects ADD COLUMN org_id TEXT DEFAULT 'demo';
-- Repeat for: punchlist, change_orders, daily_logs, time_entries, subs, assignments, inspections, rfis, submittals, safety_incidents, daily_reports, contacts, conversations, documents, notifications, project_photos, transactions, todos, huddles, huddle_messages, meeting_messages, audit_logs, blockers, deliveries, lien_releases, permits, plan_revisions, reminders, toolbox_talks, invoices, leads
-- Create orgs table
CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT, stripe_customer_id TEXT, status TEXT DEFAULT 'trial', created_at TEXT DEFAULT (datetime('now')));
```
- Bot: derive org_id from Telegram chat_id mapping (group → org)
- Dashboard: scope all queries by `org_id = $1` (from JWT)
- **DoD:** Two Telegram groups → two isolated data sets in dashboard

### 1.3 Stripe Billing (Day 3–4)
- Products: `setup_fee` ($997 one-time) + `monthly_pro` ($697/mo)
- Checkout Session → webhook `/api/stripe/webhook`:
  - `checkout.session.completed` → create org, set `status='active'`, email invite link
  - `invoice.payment_failed` → set `status='past_due'`
- Bot middleware: if `org.status !== 'active'` → read-only + "Payment required" reply
- **DoD:** Test mode checkout → org created → bot works → cancel sub → bot locks

### 1.4 DNS + SSL (Day 4–5)
- Hostinger: CNAME `app` → `greentouch-pro.onrender.com`
- Render: Custom Domain `app.greentouch.pro` → auto SSL
- **DoD:** `https://app.greentouch.pro` loads, green lock, no cert warnings

---

## Phase 2: Self-Serve Onboarding (Week 2)
**Goal:** Payment → first punch item in <10 min, unassisted

### 2.1 `/start` Wizard (Day 1–2)
```
/start → "Welcome! Let's set up your first project."
1. Company name → creates org
2. Project name + address → creates project
3. "Invite your crew" → generates `https://t.me/GreenTouchProBot?start=invite_<org_id>`
4. "Log your first issue" → guided punch flow (see 2.2)
```
- Persist wizard state in `orgs.onboarding_step`
- **DoD:** New user completes wizard, sees project in dashboard, crew clicks invite → in group

### 2.2 Guided Flows (Day 2–3)
Single-word triggers → bot asks remaining fields:
| Trigger | Asks | Creates |
|---|---|---|
| `punch` | "What's the issue?" → "Which sub?" → "Priority 1-3?" | punchlist row |
| `co` | "Describe change?" → "Amount?" → "Approve now?" | change_order row |
| `safety` | "What happened?" → "Location?" → "Corrected?" | safety_incident row |
| `log` | "What did you do today?" | daily_log row |
- Uses existing NL router + session context
- **DoD:** "punch" → 3 taps → punch item in dashboard with photo

### 2.3 Photo Intelligence (Day 3–4)
```
User sends photo → Bot inline keyboard:
[Punch] [Safety] [Daily Log] [Store Only]
User taps → Bot asks description → Creates row + attaches photo
```
- Reuse existing photo handler, add classification step
- **DoD:** Photo → tap Punch → "cracked tile" → punch item with photo in dashboard

### 2.4 Weekly Owner Digest (Day 4–5)
- Cron: Monday 7am → queries org data → formats → sends Telegram + email
- Template:
  ```
  📊 GreenTouch Weekly — Johnson Renovation
  👷 214 hrs | 📋 9 punch closed | 💰 $23k COs approved | ⚠️ 0 incidents
  🔴 Overdue: 2 punch, 1 RFI
  👥 On site: Mike, Jose, Pat (3/5 crew)
  ```
- **DoD:** Graham receives digest, data matches dashboard

---

## Phase 3: First Paying Customer (Week 3)
**Goal:** Signed LOI + $1,694 collected

### 3.1 Demo Video (Day 1)
- Screen record: wizard → punch → co → sub finder → digest → dashboard
- 3 min, phone screen, voice narration
- **DoD:** Video file ready to send

### 3.2 Landing Page (Day 2)
- `greentouch.pro` (Hostinger) → single page:
  - Hook: "Foremen waste 10 hrs/wk on paperwork. We cut it to 10 min."
  - Demo video embed
  - Pricing: $997 setup + $697/mo (founder, unlimited)
  - CTA: "Start 30-day trial" → Stripe checkout link
- **DoD:** Page live, checkout works end-to-end

### 3.3 Pitch Graham (Day 3)
- Send: video + landing link + "Founder rate locked for life. First month free if you're customer #1."
- **DoD:** Graham says yes, pays, org created

### 3.4 Prospect List (Day 4–5)
- DPOR search: Class A GCs, 2–20 employees, NoVA
- 20 names → direct DM/email: video + "First 5 get founder rate forever"
- **DoD:** 5 meetings booked

---

## Phase 4: Retention Loop (Week 4+)
**Goal:** 5 customers, $3,485 MRR by Day 90

| Week | Action |
|---|---|
| 5–6 | Concierge onboarding for each new customer (30-min call) |
| 7–8 | Ship only what ≥2 customers request (v1.5 list) |
| 9–12 | Case study from Graham → landing page → cold outreach scale |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Render deploy fails | Test locally with `docker compose up` first; supervisor.mjs already validated |
| Stripe webhook fails | Use `stripe listen --forward-to localhost:4000/api/stripe/webhook` for local test |
| Multi-tenant query bugs | Add `org_id` to every SELECT/INSERT/UPDATE in server/index.js — grep for `hdb(` |
| Graham says no | Have 20-prospect list ready; pitch next same week |

---

## Success Metrics

| Milestone | Target | Date |
|---|---|---|
| Render live at app.greentouch.pro | ✅ | Day 5 |
| Stripe test checkout → org active | ✅ | Day 9 |
| Self-serve wizard complete | ✅ | Day 14 |
| Graham pays $1,694 | ✅ | Day 21 |
| 5 customers, $3,485 MRR | ✅ | Day 90 |

---

## Start Now — Command Sequence

```bash
# 1. Push to GitHub (triggers Render)
cd /opt/data/green-touch-pro-react && git push origin main

# 2. Watch Render deploy (5-10 min)
# 3. Add CNAME in Hostinger DNS: app → greentouch-pro.onrender.com
# 4. Add custom domain in Render dashboard
# 5. Test Stripe checkout in test mode
# 6. Build multi-tenant schema (run migrate-final.mjs)
# 7. Build /start wizard in bot.js
# 8. Record demo video
# 9. Pitch Graham
```

**First command:** `git push origin main` — when you're ready.