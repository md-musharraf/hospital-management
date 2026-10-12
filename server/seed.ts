import { randomBytes } from 'node:crypto'
import { all, insert, nextCounter, one, run, tx } from './db.ts'
import { hashPassword } from './auth.ts'
import { addDays, today, weekday } from './util.ts'

const SETTINGS: Record<string, string> = {
  name: 'CarePoint Hospital',
  short: 'CP',
  tagline: 'Multispeciality care, close to home',
  about: 'A 24×7 multispeciality hospital with in-house lab, pharmacy and emergency care — and an OPD that respects your time with live token tracking and WhatsApp updates.',
  phone: '+91 90000 12345',
  emergency: '+91 90000 11111',
  whatsapp: '+91 90000 12345',
  email: 'care@carepoint.example',
  address: 'Main Road, Near Bus Stand, Your City — 800001',
  hours: 'OPD: Mon–Sat, 9:00 AM – 7:00 PM · Emergency: 24×7',
  map_url: '',
  gstin: '',
}

export function seed(opts: { demo: boolean; password?: string; ownerPassword?: string }) {
  for (const [k, v] of Object.entries(SETTINGS)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v)
  if (one('SELECT 1 FROM users LIMIT 1')) return
  if (!opts.demo) {
    if (!opts.ownerPassword || opts.ownerPassword.length < 8) throw new Error('First run: set OWNER_PASSWORD (8+ chars) in .env to create the "owner" account.')
    insert("INSERT INTO users (name, username, password_hash, role) VALUES ('Owner', 'owner', ?, 'owner')", hashPassword(opts.ownerPassword))
    return
  }
  tx(() => demo(opts.password!))
}

// Deterministic PRNG so the demo looks the same on every machine.
let s = 42
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296), s / 4294967296)
const pickOne = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const at = (day: string, h: number, m: number) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).toISOString()

function demo(password: string) {
  const dept = (name: string, icon: string, description: string) => insert('INSERT INTO departments (name, icon, description) VALUES (?, ?, ?)', name, icon, description)
  const D = {
    med: dept('General Medicine', 'stethoscope', 'Fever, infections, diabetes, BP and everyday health concerns.'),
    gyn: dept('Gynaecology & Obstetrics', 'sparkles', "Pregnancy care, normal & C-section delivery, women's health."),
    ped: dept('Paediatrics', 'baby', 'Newborn care, vaccination and child health up to 16 years.'),
    ort: dept('Orthopaedics', 'bone', 'Fractures, joint pain, sports injuries and spine care.'),
    car: dept('Cardiology', 'heart', 'ECG, echo, heart checkups and BP management.'),
    ent: dept('ENT', 'ear', 'Ear, nose and throat problems, hearing and sinus care.'),
    eye: dept('Ophthalmology', 'eye', 'Eye checkups, cataract evaluation and vision care.'),
    er: dept('Emergency & Trauma', 'siren', 'Round-the-clock casualty, trauma and critical care.'),
  }
  const ALL = 'Mon,Tue,Wed,Thu,Fri,Sat'
  const doc = (name: string, d: number, q: string, fee: number, room: string, days: string, st: string, en: string, bio: string) =>
    insert('INSERT INTO doctors (name, department_id, qualification, fee, room, days, start_time, end_time, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', name, d, q, fee * 100, room, days, st, en, bio)
  const docs = [
    doc('Dr. Arvind Mehta', D.med, 'MBBS, MD (Medicine)', 400, '101', ALL, '09:00', '14:00', '18 years in internal medicine; diabetes & hypertension clinic.'),
    doc('Dr. Neha Kapoor', D.gyn, 'MBBS, MS (OBG)', 500, '104', ALL, '10:00', '15:00', 'High-risk pregnancy and laparoscopic gynae surgery.'),
    doc('Dr. Rohan Verma', D.ped, 'MBBS, MD (Paediatrics)', 450, '102', ALL, '10:00', '14:00', 'Newborn care, growth & vaccination clinic.'),
    doc('Dr. Sameer Khan', D.ort, 'MBBS, MS (Ortho)', 600, '201', 'Mon,Wed,Fri,Sat', '11:00', '16:00', 'Trauma, joint replacement and sports injuries.'),
    doc('Dr. Priya Nair', D.car, 'MBBS, MD, DM (Cardiology)', 800, '202', 'Tue,Thu,Sat', '10:00', '13:00', 'Preventive cardiology, echo and heart failure clinic.'),
    doc('Dr. Vikram Singh', D.ent, 'MBBS, MS (ENT)', 500, '103', 'Mon,Tue,Thu,Fri', '16:00', '19:00', 'Sinus, tonsils, hearing and voice disorders.'),
    doc('Dr. Kavita Rao', D.eye, 'MBBS, MS (Ophthalmology)', 500, '105', 'Mon,Wed,Fri', '10:00', '14:00', 'Cataract, glaucoma and paediatric eye care.'),
    doc('Dr. Anil Das', D.er, 'MBBS, Emergency Medicine', 300, 'ER', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', '00:00', '23:59', 'Casualty medical officer — 24×7 emergency.'),
  ]

  const services = [['Dressing', 150], ['Injection', 50], ['ECG', 300], ['Nebulization', 100], ['Suturing', 400], ['BP & sugar check', 50], ['X-Ray chest', 400], ['Ultrasound abdomen', 900]] as const
  for (const [n, p] of services) insert('INSERT INTO services (name, price) VALUES (?, ?)', n, p * 100)
  const tests = [
    ['Complete Blood Count (CBC)', 'Haematology', 300, 'Same day'], ['Blood Sugar Fasting', 'Biochemistry', 60, '2 hrs'], ['Blood Sugar PP', 'Biochemistry', 60, '2 hrs'],
    ['HbA1c', 'Biochemistry', 450, 'Same day'], ['Lipid Profile', 'Biochemistry', 600, 'Same day'], ['Liver Function Test (LFT)', 'Biochemistry', 650, 'Same day'],
    ['Kidney Function Test (KFT)', 'Biochemistry', 600, 'Same day'], ['Thyroid Profile (T3 T4 TSH)', 'Hormones', 550, '24 hrs'], ['Urine Routine', 'Clinical pathology', 150, '2 hrs'],
    ['Dengue NS1 Antigen', 'Serology', 600, 'Same day'], ['Malaria Antigen', 'Serology', 300, '2 hrs'], ['CRP', 'Serology', 400, 'Same day'],
    ['Vitamin D (25-OH)', 'Hormones', 1200, '24 hrs'], ['Widal Test', 'Serology', 200, 'Same day'],
  ] as const
  for (const [n, c, p, t] of tests) insert('INSERT INTO lab_tests (name, category, price, tat) VALUES (?, ?, ?, ?)', n, c, p * 100, t)
  const T = today()
  const meds = [
    ['Paracetamol 500mg tab', 2, 800, 400], ['Amoxicillin 500mg cap', 8, 300, 420], ['Azithromycin 500mg tab', 22, 120, 300], ['Pantoprazole 40mg tab', 6, 400, 500],
    ['Cetirizine 10mg tab', 2, 500, 380], ['Metformin 500mg tab', 3, 600, 600], ['Amlodipine 5mg tab', 4, 350, 540], ['ORS sachet', 20, 150, 45],
    ['Ondansetron 4mg tab', 5, 8, 250], ['Diclofenac gel 30g', 95, 40, 700], ['Cough syrup 100ml', 110, 60, 30], ['Vitamin D3 60K cap', 30, 6, 365],
    ['Ringer Lactate 500ml', 45, 90, 480], ['Syringe 5ml', 8, 400, 900],
  ] as const
  meds.forEach(([n, p, st, exp], i) =>
    insert('INSERT INTO medicines (name, batch, expiry, price, stock, reorder_level) VALUES (?, ?, ?, ?, ?, ?)', n, `B${2400 + i * 7}`, addDays(T, exp), p * 100, st, 20),
  )

  const user = (name: string, username: string, role: string, doctorId: number | null = null) =>
    insert('INSERT INTO users (name, username, password_hash, role, doctor_id) VALUES (?, ?, ?, ?, ?)', name, username, hashPassword(password), role, doctorId)
  const owner = user('Hospital Owner', 'owner', 'owner')
  const reception = user('Pooja Sharma', 'reception', 'reception')
  user('Dr. Arvind Mehta', 'doctor', 'doctor', docs[0])
  const lab = user('Ravi (Lab)', 'lab', 'lab')
  const pharmacy = user('Sunil (Pharmacy)', 'pharmacy', 'pharmacy')

  // ---- 14 days of history + a live-looking today ----
  const first = ['Aarav', 'Priya', 'Rahul', 'Anjali', 'Vikash', 'Sunita', 'Amit', 'Kiran', 'Deepak', 'Pooja', 'Suresh', 'Meena', 'Rakesh', 'Neha', 'Manoj', 'Rekha', 'Sanjay', 'Asha', 'Ajay', 'Geeta', 'Imran', 'Fatima', 'Gurpreet', 'Lakshmi']
  const last = ['Kumar', 'Singh', 'Sharma', 'Devi', 'Yadav', 'Gupta', 'Mahto', 'Soren', 'Khan', 'Verma', 'Mishra', 'Prasad', 'Hembrom', 'Ansari']
  const patients: number[] = []
  const newPatient = (day: string) => {
    const g = rnd() < 0.5 ? 'Male' : 'Female'
    const id = insert(
      'INSERT INTO patients (name, phone, age, gender, address, created_at, day) VALUES (?, ?, ?, ?, ?, ?, ?)',
      `${pickOne(first)} ${pickOne(last)}`, `90000${String(patients.length + 1).padStart(5, '0')}`, between(2, 78), g, '', at(day, 9, 0), day,
    )
    patients.push(id)
    return id
  }
  const medRows = all<{ id: number; name: string; price: number }>('SELECT id, name, price FROM medicines')
  const testRows = all<{ id: number; name: string; price: number }>('SELECT id, name, price FROM lab_tests')
  const docRows = all<{ id: number; name: string; fee: number; days: string }>('SELECT id, name, fee, days FROM doctors')
  const modes = ['cash', 'cash', 'cash', 'upi', 'upi', 'card']
  const PRE = { opd: 'OPD', lab: 'LAB', pharmacy: 'PHM' } as const

  const bill = (type: 'opd' | 'lab' | 'pharmacy', patientId: number, day: string, when: string, items: { kind: string; ref: number; name: string; qty: number; rate: number }[], o: { doctorId?: number; appt?: number; by: number; full?: boolean; labStatus?: string }) => {
    const sub = items.reduce((t, i) => t + i.qty * i.rate, 0)
    const discount = rnd() < 0.1 ? Math.round(sub * 0.1) : 0
    const total = sub - discount
    const paid = o.full === false ? Math.round(total / 2) : total
    const id = insert(
      'INSERT INTO bills (bill_no, type, patient_id, doctor_id, appointment_id, subtotal, discount, total, paid, lab_status, created_by, created_at, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      `${PRE[type]}-${String(nextCounter('bill_' + type)).padStart(5, '0')}`, type, patientId, o.doctorId ?? null, o.appt ?? null, sub, discount, total, paid, type === 'lab' ? o.labStatus ?? 'ready' : null, o.by, when, day,
    )
    for (const i of items) insert('INSERT INTO bill_items (bill_id, kind, ref_id, name, qty, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)', id, i.kind, i.ref, i.name, i.qty, i.rate, i.qty * i.rate)
    if (paid) insert('INSERT INTO payments (bill_id, amount, mode, user_id, created_at, day) VALUES (?, ?, ?, ?, ?, ?)', id, paid, pickOne(modes), o.by, when, day)
  }
  const extras = (patientId: number, day: string, h: number, labStatus?: string) => {
    if (rnd() < 0.35) {
      const picked = [...new Set([pickOne(testRows), pickOne(testRows), pickOne(testRows)].slice(0, between(1, 3)))]
      bill('lab', patientId, day, at(day, h, between(10, 50)), picked.map((t) => ({ kind: 'test', ref: t.id, name: t.name, qty: 1, rate: t.price })), { by: rnd() < 0.5 ? lab : reception, labStatus })
    }
    if (rnd() < 0.45) {
      const picked = [...new Set([pickOne(medRows), pickOne(medRows), pickOne(medRows), pickOne(medRows)].slice(0, between(1, 4)))]
      bill('pharmacy', patientId, day, at(day, h, between(20, 58)), picked.map((m) => ({ kind: 'medicine', ref: m.id, name: m.name, qty: m.price > 5000 ? 1 : between(5, 15), rate: m.price })), { by: pharmacy })
    }
  }
  const visit = (day: string, status: string, source = 'reception') => {
    const opd = docRows.filter((x) => x.days.includes(weekday(day)) && x.id !== docs[7])
    const d = pickOne(opd.length ? opd : docRows.filter((x) => x.id === docs[7])) // Sunday: emergency only
    const p = rnd() < 0.45 || patients.length < 10 ? newPatient(day) : pickOne(patients)
    if (one("SELECT 1 FROM appointments WHERE patient_id = ? AND doctor_id = ? AND date = ? AND status != 'cancelled'", p, d.id, day)) return null
    const token = (one<{ m: number }>('SELECT COALESCE(MAX(token), 0) m FROM appointments WHERE doctor_id = ? AND date = ?', d.id, day)!.m ?? 0) + 1
    const h = Math.min(18, 9 + Math.floor(token / 2))
    const appt = insert(
      'INSERT INTO appointments (code, patient_id, doctor_id, date, token, status, source, created_at, called_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      randomBytes(6).toString('base64url'), p, d.id, day, token, status, source, at(day, h, between(0, 30)), status === 'done' || status === 'called' ? at(day, h, 40) : null, status === 'done' ? at(day, h, 50) : null,
    )
    return { appt, p, d, h }
  }

  const cats: [string, number, number][] = [['Medical supplies', 1500, 6000], ['Electricity & water', 2000, 5000], ['Housekeeping', 500, 1500], ['Maintenance', 800, 4000], ['Pharmacy purchase', 5000, 15000], ['Lab reagents', 2000, 7000]]
  for (let back = 13; back >= 0; back--) {
    const day = addDays(T, -back)
    const n = back === 0 ? 9 : between(10, 22)
    for (let i = 0; i < n; i++) {
      if (back > 0) {
        const v = visit(day, 'done')
        if (!v) continue
        bill('opd', v.p, day, at(day, v.h, 35), [{ kind: 'consult', ref: v.d.id, name: `Consultation — ${v.d.name}`, qty: 1, rate: v.d.fee }], { doctorId: v.d.id, appt: v.appt, by: reception, full: rnd() > 0.06 })
        extras(v.p, day, v.h)
      } else {
        // today: a few done, one with the doctor, some waiting, some booked online and not yet arrived
        const status = i < 3 ? 'done' : i < 4 ? 'called' : i < 7 ? 'waiting' : 'booked'
        const v = visit(day, status, status === 'booked' ? pickOne(['web', 'whatsapp']) : 'reception')
        if (!v || status === 'booked') continue
        bill('opd', v.p, day, at(day, 9, 10 + i * 4), [{ kind: 'consult', ref: v.d.id, name: `Consultation — ${v.d.name}`, qty: 1, rate: v.d.fee }], { doctorId: v.d.id, appt: v.appt, by: reception })
        if (status === 'done') extras(v.p, day, 10, pickOne(['pending', 'collected']))
      }
    }
    for (let e = 0, m = back === 0 ? 1 : between(1, 3); e < m; e++) {
      const [c, lo, hi] = pickOne(cats)
      insert('INSERT INTO expenses (day, category, description, amount, mode, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', day, c, '', between(lo, hi) * 100, pickOne(['cash', 'upi', 'bank']), owner, at(day, 17, between(0, 59)))
    }
    if (back === 7) insert("INSERT INTO expenses (day, category, description, amount, mode, created_by, created_at) VALUES (?, 'Salary', 'Nursing & support staff (part)', ?, 'bank', ?, ?)", day, 4500000, owner, at(day, 11, 0))
  }
  // Fixed demo patient for trying the patient portal (OTP shows on screen in dev).
  run("UPDATE patients SET phone = '9000000001' WHERE id = (SELECT patient_id FROM appointments WHERE date = ? ORDER BY id DESC LIMIT 1)", T)
}
