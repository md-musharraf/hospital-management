# CarePoint HMS — hospital website + management system

One Node app: a public hospital website with a WhatsApp/web booking bot and a live staff system
(reception billing, doctor desk, owner dashboard). Everything syncs live over Server-Sent Events.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 — creates .env and a demo database on first run
npm test           # API tests: auth/roles/CSRF, billing → live dashboard, stock, bot → OTP portal, queue
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
self-hosted Manrope. Data lives in `.data/hospital.db` — back that file up.
