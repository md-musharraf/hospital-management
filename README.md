# CarePoint HMS — hospital website + management system

One Node app: a public hospital website with a WhatsApp/web booking bot and a live staff system
(reception billing, doctor desk, owner dashboard). Everything syncs live over Server-Sent Events.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 — creates .env and a demo database on first run
npm test           # API tests: auth/roles/CSRF, billing → live dashboard, stock, bot → OTP portal, queue, search
npm run build && npm start   # production (serves dist/, strict CSP, cache headers)
```

Demo staff logins (dev): `owner`, `reception`, `doctor`, `lab`, `pharmacy` — password is `DEMO_PASSWORD` in `.env`
(random per machine). Demo patient portal: mobile `9000000001`; the login code is shown on screen while WhatsApp is not connected.

Real use: set `SEED_DEMO=false` and `OWNER_PASSWORD=…` in `.env` before the first start (fresh `.data/`), then add
doctors, prices and staff from **Hospital setup** / **Staff accounts**, and fill **Settings**.

## What's inside

| Area | Where |
|---|---|
| Landing page, departments, doctors, FAQ, contact, cookie banner | `src/pages/Landing.tsx`, `landing.css` |
| Booking bot (same brain for website chat and WhatsApp) | `server/bot.ts`, `src/components/Bot.tsx` |
| Live token tracking page, TV queue display with voice | `src/pages/Track.tsx`, `src/pages/Display.tsx` |
| Patient login (WhatsApp OTP) → tokens, bills, lab status | `src/pages/PatientLogin.tsx`, `Portal.tsx` |
| Privacy, cookie and terms pages | `src/pages/Legal.tsx` |
| Staff login, role-based shell | `src/pages/StaffLogin.tsx`, `src/staff/Shell.tsx` |
| Owner dashboard: income, expense, net, dues, 14-day chart, live money feed | `src/staff/Dashboard.tsx` |
| Doctor desk: call next (N key), recall, skip, notes | `src/staff/Desk.tsx` |
| Front desk queue, OPD / lab / pharmacy billing, receipts, dues, cancel+refund | `src/staff/FrontDesk.tsx`, `Billing.tsx`, `Bills.tsx` |
| Lab worklist, pharmacy stock, expenses, catalogs, staff, settings | `src/staff/*` |
| Roles, catalog schema shared by server validation and UI forms | `shared/catalog.ts` |

Roles: **owner** (everything), **doctor** (own queue + income), **reception** (registration, tokens, all billing,
expenses), **lab**, **pharmacy**. Money is stored in paise; income = payments by day (refunds are negative payments).

## Deploy: Render (API + database) and Vercel (website)

```
browser ──► Vercel (website files) ──/api/*──► Render (Node API + SQLite on a disk)
```
Vercel forwards every `/api` request to Render (`vercel.json`), so the browser only ever talks to one domain:
login cookies, live sync and the strict CSP work unchanged, no CORS needed.

**1. Render (backend first)**
1. render.com → **New → Blueprint** → pick this GitHub repo. `render.yaml` creates the `carepoint-hms` service
   (Docker, Singapore, health check `/api/health`, 1 GB disk at `/data`).
2. Render asks for `OWNER_PASSWORD` (8+ characters; staff login is `owner`) and `PUBLIC_URL` (your Vercel URL —
   if you don't know it yet, enter `https://carepoint-hms.vercel.app` and fix it later).
3. Disks need a paid instance; free instances lose all data on every deploy. Keep 1 instance.
4. After the deploy, open `https://<render-url>/api/health` → `{"ok":true}`. Note the exact Render URL.

**2. Vercel (website)**
1. If the Render URL is not exactly `https://carepoint-hms.onrender.com`, change it in `vercel.json` and push.
2. vercel.com → **Add New → Project** → import the repo. `vercel.json` sets the build (`npm run build:web`,
   output `dist`); no environment variables are needed on Vercel.
3. Open the Vercel URL → website; `/staff/login` → owner login. Put this URL in Render's `PUBLIC_URL` if it differs.

**Demo instead of a real hospital:** in Render set `SEED_DEMO=true` and `DEMO_PASSWORD=<your password>` *before*
the first deploy (accounts are only created once, on an empty disk).

Live sync goes through Vercel's proxy; if a stream is ever held back, the app notices within a minute, reconnects
and refreshes, so screens stay correct. WhatsApp webhook: `https://<render-url>/api/whatsapp/webhook`.
The same Docker image also runs anywhere with a persistent `DATA_DIR` (e.g. Railway volume at `/data`).

## Patient quick search

Top bar on every staff screen (**Ctrl K** or **/**), the billing patient field and the Patients page share one search.
Type any mix of words — name, any part of the mobile number, UHID (`P000012`), village/address, gender — every word
must match (`sita 4521`, `kumar rasikpur`, `female 98`). Each suggestion shows today's token, last visit, visit count
and dues (dues hidden from doctors), with one-tap **Check in & bill**, OPD, Lab, Pharmacy and Profile actions.

## WhatsApp

Without keys every message is still written to the outbox (Settings → WhatsApp). To go live, fill `WA_*` in `.env`
and point the Meta webhook at `PUBLIC_URL/api/whatsapp/webhook`. Messages a patient did not start (booking from the
website, "you're next", lab ready) need approved templates outside the 24-hour chat window; the OTP uses
`WA_OTP_TEMPLATE`.

## Cache & privacy

API responses are `no-store`; hashed assets are cached for a year; the service worker (production only) caches the
app shell and assets, never `/api`. Logging out or "Clear cache" wipes the in-memory cache and Cache Storage.
Only essential cookies (`hs_staff`, `hs_patient`, HTTP-only, SameSite=Lax).

Stack: Node 24 (built-in `node:sqlite`, native TypeScript), Express 5, React 19, React Router, Vite, lucide icons,
self-hosted Manrope. Data lives in `.data/hospital.db` locally or `/data/hospital.db` on Render — back that file up.
