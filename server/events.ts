import type { Request, Response } from 'express'
import type { Role } from '../shared/catalog.ts'

// Server-Sent Events hub: one-way live sync, native in every browser, no websocket library.
type Client = { res: Response; role?: Role; doctorId?: number | null; public: boolean }
const clients = new Set<Client>()

export function subscribe(req: Request, res: Response, who: Omit<Client, 'res'>) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  const c = { res, ...who }
  clients.add(c)
  req.on('close', () => clients.delete(c))
}

/**
 * roles: which staff roles receive it (omit = all staff). publicToo: also send to the
 * landing page / TV display / token trackers — only for data with no patient details.
 */
export function emit(type: string, data: unknown, opts: { roles?: Role[]; publicToo?: boolean } = {}) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) {
    if (c.public ? opts.publicToo : !opts.roles || opts.roles.includes(c.role!)) c.res.write(msg)
  }
}

setInterval(() => {
  // A real event (not an SSE comment) so browsers can tell a live stream from one a proxy is holding back.
  for (const c of clients) c.res.write('event: ping\ndata: 1\n\n')
}, 25_000).unref()

export const clientCount = () => clients.size
