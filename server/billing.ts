import { all, insert, nextCounter, one, run, settings, tx } from './db.ts'
import { emit } from './events.ts'
import { book, getDoctor, queueChanged } from './queue.ts'
import { sendWhatsApp } from './whatsapp.ts'
import { HttpError, bad, int, oneOf, paise, rupees, str, today, uhid } from './util.ts'
import type { StaffUser } from './auth.ts'
import { BILL_LABEL, BILL_ROLES, BILL_TYPES, PAY_MODES, type BillType } from '../shared/catalog.ts'

const PREFIX: Record<BillType, string> = { opd: 'OPD', lab: 'LAB', pharmacy: 'PHM' }
const KIND_FOR: Record<BillType, string> = { opd: 'service', lab: 'test', pharmacy: 'medicine' }
const TABLE: Record<string, string> = { service: 'services', test: 'lab_tests', medicine: 'medicines' }

type Line = { kind: string; ref_id: number | null; name: string; qty: number; rate: number; amount: number }

/**
 * Body: { type, patientId, doctorId?, appointmentId?, consult?, token?, items:[{kind, refId?, name?, qty, rate?}],
 *         discount, paid, mode } — money in rupees. Catalog prices always come from the DB, never the client.
 */
export function createBill(body: any, user: StaffUser) {
  const type = oneOf(body.type, 'Bill type', BILL_TYPES)
  if (!BILL_ROLES[type].includes(user.role)) throw new HttpError(403, `Your role cannot create ${BILL_LABEL[type]} bills`)
  const patientId = int(body.patientId, 'Patient', { min: 1 })
  if (!one('SELECT 1 FROM patients WHERE id = ?', patientId)) throw bad('Patient not found')
  const mode = oneOf(body.mode ?? 'cash', 'Payment mode', PAY_MODES)
  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length > 100) throw bad('Too many items')

  const created = tx(() => {
    const lines: Line[] = []
    let doctorId: number | null = null
    let appointmentId: number | null = null
    let token: number | null = null

    if (type === 'opd' && body.doctorId) {
      const d = getDoctor(int(body.doctorId, 'Doctor', { min: 1 }))
      doctorId = d.id
      if (body.consult !== false) lines.push({ kind: 'consult', ref_id: d.id, name: `Consultation — ${d.name}`, qty: 1, rate: d.fee, amount: d.fee })
      if (body.appointmentId) {
        const a = one<{ id: number; patient_id: number; doctor_id: number; status: string; token: number }>('SELECT * FROM appointments WHERE id = ?', int(body.appointmentId, 'Appointment', { min: 1 }))
        if (!a || a.patient_id !== patientId || a.doctor_id !== d.id) throw bad('Appointment does not match this patient and doctor')
        if (a.status === 'booked') run("UPDATE appointments SET status = 'waiting' WHERE id = ?", a.id)
        appointmentId = a.id
        token = a.token
      } else if (body.token !== false) {
        const a = book({ patientId, doctorId: d.id, date: today(), status: 'waiting', source: 'reception' })
        appointmentId = a.id
        token = a.token
      }
    }

    for (const it of rawItems) {
      const qty = int(it?.qty ?? 1, 'Quantity', { min: 1, max: 1000 })
      if (it?.kind === 'custom') {
        const rate = paise(it.rate, 'Rate')
        lines.push({ kind: 'custom', ref_id: null, name: str(it.name, 'Item name', { max: 120 }), qty, rate, amount: rate * qty })
        continue
      }
      const kind = KIND_FOR[type]
      if (it?.kind !== kind) throw bad(`Only ${kind} items can go on a ${BILL_LABEL[type]} bill`)
      const ref = one<{ id: number; name: string; price: number; stock?: number }>(`SELECT * FROM ${TABLE[kind]} WHERE id = ? AND active = 1`, int(it.refId, 'Item', { min: 1 }))
      if (!ref) throw bad('Item not found or inactive')
      if (kind === 'medicine' && run('UPDATE medicines SET stock = stock - ? WHERE id = ? AND stock >= ?', qty, ref.id, qty).changes !== 1)
        throw bad(`Only ${ref.stock} units of ${ref.name} in stock`)
      lines.push({ kind, ref_id: ref.id, name: ref.name, qty, rate: ref.price, amount: ref.price * qty })
    }
    if (!lines.length) throw bad('Add at least one item')

    const subtotal = lines.reduce((s, l) => s + l.amount, 0)
    const discount = paise(body.discount ?? 0, 'Discount')
    if (discount > subtotal) throw bad('Discount cannot be more than the bill')
    const total = subtotal - discount
    const paid = body.paid == null ? total : paise(body.paid, 'Paid amount')
    if (paid > total) throw bad('Paid amount cannot be more than the total')

    const now = new Date().toISOString()
    const billNo = `${PREFIX[type]}-${String(nextCounter('bill_' + type)).padStart(5, '0')}`
    const id = insert(
      `INSERT INTO bills (bill_no, type, patient_id, doctor_id, appointment_id, subtotal, discount, total, paid, lab_status, created_by, created_at, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      billNo, type, patientId, doctorId, appointmentId, subtotal, discount, total, paid, type === 'lab' ? 'pending' : null, user.id, now, today(),
    )
    for (const l of lines) insert('INSERT INTO bill_items (bill_id, kind, ref_id, name, qty, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)', id, l.kind, l.ref_id, l.name, l.qty, l.rate, l.amount)
    if (paid > 0) insert('INSERT INTO payments (bill_id, amount, mode, user_id, created_at, day) VALUES (?, ?, ?, ?, ?, ?)', id, paid, mode, user.id, now, today())
    return { id, billNo, total, paid, doctorId, token }
  })

  if (created.token) queueChanged(created.doctorId!)
  broadcast(created.id, created.paid, mode, user)
  return getBill(created.id)
}

export function payDue(billId: number, body: any, user: StaffUser) {
  const b = getBill(billId)
  if (b.status !== 'active') throw bad('Bill is cancelled')
  const due = b.total - b.paid
  const amount = paise(body.amount, 'Amount')
  if (amount <= 0 || amount > due) throw bad(`Amount must be between ₹0.01 and ${rupees(due)}`)
  const mode = oneOf(body.mode ?? 'cash', 'Payment mode', PAY_MODES)
  tx(() => {
    run('UPDATE bills SET paid = paid + ? WHERE id = ?', amount, billId)
    insert('INSERT INTO payments (bill_id, amount, mode, user_id, created_at, day) VALUES (?, ?, ?, ?, ?, ?)', billId, amount, mode, user.id, new Date().toISOString(), today())
  })
  broadcast(billId, amount, mode, user)
  return getBill(billId)
}

export function cancelBill(billId: number, body: any, user: StaffUser) {
  const b = getBill(billId)
  if (b.status !== 'active') throw bad('Bill is already cancelled')
  const reason = str(body.reason, 'Reason', { min: 3, max: 200 })
  tx(() => {
    run("UPDATE bills SET status = 'cancelled', cancel_reason = ? WHERE id = ?", reason, billId)
    if (b.paid > 0) insert("INSERT INTO payments (bill_id, amount, mode, user_id, created_at, day) VALUES (?, ?, 'refund', ?, ?, ?)", billId, -b.paid, user.id, new Date().toISOString(), today())
    for (const it of b.items) if (it.kind === 'medicine') run('UPDATE medicines SET stock = stock + ? WHERE id = ?', it.qty, it.ref_id)
  })
  broadcast(billId, -b.paid, 'refund', user)
  return getBill(billId)
}

function broadcast(billId: number, amount: number, mode: string, user: StaffUser) {
  const b = getBill(billId)
  emit('bill', { id: b.id, type: b.type, doctorId: b.doctor_id })
  if (amount)
    emit(
      'payment',
      { amount, mode, billNo: b.bill_no, type: b.type, patient: b.patient.name, by: user.name, at: new Date().toISOString() },
      { roles: ['owner', 'reception'] },
    )
}

export function getBill(id: number) {
  const b = one<any>(
    `SELECT b.*, d.name doctor, u.name created_by_name FROM bills b
     LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN users u ON u.id = b.created_by WHERE b.id = ?`,
    id,
  )
  if (!b) throw new HttpError(404, 'Bill not found')
  const p = one<any>('SELECT id, name, phone, age, gender FROM patients WHERE id = ?', b.patient_id)!
  const token = b.appointment_id ? one<{ token: number; code: string }>('SELECT token, code FROM appointments WHERE id = ?', b.appointment_id) : null
  return {
    ...b,
    patient: { ...p, uhid: uhid(p.id) },
    token: token?.token ?? null,
    trackCode: token?.code ?? null,
    items: all<Line & { id: number }>('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', id),
    payments: all('SELECT p.amount, p.mode, p.created_at, u.name by_name FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE bill_id = ? ORDER BY p.id', id),
  }
}

export function receiptText(b: ReturnType<typeof getBill>) {
  const h = settings()
  const lines = b.items.map((i: Line) => `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''} — ${rupees(i.amount)}`).join('\n')
  const due = b.total - b.paid
  return (
    `🧾 ${h.name} — ${BILL_LABEL[b.type as BillType]} receipt ${b.bill_no}\n${b.patient.name} (${b.patient.uhid})\n\n${lines}\n` +
    (b.discount ? `Discount: −${rupees(b.discount)}\n` : '') +
    `Total: ${rupees(b.total)} · Paid: ${rupees(b.paid)}${due > 0 ? ` · Due: ${rupees(due)}` : ''}` +
    (b.token ? `\nToken #${b.token}` : '') +
    `\n\nThank you. Get well soon! 🙏`
  )
}

export async function sendReceipt(id: number) {
  const b = getBill(id)
  if (!b.patient.phone) throw bad('Patient has no mobile number')
  return sendWhatsApp(b.patient.phone, receiptText(b))
}

export function setLabStatus(id: number, status: string) {
  const b = getBill(id)
  if (b.type !== 'lab') throw bad('Not a lab bill')
  run('UPDATE bills SET lab_status = ? WHERE id = ?', status, id)
  emit('bill', { id, type: 'lab' })
  if (status === 'ready' && b.patient.phone) {
    const h = settings()
    void sendWhatsApp(b.patient.phone, `🧪 ${b.patient.name.split(' ')[0]}, your lab report (${b.bill_no}) is ready. Please collect it from ${h.name} lab counter. 🙏`)
  }
  return getBill(id)
}
