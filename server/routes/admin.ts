import { Router } from 'express'
import { all, insert, one, run, settings } from '../db.ts'
import { emit } from '../events.ts'
import { hashPassword, staff } from '../auth.ts'
import { sendWhatsApp, waConfigured } from '../whatsapp.ts'
import { publicUrl } from '../queue.ts'
import { HttpError, addDays, bad, dateStr, int, oneOf, optStr, paise, phone, str, today } from '../util.ts'
import { CATALOG, DAYS, ROLES, SETTINGS_FIELDS, type CatalogKind, type Field, type Role } from '../../shared/catalog.ts'

export const adminRoutes = Router()

// ---- owner dashboard ----
adminRoutes.get('/dashboard', staff('owner'), (req, res) => {
  const day = req.query.date ? dateStr(req.query.date) : today()
  const from = addDays(day, -13)
  const sum = (sql: string, ...p: any[]) => one<{ v: number }>(sql, ...p)!.v ?? 0
  const series = Array.from({ length: 14 }, (_, i) => ({ day: addDays(from, i), income: 0, expense: 0, visits: 0 }))
  const at = (d: string) => series.find((s) => s.day === d)!
  for (const r of all<any>('SELECT day, SUM(amount) v FROM payments WHERE day BETWEEN ? AND ? GROUP BY day', from, day)) at(r.day).income = r.v
  for (const r of all<any>('SELECT day, SUM(amount) v FROM expenses WHERE day BETWEEN ? AND ? GROUP BY day', from, day)) at(r.day).expense = r.v
  for (const r of all<any>("SELECT date day, COUNT(*) v FROM appointments WHERE date BETWEEN ? AND ? AND status != 'cancelled' GROUP BY date", from, day)) at(r.day).visits = r.v

  const recent = [
    ...all<any>(
      `SELECT 'payment' kind, p.amount, p.mode, p.created_at, b.bill_no, b.type, pt.name patient, u.name by_name
       FROM payments p JOIN bills b ON b.id = p.bill_id JOIN patients pt ON pt.id = b.patient_id LEFT JOIN users u ON u.id = p.user_id
       WHERE p.day = ? ORDER BY p.id DESC LIMIT 15`,
      day,
    ),
    ...all<any>(
      `SELECT 'expense' kind, e.amount, e.mode, e.created_at, e.category, e.description, u.name by_name
       FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE e.day = ? ORDER BY e.id DESC LIMIT 10`,
      day,
    ),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))

  res.json({
    day,
    income: sum('SELECT SUM(amount) v FROM payments WHERE day = ?', day),
    expense: sum('SELECT SUM(amount) v FROM expenses WHERE day = ?', day),
    byType: all('SELECT b.type, SUM(p.amount) amount, COUNT(DISTINCT b.id) bills FROM payments p JOIN bills b ON b.id = p.bill_id WHERE p.day = ? GROUP BY b.type', day),
    byMode: all('SELECT mode, SUM(amount) amount FROM payments WHERE day = ? GROUP BY mode ORDER BY amount DESC', day),
    expenseByCategory: all('SELECT category, SUM(amount) amount FROM expenses WHERE day = ? GROUP BY category ORDER BY amount DESC', day),
    visits: one(
      `SELECT COUNT(*) total, COALESCE(SUM(status = 'done'), 0) done, COALESCE(SUM(status IN ('waiting','called')), 0) waiting,
              COALESCE(SUM(status = 'booked'), 0) booked, COALESCE(SUM(source IN ('web','whatsapp')), 0) online
       FROM appointments WHERE date = ? AND status != 'cancelled'`,
      day,
    ),
    newPatients: sum('SELECT COUNT(*) v FROM patients WHERE day = ?', day),
    billed: one("SELECT COUNT(*) bills, COUNT(DISTINCT patient_id) patients, COALESCE(SUM(total), 0) amount FROM bills WHERE day = ? AND status = 'active'", day),
    dues: one("SELECT COALESCE(SUM(total - paid), 0) amount, COUNT(*) bills FROM bills WHERE status = 'active' AND paid < total"),
    lab: one(
      "SELECT COALESCE(SUM(lab_status = 'pending'), 0) pending, COALESCE(SUM(lab_status = 'collected'), 0) collected, COALESCE(SUM(lab_status = 'ready'), 0) ready FROM bills WHERE type = 'lab' AND status = 'active' AND day = ?",
      day,
    ),
    doctors: all(
      `SELECT d.id, d.name,
         (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date = ? AND a.status != 'cancelled') patients,
         (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date = ? AND a.status = 'done') done,
         (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.doctor_id = d.id AND p.day = ?) income
       FROM doctors d WHERE d.active = 1 ORDER BY income DESC, patients DESC`,
      day, day, day,
    ),
    lowStock: all('SELECT id, name, stock, reorder_level FROM medicines WHERE active = 1 AND stock <= reorder_level ORDER BY stock LIMIT 8'),
    expiring: all("SELECT id, name, expiry, stock FROM medicines WHERE active = 1 AND expiry != '' AND expiry <= ? AND stock > 0 ORDER BY expiry LIMIT 8", addDays(today(), 60)),
    series,
    recent: recent.slice(0, 20),
  })
})

// ---- doctor desk (doctor sees own; owner can pick any doctor) ----
adminRoutes.get('/desk', staff('doctor', 'owner'), (req, res) => {
  const u = req.user!
  const doctorId = u.role === 'doctor' ? u.doctor_id : req.query.doctorId ? int(req.query.doctorId, 'Doctor', { min: 1 }) : one<{ id: number }>('SELECT id FROM doctors WHERE active = 1 ORDER BY id')?.id
  if (!doctorId) throw bad('This login is not linked to a doctor profile. Ask the owner to link it in Staff.')
  const day = today()
  const doctor = one('SELECT d.*, dp.name department FROM doctors d LEFT JOIN departments dp ON dp.id = d.department_id WHERE d.id = ?', doctorId)
  if (!doctor) throw new HttpError(404, 'Doctor not found')
  const appts = all<any>(
    `SELECT a.id, a.token, a.status, a.source, a.notes, a.called_at, p.id patient_id, p.name, p.age, p.gender, p.phone,
       (SELECT COUNT(*) FROM appointments x WHERE x.patient_id = p.id AND x.status = 'done' AND x.date < a.date) visits_before
     FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.doctor_id = ? AND a.date = ? AND a.status != 'cancelled' ORDER BY a.token`,
    doctorId, day,
  )
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map((d) => ({
    day: d,
    patients: one<{ n: number }>("SELECT COUNT(*) n FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'done'", doctorId, d)!.n,
  }))
  res.json({
    doctor,
    appointments: appts,
    income: one<{ v: number }>('SELECT COALESCE(SUM(p.amount), 0) v FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.doctor_id = ? AND p.day = ?', doctorId, day)!.v,
    week,
    doctors: u.role === 'owner' ? all('SELECT id, name FROM doctors WHERE active = 1 ORDER BY name') : [],
  })
})

// ---- catalogs: one schema (shared/catalog.ts) drives validation here and the forms in the UI ----
const isKind = (k: string): k is CatalogKind => k in CATALOG
const EDITORS: Record<CatalogKind, Role[]> = {
  departments: ['owner'],
  doctors: ['owner'],
  services: ['owner'],
  lab_tests: ['owner', 'lab'],
  medicines: ['owner', 'pharmacy'],
}

function value(f: Field, v: unknown) {
  if (v === undefined || v === null || v === '') {
    if (f.required) throw bad(`${f.label} is required`)
    return f.type === 'money' || f.type === 'int' ? 0 : f.type === 'select' && f.options === 'departments' ? null : ''
  }
  switch (f.type) {
    case 'money':
      return paise(v, f.label)
    case 'int':
      return int(v, f.label, { max: 1_000_000 })
    case 'date':
      return dateStr(v, f.label)
    case 'time':
      if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${f.label} must be HH:MM`)
      return v
    case 'days': {
      const list = String(v).split(',').filter((d) => DAYS.includes(d))
      if (!list.length) throw bad('Pick at least one OPD day')
      return DAYS.filter((d) => list.includes(d)).join(',')
    }
    case 'select':
      if (f.options === 'departments') {
        const id = int(v, f.label, { min: 1 })
        if (!one('SELECT 1 FROM departments WHERE id = ?', id)) throw bad('Department not found')
        return id
      }
      return oneOf(v, f.label, f.options as string[])
    default:
      return f.required ? str(v, f.label, { max: f.max ?? 120 }) : optStr(v, f.label, f.max ?? 120)
  }
}

adminRoutes.get('/catalog/:kind', staff(), (req, res) => {
  const kind = String(req.params.kind)
  if (!isKind(kind)) throw new HttpError(404, 'Unknown catalog')
  const showAll = req.query.all === '1' && EDITORS[kind].includes(req.user!.role)
  res.json(all(`SELECT * FROM ${kind} ${showAll ? '' : 'WHERE active = 1'} ORDER BY active DESC, name`))
})

function saveCatalog(kind: string, role: Role, body: any, id?: number) {
  if (!isKind(kind)) throw new HttpError(404, 'Unknown catalog')
  if (!EDITORS[kind].includes(role)) throw new HttpError(403, 'Your role cannot edit this list')
  const fields = CATALOG[kind].fields
  const values = fields.map((f) => value(f, body?.[f.key]))
  const active = body?.active === false || body?.active === 0 ? 0 : 1
  if (id) {
    const sets = fields.map((f) => `${f.key} = ?`).join(', ')
    if (!run(`UPDATE ${kind} SET ${sets}, active = ? WHERE id = ?`, ...values, active, id).changes) throw new HttpError(404, 'Not found')
  } else id = insert(`INSERT INTO ${kind} (${fields.map((f) => f.key).join(', ')}, active) VALUES (${fields.map(() => '?').join(', ')}, ?)`, ...values, active)
  emit('catalog', { kind })
  return one(`SELECT * FROM ${kind} WHERE id = ?`, id)
}

adminRoutes.post('/catalog/:kind', staff(), (req, res) => res.status(201).json(saveCatalog(String(req.params.kind), req.user!.role, req.body)))
adminRoutes.put('/catalog/:kind/:id', staff(), (req, res) => res.json(saveCatalog(String(req.params.kind), req.user!.role, req.body, int(req.params.id, 'Id', { min: 1 }))))

// ---- staff accounts ----
adminRoutes.get('/users', staff('owner'), (_req, res) => {
  res.json(all('SELECT u.id, u.name, u.username, u.role, u.doctor_id, u.active, u.created_at, d.name doctor FROM users u LEFT JOIN doctors d ON d.id = u.doctor_id ORDER BY u.active DESC, u.role, u.name'))
})

function userBody(b: any) {
  const role = oneOf(b?.role, 'Role', ROLES)
  const doctorId = b?.doctorId ? int(b.doctorId, 'Doctor', { min: 1 }) : null
  if (role === 'doctor' && !doctorId) throw bad('Link the doctor login to a doctor profile')
  if (doctorId && !one('SELECT 1 FROM doctors WHERE id = ?', doctorId)) throw bad('Doctor not found')
  return { name: str(b?.name, 'Name', { min: 2, max: 80 }), role, doctorId }
}

adminRoutes.post('/users', staff('owner'), (req, res) => {
  const u = userBody(req.body)
  const username = str(req.body?.username, 'Username', { min: 3, max: 40 }).toLowerCase()
  if (!/^[a-z0-9._-]+$/.test(username)) throw bad('Username: letters, numbers, dot, dash only')
  if (one('SELECT 1 FROM users WHERE username = ?', username)) throw bad('Username already taken')
  const pw = str(req.body?.password, 'Password', { min: 8, max: 200 })
  const id = insert('INSERT INTO users (name, username, password_hash, role, doctor_id) VALUES (?, ?, ?, ?, ?)', u.name, username, hashPassword(pw), u.role, u.doctorId)
  res.status(201).json({ id })
})

adminRoutes.put('/users/:id', staff('owner'), (req, res) => {
  const id = int(req.params.id, 'User', { min: 1 })
  const u = userBody(req.body)
  const active = req.body?.active === false ? 0 : 1
  if (id === req.user!.id && (u.role !== 'owner' || !active)) throw bad("You can't remove your own owner access")
  if (!run('UPDATE users SET name = ?, role = ?, doctor_id = ?, active = ? WHERE id = ?', u.name, u.role, u.doctorId, active, id).changes) throw new HttpError(404, 'User not found')
  if (req.body?.password) {
    run('UPDATE users SET password_hash = ?, failed = 0, locked_until = 0 WHERE id = ?', hashPassword(str(req.body.password, 'Password', { min: 8, max: 200 })), id)
  }
  if (!active || req.body?.password) run('DELETE FROM sessions WHERE user_id = ?', id) // force re-login
  res.json({ ok: true })
})

// ---- settings & WhatsApp ----
adminRoutes.get('/settings', staff(), (_req, res) => res.json({ settings: settings(), waConfigured: waConfigured(), publicUrl: publicUrl() }))

adminRoutes.put('/settings', staff('owner'), (req, res) => {
  for (const f of SETTINGS_FIELDS) {
    if (req.body?.[f.key] === undefined) continue
    const v = f.key === 'name' ? str(req.body[f.key], f.label, { max: 120 }) : optStr(req.body[f.key], f.label, f.key === 'about' ? 600 : 200)
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', f.key, v)
  }
  emit('catalog', { kind: 'settings' })
  res.json(settings())
})

adminRoutes.get('/whatsapp/messages', staff('owner'), (_req, res) => {
  res.json(all('SELECT * FROM wa_messages ORDER BY id DESC LIMIT 150'))
})

adminRoutes.post('/whatsapp/test', staff('owner'), async (req, res) => {
  const sent = await sendWhatsApp(phone(req.body?.phone, true), str(req.body?.text, 'Message', { max: 1000 }))
  res.json({ sent, configured: waConfigured() })
})
