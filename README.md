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

## Deploy on Railway

1. **New project → Deploy from GitHub repo.** `railway.json` builds the `Dockerfile` (Node 24) and health-checks `/api/health`.
2. **Add a volume** to the service, mount path `/data`. The app finds it through `RAILWAY_VOLUME_MOUNT_PATH`
   and keeps `hospital.db` there. Without a volume the database is wiped on every deploy (the log warns you).
3. **Variables** (service → Variables):
   - `SEED_DEMO=false` and `OWNER_PASSWORD=<strong password>` for a real hospital, **or**
     `DEMO_PASSWORD=<your own password>` for a demo. If neither is set, the demo accounts use the built-in
     default password from `server/index.ts` — change it before sharing the URL.
   - `HOSPITAL_TZ=Asia/Kolkata` (default) and the `WA_*` WhatsApp keys when ready.
   - `PUBLIC_URL` is optional: links in WhatsApp messages use Railway's public domain automatically.
4. **Generate a domain** (Settings → Networking). Point the WhatsApp webhook at `https://<domain>/api/whatsapp/webhook`.

Built for one instance (SQLite on a volume, in-process live sync and rate limits) — keep replicas at 1.
Static files are pre-compressed with Brotli/Gzip at build time (≈540 KB → 150 KB) and cached for a year; HTML and API
are never cached. Redeploys close live connections and checkpoint the database before exiting.

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
self-hosted Manrope. Data lives in `.data/hospital.db` locally or `/data/hospital.db` on Railway — back that file up.
