import { Router } from 'express'
import { all, insert, one, run } from '../db.ts'
import { emit, subscribe } from '../events.ts'
import { endSession, hashPassword, staff, startSession, verifyPassword, type StaffUser } from '../auth.ts'
import { cancelBill, createBill, getBill, payDue, sendReceipt, setLabStatus } from '../billing.ts'
import { book, callNext, isAction, queueAction, queueChanged } from '../queue.ts'
import { HttpError, bad, dateStr, int, ip, limit, oneOf, optStr, paise, phone, str, today, uhid, weekday } from '../util.ts'
import { BILL_ROLES, EXPENSE_CATEGORIES, LAB_STATUS, PAY_MODES, billTypesFor, type BillType, type Role } from '../../shared/catalog.ts'

export const staffRoutes = Router()

// ---- auth ----
staffRoutes.post('/auth/login', (req, res) => {
  limit('login:' + ip(req), 20, 10 * 60_000)
  const username = str(req.body?.username, 'Username', { max: 60 })
  const password = str(req.body?.password, 'Password', { max: 200 })
  const u = one<any>('SELECT * FROM users WHERE username = ?', username)
  if (u?.locked_until > Date.now()) throw new HttpError(423, `Account locked after failed attempts. Try again in ${Math.ceil((u.locked_until - Date.now()) / 60_000)} min.`)
  if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
    if (u) {
      const failed = u.failed + 1
      run('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?', failed >= 5 ? 0 : failed, failed >= 5 ? Date.now() + 15 * 60_000 : 0, u.id)
    }
    throw new HttpError(401, 'Wrong username or password')
  }
  run('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?', u.id)
  startSession(res, 'staff', { userId: u.id })
  res.json({ id: u.id, name: u.name, username: u.username, role: u.role, doctor_id: u.doctor_id })
})

staffRoutes.post('/auth/logout', (req, res) => {
  endSession(req, res, 'staff')
  res.json({ ok: true })
})

staffRoutes.get('/auth/me', staff(), (req, res) => res.json(req.user))

staffRoutes.post('/auth/password', staff(), (req, res) => {
  const u = one<any>('SELECT password_hash FROM users WHERE id = ?', req.user!.id)
  if (!verifyPassword(String(req.body?.current ?? ''), u.password_hash)) throw bad('Current password is wrong')
  const next = str(req.body?.next, 'New password', { min: 8, max: 200 })
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), req.user!.id)
  res.json({ ok: true })
})

staffRoutes.get('/stream', staff(), (req, res) => subscribe(req, res, { public: false, role: req.user!.role, doctorId: req.user!.doctor_id }))

// ---- patients ----
const withUhid = (p: any) => p && { ...p, uhid: uhid(p.id) }

staffRoutes.get('/patients', staff(), (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 60)
  const byId = /^p?0*(\d+)$/i.exec(q)
  const rows = q
    ? all(
        `SELECT * FROM patients WHERE name LIKE ? OR phone LIKE ? OR id = ? ORDER BY (phone = ?) DESC, id DESC LIMIT 30`,
        `%${q}%`, `${q.replace(/\D/g, '') || '~'}%`, byId ? Number(byId[1]) : -1, q,
      )
    : all('SELECT * FROM patients ORDER BY id DESC LIMIT 30')
  res.json(rows.map(withUhid))
})

function patientBody(b: any) {
  return {
    name: str(b?.name, 'Name', { min: 2, max: 80 }),
    phone: phone(b?.phone),
    age: b?.age === '' || b?.age == null ? null : int(b.age, 'Age', { max: 120 }),
    gender: b?.gender ? oneOf(b.gender, 'Gender', ['Male', 'Female', 'Other']) : '',
    address: optStr(b?.address, 'Address', 200),
  }
}

staffRoutes.post('/patients', staff('owner', 'reception', 'lab', 'pharmacy'), (req, res) => {
  const p = patientBody(req.body)
  const dup = p.phone && one('SELECT * FROM patients WHERE phone = ? AND lower(name) = lower(?)', p.phone, p.name)
  if (dup) return void res.json({ ...withUhid(dup), existing: true })
  const id = insert('INSERT INTO patients (name, phone, age, gender, address, created_at, day) VALUES (?, ?, ?, ?, ?, ?, ?)', p.name, p.phone, p.age, p.gender, p.address, new Date().toISOString(), today())
  emit('patient', { id })
  res.status(201).json(withUhid(one('SELECT * FROM patients WHERE id = ?', id)))
})

staffRoutes.put('/patients/:id', staff('owner', 'reception'), (req, res) => {
  const id = int(req.params.id, 'Patient', { min: 1 })
  const p = patientBody(req.body)
  if (!run('UPDATE patients SET name = ?, phone = ?, age = ?, gender = ?, address = ? WHERE id = ?', p.name, p.phone, p.age, p.gender, p.address, id).changes) throw new HttpError(404, 'Patient not found')
  res.json(withUhid(one('SELECT * FROM patients WHERE id = ?', id)))
})

staffRoutes.get('/patients/:id', staff(), (req, res) => {
  const id = int(req.params.id, 'Patient', { min: 1 })
  const p = one('SELECT * FROM patients WHERE id = ?', id)
  if (!p) throw new HttpError(404, 'Patient not found')
  const types = billTypesFor(req.user!.role)
  res.json({
    ...withUhid(p),
    visits: all('SELECT a.id, a.date, a.token, a.status, a.notes, d.name doctor FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.patient_id = ? ORDER BY a.date DESC, a.id DESC LIMIT 50', id),
    bills: types.length
      ? all(`SELECT id, bill_no, type, total, paid, status, lab_status, created_at FROM bills WHERE patient_id = ? AND type IN (${types.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 50`, id, ...types)
      : [],
  })
})

// ---- queue / appointments ----
staffRoutes.get('/queue', staff(), (req, res) => {
  const date = req.query.date ? dateStr(req.query.date) : today()
  const u = req.user!
  const mine = u.role === 'doctor' ? u.doctor_id ?? -1 : null
  const doctors = all<any>(
    `SELECT d.id, d.name, d.room, d.start_time, d.end_time, d.fee, dp.name department FROM doctors d LEFT JOIN departments dp ON dp.id = d.department_id
     WHERE d.active = 1 AND (? IS NULL OR d.id = ?) AND (instr(d.days, ?) > 0 OR EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id = d.id AND a.date = ?)) ORDER BY d.name`,
    mine, mine, weekday(date), date,
  )
  const appts = all<any>(
    `SELECT a.id, a.code, a.token, a.status, a.source, a.doctor_id, a.notes, a.called_at, p.id patient_id, p.name, p.age, p.gender, p.phone,
            EXISTS (SELECT 1 FROM bills b WHERE b.appointment_id = a.id AND b.status = 'active') billed
     FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.date = ? AND a.status != 'cancelled' ORDER BY a.token`,
    date,
  )
  res.json({ date, doctors: doctors.map((d) => ({ ...d, appointments: appts.filter((a) => a.doctor_id === d.id) })) })
})

staffRoutes.post('/appointments', staff('owner', 'reception'), (req, res) => {
  const date = dateStr(req.body?.date ?? today())
  const patientId = int(req.body?.patientId, 'Patient', { min: 1 })
  if (!one('SELECT 1 FROM patients WHERE id = ?', patientId)) throw bad('Patient not found')
  const a = book({ patientId, doctorId: int(req.body?.doctorId, 'Doctor', { min: 1 }), date, status: date === today() && req.body?.checkin ? 'waiting' : 'booked', source: 'reception', strictDay: date !== today() })
  queueChanged(a.doctor_id)
  res.status(201).json(a)
})

function canTouch(u: StaffUser, doctorId: number) {
  if (u.role === 'doctor' && u.doctor_id !== doctorId) throw new HttpError(403, "You can only manage your own patients' queue")
  if (!['owner', 'reception', 'doctor'].includes(u.role)) throw new HttpError(403, 'Your role cannot manage the queue')
}

staffRoutes.post('/appointments/:id/:action', staff(), (req, res) => {
  const action = req.params.action
  if (!isAction(action)) throw new HttpError(404, 'Unknown action')
  const a = one<{ doctor_id: number }>('SELECT doctor_id FROM appointments WHERE id = ?', int(req.params.id, 'Token', { min: 1 }))
  if (!a) throw new HttpError(404, 'Token not found')
  canTouch(req.user!, a.doctor_id)
  res.json(queueAction(Number(req.params.id), action))
})

staffRoutes.post('/queue/:doctorId/next', staff(), (req, res) => {
  const doctorId = int(req.params.doctorId, 'Doctor', { min: 1 })
  canTouch(req.user!, doctorId)
  res.json({ called: callNext(doctorId) })
})

staffRoutes.put('/appointments/:id/notes', staff('owner', 'doctor'), (req, res) => {
  const a = one<{ doctor_id: number }>('SELECT doctor_id FROM appointments WHERE id = ?', int(req.params.id, 'Token', { min: 1 }))
  if (!a) throw new HttpError(404, 'Token not found')
  canTouch(req.user!, a.doctor_id)
  run('UPDATE appointments SET notes = ? WHERE id = ?', optStr(req.body?.notes, 'Notes', 4000), req.params.id)
  res.json({ ok: true })
})

// ---- bills ----
function assertBillRole(role: Role, type: BillType) {
  if (!BILL_ROLES[type].includes(role)) throw new HttpError(403, 'Your role cannot see this bill')
}

staffRoutes.post('/bills', staff(), (req, res) => {
  res.status(201).json(createBill(req.body, req.user!))
})

staffRoutes.get('/bills', staff(), (req, res) => {
  const types = billTypesFor(req.user!.role).filter((t) => !req.query.type || t === req.query.type)
  if (!types.length) return void res.json([])
  const from = req.query.from ? dateStr(req.query.from) : today()
  const to = req.query.to ? dateStr(req.query.to) : from
  const q = String(req.query.q ?? '').trim().slice(0, 60)
  const status = String(req.query.status ?? '')
  res.json(
    all(
      `SELECT b.id, b.bill_no, b.type, b.total, b.paid, b.discount, b.status, b.lab_status, b.created_at, b.day,
              p.name patient, p.phone, d.name doctor, u.name created_by_name
       FROM bills b JOIN patients p ON p.id = b.patient_id LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users u ON u.id = b.created_by
       WHERE b.type IN (${types.map(() => '?').join(',')}) AND (? != '' OR ? != '' OR b.day BETWEEN ? AND ?)
         AND (? = '' OR p.name LIKE ? OR p.phone LIKE ? OR b.bill_no LIKE ?)
         AND (? = '' OR (? = 'due' AND b.status = 'active' AND b.paid < b.total) OR (? = 'cancelled' AND b.status = 'cancelled'))
       ORDER BY b.id DESC LIMIT 300`,
      ...types, q, status, from, to, q, `%${q}%`, `${q}%`, `%${q}%`, status, status, status,
    ),
  )
})

const billFor = (req: any) => {
  const b = getBill(int(req.params.id, 'Bill', { min: 1 }))
  assertBillRole(req.user.role, b.type)
  return b
}

staffRoutes.get('/bills/:id', staff(), (req, res) => res.json(billFor(req)))
staffRoutes.post('/bills/:id/pay', staff(), (req, res) => res.json(payDue(billFor(req).id, req.body, req.user!)))
staffRoutes.post('/bills/:id/cancel', staff('owner'), (req, res) => res.json(cancelBill(billFor(req).id, req.body, req.user!)))
staffRoutes.post('/bills/:id/whatsapp', staff(), async (req, res) => {
  const sent = await sendReceipt(billFor(req).id)
  res.json({ sent })
})
staffRoutes.post('/bills/:id/lab-status', staff('owner', 'reception', 'lab'), (req, res) => {
  res.json(setLabStatus(billFor(req).id, oneOf(req.body?.status, 'Status', LAB_STATUS)))
})

staffRoutes.get('/lab', staff('owner', 'reception', 'lab'), (_req, res) => {
  const rows = all<any>(
    `SELECT b.id, b.bill_no, b.lab_status, b.created_at, b.day, b.total, b.paid, p.name patient, p.age, p.gender, p.phone
     FROM bills b JOIN patients p ON p.id = b.patient_id
     WHERE b.type = 'lab' AND b.status = 'active' AND (b.lab_status != 'ready' OR b.day = ?) ORDER BY b.id DESC LIMIT 200`,
    today(),
  )
  const items = all<any>(`SELECT bill_id, name FROM bill_items WHERE bill_id IN (${rows.map((r) => r.id).join(',') || 0})`)
  res.json(rows.map((r) => ({ ...r, tests: items.filter((i) => i.bill_id === r.id).map((i) => i.name) })))
})

// ---- pharmacy stock-in ----
staffRoutes.post('/medicines/:id/stock', staff('owner', 'pharmacy'), (req, res) => {
  const qty = int(req.body?.qty, 'Quantity', { min: 1, max: 100000 })
  if (!run('UPDATE medicines SET stock = stock + ? WHERE id = ?', qty, int(req.params.id, 'Medicine', { min: 1 })).changes) throw new HttpError(404, 'Medicine not found')
  emit('catalog', { kind: 'medicines' })
  res.json(one('SELECT * FROM medicines WHERE id = ?', req.params.id))
})

// ---- expenses ----
staffRoutes.get('/expenses', staff('owner', 'reception'), (req, res) => {
  const from = req.query.from ? dateStr(req.query.from) : today()
  const to = req.query.to ? dateStr(req.query.to) : from
  res.json(all('SELECT e.*, u.name created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE e.day BETWEEN ? AND ? ORDER BY e.day DESC, e.id DESC LIMIT 500', from, to))
})

staffRoutes.post('/expenses', staff('owner', 'reception'), (req, res) => {
  const day = dateStr(req.body?.day ?? today())
  if (day > today()) throw bad('Expense date cannot be in the future')
  const amount = paise(req.body?.amount, 'Amount')
  if (amount <= 0) throw bad('Amount must be more than zero')
  const e = {
    category: oneOf(req.body?.category, 'Category', EXPENSE_CATEGORIES),
    description: optStr(req.body?.description, 'Description', 200),
    mode: oneOf(req.body?.mode ?? 'cash', 'Mode', [...PAY_MODES, 'bank']),
  }
  const id = insert('INSERT INTO expenses (day, category, description, amount, mode, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', day, e.category, e.description, amount, e.mode, req.user!.id, new Date().toISOString())
  emit('expense', { id, amount, category: e.category, description: e.description, by: req.user!.name, day }, { roles: ['owner', 'reception'] })
  res.status(201).json(one('SELECT * FROM expenses WHERE id = ?', id))
})

staffRoutes.delete('/expenses/:id', staff('owner'), (req, res) => {
  if (!run('DELETE FROM expenses WHERE id = ?', int(req.params.id, 'Expense', { min: 1 })).changes) throw new HttpError(404, 'Expense not found')
  emit('expense', { deleted: true }, { roles: ['owner', 'reception'] })
  res.json({ ok: true })
})
