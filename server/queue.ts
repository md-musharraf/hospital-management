import { randomBytes } from 'node:crypto'
import { all, insert, one, run } from './db.ts'
import { emit } from './events.ts'
import { sendWhatsApp } from './whatsapp.ts'
import { HttpError, bad, nowHM, prettyDay, today, addDays, weekday } from './util.ts'

export type Doctor = { id: number; name: string; department_id: number; fee: number; room: string; days: string; start_time: string; end_time: string; max_tokens: number; active: number }
export type Appt = { id: number; code: string; patient_id: number; doctor_id: number; date: string; token: number; status: string; notified: number }

// Railway sets RAILWAY_PUBLIC_DOMAIN, so WhatsApp links work without configuring PUBLIC_URL.
export const publicUrl = () =>
  (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || 3000}`)).replace(/\/$/, '')
const ACTIVE = "status IN ('booked','waiting','called')"

export function findOrCreatePatient(p: { name: string; phone: string; age?: number | null; gender?: string }) {
  if (p.phone) {
    const found = one<{ id: number }>('SELECT id FROM patients WHERE phone = ? AND lower(name) = lower(?)', p.phone, p.name)
    if (found) return found.id
  }
  const now = new Date()
  return insert(
    'INSERT INTO patients (name, phone, age, gender, created_at, day) VALUES (?, ?, ?, ?, ?, ?)',
    p.name, p.phone, p.age ?? null, p.gender ?? '', now.toISOString(), today(),
  )
}

export function getDoctor(id: number) {
  const d = one<Doctor>('SELECT * FROM doctors WHERE id = ? AND active = 1', id)
  if (!d) throw bad('Doctor not found')
  return d
}

/** Next dates the doctor sits (today only while OPD is still running). */
export function availableDates(d: Doctor, count = 6) {
  const out: string[] = []
  const days = d.days.split(',')
  for (let i = 0; i < 21 && out.length < count; i++) {
    const day = addDays(today(), i)
    if (!days.includes(weekday(day))) continue
    if (i === 0 && nowHM() >= d.end_time) continue
    out.push(day)
  }
  return out
}

/** Creates a queue token. Re-booking the same patient/doctor/day returns the existing token. */
export function book(o: { patientId: number; doctorId: number; date: string; status: 'booked' | 'waiting'; source: string; strictDay?: boolean }) {
  const d = getDoctor(o.doctorId)
  if (o.date < today()) throw bad('Date is in the past')
  if (o.strictDay && !availableDates(d, 30).includes(o.date)) throw bad(`Dr. ${d.name.replace(/^Dr\.?\s*/, '')} has no OPD on ${prettyDay(o.date)}`)
  const dup = one<Appt>(`SELECT * FROM appointments WHERE patient_id = ? AND doctor_id = ? AND date = ? AND ${ACTIVE}`, o.patientId, o.doctorId, o.date)
  if (dup) {
    if (dup.status === 'booked' && o.status === 'waiting') run("UPDATE appointments SET status = 'waiting' WHERE id = ?", dup.id)
    return { ...dup, status: dup.status === 'booked' ? o.status : dup.status, existing: true }
  }
  const { n, max } = one<{ n: number; max: number }>('SELECT COUNT(*) n, COALESCE(MAX(token), 0) max FROM appointments WHERE doctor_id = ? AND date = ?', o.doctorId, o.date)!
  if (n >= d.max_tokens) throw new HttpError(409, `All ${d.max_tokens} tokens for ${prettyDay(o.date)} are taken. Please pick another day.`)
  const code = randomBytes(6).toString('base64url')
  const id = insert(
    'INSERT INTO appointments (code, patient_id, doctor_id, date, token, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    code, o.patientId, o.doctorId, o.date, max + 1, o.status, o.source, new Date().toISOString(),
  )
  return { ...one<Appt>('SELECT * FROM appointments WHERE id = ?', id)!, existing: false }
}

/** Public, name-free view of today's queues (landing page, TV display). */
export function queueSnapshot() {
  const day = today()
  const doctors = all<Doctor & { department: string }>(
    `SELECT d.*, dp.name department FROM doctors d LEFT JOIN departments dp ON dp.id = d.department_id
     WHERE d.active = 1 AND (instr(d.days, ?) > 0 OR EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id = d.id AND a.date = ?))
     ORDER BY d.name`,
    weekday(day), day,
  )
  const rows = all<{ doctor_id: number; token: number; status: string }>('SELECT doctor_id, token, status FROM appointments WHERE date = ? ORDER BY token', day)
  return doctors.map((d) => {
    const mine = rows.filter((r) => r.doctor_id === d.id)
    const waiting = mine.filter((r) => r.status === 'waiting')
    return {
      doctorId: d.id,
      doctor: d.name,
      department: d.department,
      room: d.room,
      hours: `${d.start_time}–${d.end_time}`,
      current: mine.filter((r) => r.status === 'called').at(-1)?.token ?? null,
      next: waiting.slice(0, 4).map((r) => r.token),
      waiting: waiting.length,
      booked: mine.filter((r) => r.status === 'booked').length,
      done: mine.filter((r) => r.status === 'done').length,
    }
  })
}

export function trackInfo(code: string) {
  const a = one<Appt & { patient: string; doctor: string; room: string; start_time: string }>(
    `SELECT a.*, p.name patient, d.name doctor, d.room, d.start_time FROM appointments a
     JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id WHERE a.code = ?`,
    code,
  )
  if (!a) throw new HttpError(404, 'Token not found')
  const ahead =
    a.status === 'waiting' || a.status === 'booked'
      ? one<{ n: number }>("SELECT COUNT(*) n FROM appointments WHERE doctor_id = ? AND date = ? AND status IN ('waiting','called') AND token < ?", a.doctor_id, a.date, a.token)!.n
      : 0
  const current = one<{ token: number }>("SELECT token FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'called' ORDER BY called_at DESC LIMIT 1", a.doctor_id, a.date)
  return {
    code: a.code,
    token: a.token,
    date: a.date,
    status: a.status,
    patient: a.patient.split(' ')[0], // first name only: link may be forwarded
    doctor: a.doctor,
    room: a.room,
    startTime: a.start_time,
    ahead,
    current: current?.token ?? null,
    doctorId: a.doctor_id,
    today: today(),
  }
}

export const trackUrl = (code: string) => `${publicUrl()}/track/${code}`

function notifyNext(doctorId: number, date: string) {
  const n = one<Appt & { phone: string; doctor: string; room: string }>(
    `SELECT a.*, p.phone, d.name doctor, d.room FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id
     WHERE a.doctor_id = ? AND a.date = ? AND a.status = 'waiting' ORDER BY a.token LIMIT 1`,
    doctorId, date,
  )
  if (!n || n.notified || !n.phone) return
  run('UPDATE appointments SET notified = 1 WHERE id = ?', n.id)
  void sendWhatsApp(n.phone, `🔔 You're next! Token #${n.token} for ${n.doctor}${n.room ? `, room ${n.room}` : ''}. Please be near the cabin.\nLive status: ${trackUrl(n.code)}`)
}

export function queueChanged(doctorId: number, announce?: { token: number }) {
  const d = one<{ name: string; room: string }>('SELECT name, room FROM doctors WHERE id = ?', doctorId)
  emit('queue', { doctorId, snapshot: queueSnapshot() }, { publicToo: true })
  if (announce && d) emit('announce', { doctorId, token: announce.token, doctor: d.name, room: d.room }, { publicToo: true })
}

const ACTIONS = ['checkin', 'call', 'recall', 'done', 'skip', 'requeue', 'cancel'] as const
export type QueueAction = (typeof ACTIONS)[number]
export const isAction = (a: unknown): a is QueueAction => ACTIONS.includes(a as QueueAction)

const ALLOWED: Record<QueueAction, string[]> = {
  checkin: ['booked'],
  call: ['waiting', 'skipped', 'booked'],
  recall: ['called'],
  done: ['called', 'waiting'],
  skip: ['waiting', 'called', 'booked'],
  requeue: ['skipped', 'done'],
  cancel: ['booked', 'waiting'],
}

export function queueAction(id: number, action: QueueAction) {
  const a = one<Appt>('SELECT * FROM appointments WHERE id = ?', id)
  if (!a) throw new HttpError(404, 'Token not found')
  if (!ALLOWED[action].includes(a.status)) throw bad(`Cannot ${action} a token that is ${a.status}`)
  const now = new Date().toISOString()
  if (action === 'call') {
    // Calling someone finishes whoever was with the doctor.
    run("UPDATE appointments SET status = 'done', done_at = ? WHERE doctor_id = ? AND date = ? AND status = 'called'", now, a.doctor_id, a.date)
    run("UPDATE appointments SET status = 'called', called_at = ? WHERE id = ?", now, id)
  } else if (action === 'checkin' || action === 'requeue') run("UPDATE appointments SET status = 'waiting' WHERE id = ?", id)
  else if (action === 'done') run("UPDATE appointments SET status = 'done', done_at = ? WHERE id = ?", now, id)
  else if (action === 'skip') run("UPDATE appointments SET status = 'skipped' WHERE id = ?", id)
  else if (action === 'cancel') run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", id)
  if (a.date === today()) notifyNext(a.doctor_id, a.date)
  queueChanged(a.doctor_id, action === 'call' || action === 'recall' ? { token: a.token } : undefined)
  return one<Appt>('SELECT * FROM appointments WHERE id = ?', id)!
}

export function callNext(doctorId: number) {
  const n = one<Appt>("SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'waiting' ORDER BY token LIMIT 1", doctorId, today())
  if (!n) {
    run("UPDATE appointments SET status = 'done', done_at = ? WHERE doctor_id = ? AND date = ? AND status = 'called'", new Date().toISOString(), doctorId, today())
    queueChanged(doctorId)
    return null
  }
  return queueAction(n.id, 'call')
}

export function bookingMessage(a: { token: number; date: string; code: string }, d: { name: string; room: string; start_time: string }, hospital: string) {
  return (
    `✅ Appointment confirmed at ${hospital}\n` +
    `Token #${a.token} · ${d.name}\n${prettyDay(a.date)}, OPD from ${d.start_time}${d.room ? ` · Room ${d.room}` : ''}\n` +
    `Track your turn live: ${trackUrl(a.code)}`
  )
}
