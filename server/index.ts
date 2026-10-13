import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import express from 'express'

const root = join(import.meta.dirname, '..')
const prod = process.argv.includes('--prod') || process.env.NODE_ENV === 'production'
if (prod) process.env.NODE_ENV = 'production'

// First run: create .env from the example with a random demo password (dev only).
const envPath = join(root, '.env')
if (!existsSync(envPath) && !prod) {
  writeFileSync(
    envPath,
    readFileSync(join(root, '.env.example'), 'utf8').replace('DEMO_PASSWORD=', `DEMO_PASSWORD=${randomBytes(6).toString('base64url')}`),
  )
  console.log('Created .env — demo staff password is DEMO_PASSWORD in that file.')
}
if (existsSync(envPath)) process.loadEnvFile(envPath)

// Persistent storage: on Render point DATA_DIR at the disk mount path (render.yaml sets /data).
const dataDir = process.env.DATA_DIR || join(root, '.data')
const dbPath = process.env.DB_PATH || join(dataDir, 'hospital.db')
if (process.env.RENDER && !process.env.DATA_DIR && !process.env.DB_PATH)
  console.warn('⚠️  DATA_DIR is not set — the database lives on Render’s temporary disk and is wiped on every deploy. Attach a disk at /data and set DATA_DIR=/data.')
if (prod && !process.env.PUBLIC_URL)
  console.warn('⚠️  PUBLIC_URL is not set — WhatsApp links will point at the backend URL instead of your website (set it to the Vercel URL).')
const isDemo = process.env.SEED_DEMO !== 'false'
const defaultPass = process.env.DEMO_PASSWORD || (prod ? 'demo12345' : randomBytes(6).toString('base64url'))

const { createApp } = await import('./app.ts')
const app = createApp({
  dbPath,
  demo: isDemo,
  demoPassword: defaultPass,
  ownerPassword: process.env.OWNER_PASSWORD || (isDemo ? defaultPass : undefined),
  prod,
})
const server = createServer(app)

if (prod) {
  const dist = join(root, 'dist')
  // Serve the .br/.gz files written by scripts/compress.js when the browser accepts them.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const ae = req.get('accept-encoding') ?? ''
    const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : ''
    const file = join(dist, normalize(decodeURIComponent(req.path)))
    const packed = enc && file.startsWith(dist + sep) && file + (enc === 'br' ? '.br' : '.gz')
    if (!packed || !existsSync(packed)) return next()
    res.set({
      'Content-Encoding': enc,
      Vary: 'Accept-Encoding',
      'Cache-Control': /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.type(extname(file)).sendFile(packed)
  })
  app.use(
    express.static(dist, {
      index: false,
      setHeaders: (res, path) => {
        // Hashed build assets never change → cache forever; everything else revalidates.
        res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )
  const html = readFileSync(join(dist, 'index.html'))
  const htmlBr = brotliCompressSync(html)
  app.use((req, res) => {
    res.status(req.method === 'GET' ? 200 : 404).type('html').set({ 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' })
    if (/\bbr\b/.test(req.get('accept-encoding') ?? '')) res.set('Content-Encoding', 'br').send(htmlBr)
    else res.send(html)
  })
} else {
  const { createServer: vite } = await import('vite')
  const v = await vite({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(v.middlewares)
}

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'

server.listen(port, host, () => {
  console.log(`Hospital app running on http://${host}:${port} (${prod ? 'production' : 'dev'})`)
  console.log(`Database located at: ${dbPath}`)
  if (isDemo && !process.env.DEMO_PASSWORD) {
    console.log(`Demo login: owner / ${defaultPass}`)
  }
})

// Graceful shutdown on Railway/Docker redeploy
const shutdown = () => {
  console.log('Gracefully stopping server...')
  server.close(async () => {
    ;(await import('./db.ts')).db.close() // checkpoint the SQLite WAL into the main file
    process.exit(0)
  })
  // Live-sync (SSE) streams never end on their own; cut them after a short grace period.
  setTimeout(() => server.closeAllConnections(), 2000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
