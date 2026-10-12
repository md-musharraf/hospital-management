import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { join } from 'node:path'
import express from 'express'

const root = join(import.meta.dirname, '..')
const prod = process.argv.includes('--prod') || process.env.NODE_ENV === 'production'
if (prod) process.env.NODE_ENV = 'production'

// First run: create .env from the example with a random demo password (never a shared default).
const envPath = join(root, '.env')
if (!existsSync(envPath) && !prod) {
  writeFileSync(envPath, readFileSync(join(root, '.env.example'), 'utf8').replace('DEMO_PASSWORD=', `DEMO_PASSWORD=${randomBytes(6).toString('base64url')}`))
  console.log('Created .env — demo staff password is DEMO_PASSWORD in that file.')
}
if (existsSync(envPath)) process.loadEnvFile(envPath)

const { createApp } = await import('./app.ts')
const app = createApp({
  dbPath: join(root, '.data', 'hospital.db'),
  demo: process.env.SEED_DEMO === 'true',
  demoPassword: process.env.DEMO_PASSWORD,
  ownerPassword: process.env.OWNER_PASSWORD,
  prod,
})
const server = createServer(app)

if (prod) {
  const dist = join(root, 'dist')
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
  app.use((req, res) => res.status(req.method === 'GET' ? 200 : 404).type('html').set('Cache-Control', 'no-cache').send(html))
} else {
  const { createServer: vite } = await import('vite')
  const v = await vite({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(v.middlewares)
}

const port = Number(process.env.PORT || 3000)
server.listen(port, () => console.log(`Hospital app on http://localhost:${port} (${prod ? 'production' : 'dev'})`))
