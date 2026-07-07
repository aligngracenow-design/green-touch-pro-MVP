# GreenTouch Pro — Full Product Plan v1.0
*The Construction Accountability OS. Telegram-first. Built to beat Procore on speed, price, adoption.*

## Positioning

**One line:** Procore power, group-chat simplicity, 1/10 the price, zero training.

| | Procore | Buildertrend | GreenTouch Pro |
|---|---|---|---|
| Price | $375–$1000+/mo + % of volume | $399–$1099/mo | $697/mo flat, unlimited users |
| Onboarding | Weeks, training required | Days | 10 minutes — it's Telegram |
| Field adoption | Low (app fatigue) | Medium | High — crews already use Telegram |
| Voice control | No | No | Yes — full NL routing |
| AI sub finder + license check | No | No | Yes (Gemini + VA DPOR) |
| Contract | Annual | Annual | Month-to-month |

Wedge: 2–20 person GCs who will never buy Procore. 700k+ US construction firms; 91% under 20 employees. Procore ignores them. We own them.

## Stack (locked, no changes)

- **Bot:** Node.js, grammY-style polling, @GreenTouchProBot
- **DB:** Supabase Postgres (canonical, after migration) — SQLite retired
- **Dashboard:** Vite + React + TS + Tailwind, Express API, JWT auth, PWA
- **AI:** Gemini flash (sub finder, transcription routing), Whisper-class STT
- **Payments:** Stripe (subscriptions + setup fee)
- **Deploy:** Render (one Docker service), app.greentouch.pro; landing on greentouch.pro (Hostinger DNS)
- **Email:** Hostinger SMTP, noreply@greentouch.pro (transactional: invites, digests, receipts)

## Product — Final Feature Set

### Core (done)
- 80 commands, full natural-language + voice routing
- Morning check-in / EOD with required photos, auto-clockout
- Punch lists, change orders, daily logs, safety, time tracking, equipment, materials, RFIs, submittals, inspections
- AI sub finder with live VA DPOR license verification
- Dashboard: 27 CRUD pages, PWA, green brand

### v1 Ship List (gap between now and sellable)
1. **Multi-tenancy** — org_id on every table, bot maps Telegram group → org, dashboard scopes by org. Without this it's a demo, not SaaS.
2. **Onboarding flow** — /start wizard: company name, first project, invite link for crew, 3-min guided first punch item. Self-serve, zero human setup.
3. **Stripe billing** — checkout link ($997 setup + $697/mo), webhook → org activated; past_due → bot goes read-only with pay prompt.
4. **Render deploy** — bot + API + dashboard in one service; app.greentouch.pro; UptimeRobot ping.
5. **Bot → Supabase direct** — kill SQLite + 5-min sync; single DB, real-time dashboard.
6. **Guided flows** — single-word triggers (punch / co / safety) walk user through fields. The demo moment.
7. **Photo intelligence** — send photo, bot asks Punch/Safety/Log, attaches, files.
8. **Weekly owner digest** — Monday 7am email + Telegram: hours, punch open/closed, CO totals, safety incidents. Keeps the guy paying.

### v1.5 (first 90 days post-launch, customer-driven)
- Multi-state license lookup (MD, DC next — NoVA GCs work all three)
- Client-facing read-only project link (GC shares progress with homeowner)
- CSV/PDF exports (CO log for lawyers, time for payroll)
- Spanish language mode (half of field crews)
- QuickBooks CSV export (not integration — export)

### v2 (only if customers scream)
- PDF plan viewer (PDF.js, view + pin punch items to sheet)
- Estimates/proposals
- Scheduling board

### Never (scope walls)
Gantt, full accounting, CRM, custom form builder, native mobile apps (PWA is the app).

## Flow — Day in the Life (the sales story)

1. **6:45a** foreman: "good morning" + photo → clocked in, site log opened
2. **8:10a** snaps photo of cracked drywall → bot: Punch/Safety/Log? → "A" → voice: "cracked drywall above window, give it to Mike" → Punch #48, assigned, photo attached
3. **10:30a** "need an electrician near Woodbridge" → 3 licensed subs, DPOR-verified, phone numbers
4. **1:15p** "email pat extend hvac ductwork $14,000 change order" → CO #12 drafted, owner pinged to approve
5. **4:30p** "eod" + photo → clocked out, daily log auto-compiled
6. **Monday 7a** owner gets digest: 214 hrs, 9 punch closed, $23k COs approved, 0 incidents
7. GC never opened a laptop. Everything is in the dashboard for the office.

## Execution Plan

### Phase 1 — Revenue Infrastructure (Week 1)
- D1–2: Render deploy + DNS. app.greentouch.pro live, bot on Render, UptimeRobot.
- D3–4: Stripe products, checkout, webhooks, billing gate in bot + dashboard.
- D5: Multi-tenant schema migration (org_id everywhere, backfill demo org).
- **DoD:** stranger can pay and get a working org with zero human touch.

### Phase 2 — Self-Serve Product (Week 2)
- D1–2: /start onboarding wizard + crew invite links.
- D3: bot direct-to-Supabase (retire sync).
- D4–5: guided flows + photo intelligence.
- **DoD:** new GC from payment to first punch item in under 10 minutes, unassisted.

### Phase 3 — Sell (Week 3)
- D1: record 3-min demo video (day-in-the-life above, real phone screen).
- D2: landing page on greentouch.pro — pain hook, demo video, pricing, checkout link. No sauce: result-first, no feature lecture.
- D3: pitch Graham Morris (Green Touch Builders) — founding customer, $697/mo locked for life, feedback loop.
- D4–5: 20 NoVA GC prospects (Class A list from DPOR, 2–20 employees), direct outreach: video + "first month free if you're one of my first five."
- **DoD:** 1 paying customer.

### Phase 4 — Retention Loop (Week 4+)
- Weekly digest live
- Onboard each new customer personally (concierge until 10 customers)
- Ship v1.5 items strictly by request frequency
- Case study from Graham after 30 days → landing page proof

## Pricing (locked)
- $997 one-time setup (white-glove onboarding, group setup, crew training call)
- $697/mo founder rate, unlimited users/projects, month-to-month
- Later: $997/mo standard once 10 customers; founders keep rate forever
- Unit economics: ~$25/mo infra per org (Render + Supabase + Gemini). 96% gross margin.

## Targets
- 30 days: 1 customer (Graham) — $1,694 collected
- 90 days: 5 customers — $3,485 MRR
- 12 months: 25 customers — $17,425 MRR, one-man SaaS

## Risks
- Telegram unfamiliar to some GCs → position as "works in the app your crew already has"; WhatsApp bridge if it ever blocks 3+ deals
- DPOR CAPTCHA → cache lookups 30 days; human-paced usage fine
- Solo-founder support → concierge scales to ~25 orgs; fine for year 1
