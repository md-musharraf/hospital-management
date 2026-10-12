import { Router } from 'express'
import { randomBytes, randomInt } from 'node:crypto'
import { all, one, run, settings } from '../db.ts'
import { subscribe } from '../events.ts'
import { botReply } from '../bot.ts'
import { getBill } from '../billing.ts'
import { queueAction, queueSnapshot, trackInfo } from '../queue.ts'
import { endSession, patient, sha256, startSession } from '../auth.ts'
import { logIncoming, sendWhatsApp, validSignature, waConfigured } from '../whatsapp.ts'
import { HttpError, bad, int, ip, limit, phone, today, uhid } from '../util.ts'

export const publicRoutes = Router()

const PUBLIC_SETTINGS = ['name', 'short', 'tagline', 'about', 'phone', 'emergency', 'whatsapp', 'email', 'address', 'hours', 'map_url', 'gstin']

publicRoutes.get('/public/site', (_req, res) => {
  const s = settings()
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300')
  res.json({
    settings: Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? ''])),
    departments: all('SELECT id, name, description, icon FROM departments WHERE active = 1 ORDER BY name'),
    doctors: all(
      `SELECT d.id, d.name, d.qualification, d.fee, d.room, d.days, d.start_time, d.end_time, d.bio, d.department_id, dp.name department
       FROM doctors d LEFT JOIN departments dp ON dp.id = d.department_id WHERE d.active = 1 ORDER BY dp.name, d.name`,
    ),
    stats: one('SELECT (SELECT COUNT(*) FROM patients) patients, (SELECT COUNT(*) FROM doctors WHERE active = 1) doctors, (SELECT COUNT(*) FROM departments WHERE active = 1) departments, (SELECT COUNT(*) FROM lab_tests WHERE active = 1) tests'),
  })
})

publicRoutes.get('/public/queue', (_req, res) => res.json(queueSnapshot()))
publicRoutes.get('/public/stream', (req, res) => subscribe(req, res, { public: true }))
publicRoutes.get('/public/track/:code', (req, res) => res.json(trackInfo(String(req.params.code).slice(0, 20))))

// ---- booking bot (website chat) ----
publicRoutes.post('/bot', (req, res) => {
  limit('bot:' + ip(req), 60, 60_000)
  const sid = typeof req.body?.sid === 'string' && /^w:[\w-]{16,40}$/.test(req.body.sid) ? req.body.sid : 'w:' + randomBytes(16).toString('base64url')
  res.json({ sid, messages: botReply(sid, String(req.body?.text ?? ''), 'web') })
})

// ---- WhatsApp Cloud API webhook ----
publicRoutes.get('/whatsapp/webhook', (req, res) => {
  const q = req.query
  if (q['hub.mode'] === 'subscribe' && process.env.WA_VERIFY_TOKEN && q['hub.verify_token'] === process.env.WA_VERIFY_TOKEN) res.send(String(q['hub.challenge']))
  else res.sendStatus(403)
})

publicRoutes.post('/whatsapp/webhook', (req, res) => {
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'))) return void res.sendStatus(401)
  res.sendStatus(200) // ack fast; Meta retries slow webhooks
  for (const entry of req.body?.entry ?? [])
    for (const change of entry.changes ?? [])
      for (const m of change.value?.messages ?? []) {
        const text = m.text?.body ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.button?.text ?? ''
        let from: string
        try {
          from = phone(m.from, true)
        } catch {
          continue // non-Indian numbers are not supported by the bot
        }
        logIncoming(from, text || `[${m.type}]`)
        try {
          const replies = botReply('wa:' + from, text, 'whatsapp', from)
          void (async () => {
            // one by one, so the messages arrive in order
            for (const r of replies)
              await sendWhatsApp(from, r.options?.length ? `${r.text}\n\n${r.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nReply with a number.` : r.text)
          })()
        } catch (e) {
          console.error('whatsapp bot', e)
        }
      }
})

// ---- patient login: phone + one-time code on WhatsApp ----
publicRoutes.post('/patient/otp', async (req, res) => {
  const p = phone(req.body?.phone, true)
  limit('otp-ip:' + ip(req), 10, 10 * 60_000)
  limit('otp:' + p, 3, 10 * 60_000)
  if (!one('SELECT 1 FROM patients WHERE phone = ?', p)) throw new HttpError(404, 'No records found for this number. Book an appointment first — then log in to see tokens and bills.')
  const prod = process.env.NODE_ENV === 'production'
  if (prod && !waConfigured()) throw new HttpError(503, 'Login codes are not available right now. Please contact reception.')
  const code = String(randomInt(100000, 1000000))
  run(
    'INSERT INTO otps (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at',
    p, sha256(p + code), Date.now() + 5 * 60_000, Date.now(),
  )
  const tpl = process.env.WA_OTP_TEMPLATE
  await sendWhatsApp(p, `${code} is your ${settings().name} login code. It expires in 5 minutes. Do not share it.`, {
    template: tpl ? { name: tpl, code } : undefined,
    logBody: 'Login code ●●●●●●',
  })
  res.json({ sent: true, devCode: !prod && !waConfigured() ? code : undefined })
})

publicRoutes.post('/patient/verify', (req, res) => {
  const p = phone(req.body?.phone, true)
  limit('verify-ip:' + ip(req), 20, 10 * 60_000)
  const o = one<{ code_hash: string; expires_at: number; attempts: number }>('SELECT * FROM otps WHERE phone = ?', p)
  if (!o || o.expires_at < Date.now() || o.attempts >= 5) throw bad('Code expired. Please request a new one.')
  if (sha256(p + String(req.body?.code ?? '').trim()) !== o.code_hash) {
    run('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?', p)
    throw bad(`Wrong code. ${4 - o.attempts} attempts left.`)
  }
  run('DELETE FROM otps WHERE phone = ?', p)
  startSession(res, 'patient', { phone: p })
  res.json({ ok: true })
})

publicRoutes.post('/patient/logout', (req, res) => {
  endSession(req, res, 'patient')
  res.json({ ok: true })
})

publicRoutes.get('/patient/me', patient, (req, res) => {
  const ph = req.patientPhone!
  res.set('Cache-Control', 'no-store')
  res.json({
    phone: ph,
    patients: all('SELECT id, name, age, gender FROM patients WHERE phone = ? ORDER BY id', ph).map((p: any) => ({ ...p, uhid: uhid(p.id) })),
    appointments: all(
      `SELECT a.id, a.code, a.token, a.date, a.status, p.name patient, d.name doctor, d.room, d.start_time, dp.name department
       FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id LEFT JOIN departments dp ON dp.id = d.department_id
       WHERE p.phone = ? ORDER BY a.date DESC, a.token DESC LIMIT 30`,
      ph,
    ),
    bills: all(
      `SELECT b.id, b.bill_no, b.type, b.total, b.paid, b.status, b.lab_status, b.created_at, p.name patient
       FROM bills b JOIN patients p ON p.id = b.patient_id WHERE p.phone = ? ORDER BY b.id DESC LIMIT 50`,
      ph,
    ),
    today: today(),
  })
})

publicRoutes.get('/patient/bills/:id', patient, (req, res) => {
  const b = getBill(int(req.params.id, 'Bill', { min: 1 }))
  if (b.patient.phone !== req.patientPhone) throw new HttpError(404, 'Bill not found')
  res.json(b)
})

publicRoutes.post('/patient/appointments/:id/cancel', patient, (req, res) => {
  const a = one<{ id: number; status: string; phone: string }>(
    'SELECT a.id, a.status, p.phone FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?',
    int(req.params.id, 'Appointment', { min: 1 }),
  )
  if (!a || a.phone !== req.patientPhone) throw new HttpError(404, 'Appointment not found')
  if (a.status !== 'booked') throw bad('Only bookings you have not checked in for can be cancelled online')
  res.json(queueAction(a.id, 'cancel'))
})
