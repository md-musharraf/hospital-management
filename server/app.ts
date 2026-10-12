import express, { type NextFunction, type Request, type Response } from 'express'
import { initDb } from './db.ts'
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
  app.set('trust proxy', 'loopback, linklocal, uniquelocal')

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

  const api = express.Router()
  api.use(express.json({ limit: '200kb', verify: (req, _res, buf) => void ((req as Request).rawBody = buf) }))
  api.use((req, res, next) => {
    // Health data: never cache API responses unless a route opts in.
    res.set('Cache-Control', 'no-store')
    // CSRF: cookies are SameSite=Lax; additionally reject cross-site browser writes.
    const origin = req.get('origin')
    if (req.method !== 'GET' && origin && !req.path.startsWith('/whatsapp/webhook') && origin.replace(/^https?:\/\//, '') !== req.get('host'))
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
