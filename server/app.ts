import express, { type NextFunction, type Request, type Response } from 'express'
import { db, initDb } from './db.ts'
import { seed } from './seed.ts'
import { purgeExpired } from './auth.ts'
import { HttpError } from './util.ts'
import { publicRoutes } from './routes/public.ts'
import { staffRoutes } from './routes/staff.ts'
import { adminRoutes } from './routes/admin.ts'

export function createApp(o: { dbPath: string; demo: boolean; demoPassword?: string; ownerPassword?: string; prod: boolean }) {
  initDb(o.dbPath)
  seed({ demo: o.demo, password: o.demoPassword, ownerPassword: o.ownerPassword })
  purgeExpired()
  setInterval(purgeExpired, 3600_000).unref()

  const app = express()
  app.disable('x-powered-by')
  // Rate limits need the visitor's real IP. On Render behind Vercel there are several proxies; Vercel overwrites
  // X-Forwarded-For with the visitor IP, so trusting the whole chain (TRUST_PROXY=true) reads it.
  // ponytail: a caller hitting the Render URL directly can fake that IP; per-account lockout and per-phone OTP
  // limits still hold. Add Vercel's origin-secret header if the backend is ever abused directly.
  const trust = process.env.TRUST_PROXY || (process.env.RENDER ? 'true' : 'loopback, linklocal, uniquelocal')
  app.set('trust proxy', trust === 'true' ? true : trust === 'false' ? false : /^\d+$/.test(trust) ? Number(trust) : trust)

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    })
    // Vite dev injects inline scripts, so the strict CSP is production-only.
    if (o.prod)
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      )
    next()
  })

  // Health check for Render / uptime monitors: proves the process and the database answer.
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get()
    res.set('Cache-Control', 'no-store').json({ ok: true, uptime: Math.round(process.uptime()) })
  })

  const api = express.Router()
  api.use(express.json({ limit: '200kb', verify: (req, _res, buf) => void ((req as Request).rawBody = buf) }))
  api.use((req, res, next) => {
    // Health data: never cache API responses unless a route opts in.
    res.set('Cache-Control', 'no-store')
    // CSRF: cookies are SameSite=Lax; additionally reject cross-site browser writes.
    // Through Vercel's /api proxy the browser's host arrives in x-forwarded-host; a page on
    // another site can't set that header without a CORS preflight, which this API never grants.
    const origin = req.get('origin')
    const host = req.get('x-forwarded-host') ?? req.get('host')
    if (req.method !== 'GET' && origin && !req.path.startsWith('/whatsapp/webhook') && origin.replace(/^https?:\/\//, '') !== host)
      throw new HttpError(403, 'Cross-site request blocked')
    next()
  })
  api.use(publicRoutes, staffRoutes, adminRoutes)
  api.use((_req, _res) => {
    throw new HttpError(404, 'Not found')
  })
  api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err?.type === 'entity.parse.failed' ? 400 : 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message })
  })
  app.use('/api', api)
  return app
}
