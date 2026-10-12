import type { Request, Response, NextFunction } from 'express'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { one, run } from './db.ts'
import { HttpError, cookies } from './util.ts'
import type { Role } from '../shared/catalog.ts'

export type StaffUser = { id: number; name: string; username: string; role: Role; doctor_id: number | null }
declare module 'express-serve-static-core' {
  interface Request {
    user?: StaffUser
    patientPhone?: string
    rawBody?: Buffer
  }
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`
}
export function verifyPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const a = scryptSync(pw, salt, 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

const COOKIE = { staff: 'hs_staff', patient: 'hs_patient' } as const
const TTL = { staff: 12 * 3600_000, patient: 30 * 86400_000 }

export function startSession(res: Response, kind: 'staff' | 'patient', who: { userId?: number; phone?: string }) {
  const token = randomBytes(32).toString('base64url')
  const expires = Date.now() + TTL[kind]
  run('INSERT INTO sessions (token_hash, kind, user_id, phone, expires_at) VALUES (?, ?, ?, ?, ?)', sha256(token), kind, who.userId ?? null, who.phone ?? null, expires)
  res.cookie(COOKIE[kind], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL[kind],
    path: '/',
  })
}

export function endSession(req: Request, res: Response, kind: 'staff' | 'patient') {
  const token = cookies(req)[COOKIE[kind]]
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
  res.clearCookie(COOKIE[kind], { path: '/' })
}

function session(req: Request, kind: 'staff' | 'patient') {
  const token = cookies(req)[COOKIE[kind]]
  if (!token) return
  return one<{ user_id: number; phone: string }>('SELECT user_id, phone FROM sessions WHERE token_hash = ? AND kind = ? AND expires_at > ?', sha256(token), kind, Date.now())
}

export function staffFromReq(req: Request): StaffUser | undefined {
  const s = session(req, 'staff')
  if (!s) return
  return one<StaffUser>('SELECT id, name, username, role, doctor_id FROM users WHERE id = ? AND active = 1', s.user_id)
}

/** Guard: logged-in staff, optionally limited to some roles. */
export const staff =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const u = staffFromReq(req)
    if (!u) throw new HttpError(401, 'Please log in')
    if (roles.length && !roles.includes(u.role)) throw new HttpError(403, 'Your role cannot do this')
    req.user = u
    next()
  }

export function patient(req: Request, _res: Response, next: NextFunction) {
  const s = session(req, 'patient')
  if (!s) throw new HttpError(401, 'Please log in')
  req.patientPhone = s.phone
  next()
}

export function purgeExpired() {
  const now = Date.now()
  run('DELETE FROM sessions WHERE expires_at < ?', now)
  run('DELETE FROM otps WHERE expires_at < ?', now)
  run('DELETE FROM bot_sessions WHERE updated_at < ?', now - 86400_000)
}
