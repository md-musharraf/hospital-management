import type { Request } from 'express'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const bad = (msg: string) => new HttpError(400, msg)

// ---- input validation at the trust boundary ----
export function str(v: unknown, label: string, { min = 1, max = 200 } = {}): string {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  if (s.length < min) throw bad(`${label} is required`)
  if (s.length > max) throw bad(`${label} is too long`)
  return s
}
export const optStr = (v: unknown, label: string, max = 500) => (v == null || v === '' ? '' : str(v, label, { min: 0, max }))

export function int(v: unknown, label: string, { min = 0, max = 1e9 } = {}): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number between ${min} and ${max}`)
  return n
}
/** Rupees from the client (may have 2 decimals) → integer paise. */
export function paise(v: unknown, label: string, max = 1e8): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) throw bad(`${label} must be a valid amount`)
  return Math.round(n * 100)
}
export function oneOf<T extends string>(v: unknown, label: string, list: readonly T[]): T {
  if (!list.includes(v as T)) throw bad(`${label} is invalid`)
  return v as T
}
export function dateStr(v: unknown, label = 'Date'): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad(`${label} must be YYYY-MM-DD`)
  return v
}
/** Indian mobile → 10 digits, or '' when empty. */
export function phone(v: unknown, required = false): string {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (!d && !required) return ''
  if (!/^[6-9]\d{9}$/.test(d)) throw bad('Enter a valid 10-digit mobile number')
  return d
}

// ---- dates in the hospital's timezone ----
const tz = () => process.env.HOSPITAL_TZ || 'Asia/Kolkata'
export const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(d)
export const today = () => dayOf(new Date())
export const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const weekday = (day: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T12:00:00Z').getUTCDay()]
/** Current HH:MM in hospital timezone. */
export const nowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
export const prettyDay = (day: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export const rupees = (p: number) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
export const uhid = (id: number) => 'P' + String(id).padStart(6, '0')

// ---- tiny in-memory rate limiter (ponytail: per-process; move to Redis if you run several instances) ----
const hits = new Map<string, { n: number; reset: number }>()
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.reset < now) return void hits.set(key, { n: 1, reset: now + windowMs })
  if (++h.n > max) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.')
}
setInterval(() => {
  const now = Date.now()
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k)
}, 60_000).unref()

export const ip = (req: Request) => req.ip || req.socket.remoteAddress || '?'

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
