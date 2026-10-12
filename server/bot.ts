import { all, one, run, settings, tx } from './db.ts'
import { emit } from './events.ts'
import { availableDates, book, bookingMessage, findOrCreatePatient, getDoctor, queueChanged, trackInfo, trackUrl } from './queue.ts'
import { sendWhatsApp } from './whatsapp.ts'
import { HttpError, prettyDay, today } from './util.ts'

// One booking bot for both the website chat and WhatsApp. State lives in bot_sessions.
type State = {
  step: 'menu' | 'dept' | 'doctor' | 'date' | 'name' | 'phone' | 'age' | 'gender' | 'confirm' | 'track'
  deptId?: number
  doctorId?: number
  date?: string
  name?: string
  phone?: string
  age?: number | null
  gender?: string
  options?: string[]
  values?: (string | number)[]
}
export type BotMsg = { text: string; options?: string[] }
type Channel = 'web' | 'whatsapp'

const MENU = ['Book appointment', 'Track my token', 'Timings & address', 'Emergency']
const RESET = /^(hi|hii|hello|hey|menu|start|restart|0|namaste|home)$/i

function load(sid: string): State {
  const r = one<{ state: string }>('SELECT state FROM bot_sessions WHERE sid = ?', sid)
  return r ? JSON.parse(r.state) : { step: 'menu' }
}
function save(sid: string, s: State) {
  run(
    'INSERT INTO bot_sessions (sid, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at',
    sid, JSON.stringify(s), Date.now(),
  )
}

/** Matches "2", "2.", or (part of) an option label. */
function pick(s: State, text: string): number {
  const opts = s.options ?? []
  const n = parseInt(text, 10)
  if (String(n) === text.replace(/\.$/, '') && n >= 1 && n <= opts.length) return n - 1
  const t = text.toLowerCase()
  const exact = opts.findIndex((o) => o.toLowerCase() === t)
  if (exact >= 0) return exact
  return t.length >= 3 ? opts.findIndex((o) => o.toLowerCase().includes(t)) : -1
}

function ask(s: State, text: string, options: string[], values?: (string | number)[]): BotMsg {
  s.options = options
  s.values = values ?? options
  return { text, options }
}

function menu(s: State, hello = false): BotMsg {
  const h = settings()
  Object.assign(s, { step: 'menu', deptId: undefined, doctorId: undefined, date: undefined })
  return ask(s, hello ? `Namaste 🙏 Welcome to ${h.name}. I can book your OPD token in under a minute. What would you like to do?` : 'Anything else I can help with?', MENU)
}

function askDept(s: State): BotMsg {
  const depts = all<{ id: number; name: string }>(
    'SELECT DISTINCT dp.id, dp.name FROM departments dp JOIN doctors d ON d.department_id = dp.id AND d.active = 1 WHERE dp.active = 1 ORDER BY dp.name',
  )
  s.step = 'dept'
  return ask(s, 'Which department do you need?', depts.map((d) => d.name), depts.map((d) => d.id))
}

function askDoctor(s: State): BotMsg {
  const docs = all<{ id: number; name: string; fee: number; days: string }>('SELECT id, name, fee, days FROM doctors WHERE department_id = ? AND active = 1 ORDER BY name', s.deptId)
  s.step = 'doctor'
  return ask(s, 'Choose your doctor:', docs.map((d) => `${d.name} · ₹${d.fee / 100}`), docs.map((d) => d.id))
}

function askDate(s: State): BotMsg {
  const dates = availableDates(getDoctor(s.doctorId!))
  if (!dates.length) {
    s.step = 'doctor'
    return { text: 'This doctor has no OPD in the next 3 weeks. Please choose another doctor.', options: s.options }
  }
  s.step = 'date'
  return ask(s, 'Which day suits you?', dates.map((d) => (d === today() ? `Today, ${prettyDay(d).slice(5)}` : prettyDay(d))), dates)
}

function summary(s: State): BotMsg {
  const d = getDoctor(s.doctorId!)
  s.step = 'confirm'
  return ask(
    s,
    `Please confirm:\n👤 ${s.name}${s.age != null ? `, ${s.age}y` : ''}${s.gender ? `, ${s.gender}` : ''}\n📞 ${s.phone}\n🩺 ${d.name} (₹${d.fee / 100}, pay at reception)\n📅 ${prettyDay(s.date!)}, OPD from ${d.start_time}`,
    ['Confirm booking', 'Start over'],
  )
}

function trackReply(phone: string): BotMsg[] {
  const appts = all<{ code: string }>(
    `SELECT a.code FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE p.phone = ? AND a.date >= ? AND a.status IN ('booked','waiting','called') ORDER BY a.date, a.token LIMIT 5`,
    phone, today(),
  )
  if (!appts.length) return [{ text: 'No upcoming tokens found for this number. Want to book one?' }]
  return appts.map(({ code }) => {
    const t = trackInfo(code)
    const where =
      t.status === 'called' ? "🟢 It's your turn now!" : t.date !== today() ? `📅 ${prettyDay(t.date)}` : t.ahead === 0 ? "You're next 🔔" : `${t.ahead} ahead of you`
    return { text: `Token #${t.token} · ${t.doctor}\n${where}${t.current ? ` · Now serving #${t.current}` : ''}\n${trackUrl(t.code)}` }
  })
}

function confirm(s: State, channel: Channel) {
  const h = settings()
  const recent = one<{ n: number }>(
    "SELECT COUNT(*) n FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE p.phone = ? AND a.date >= ? AND a.status IN ('booked','waiting')",
    s.phone, today(),
  )!.n
  if (recent >= 4) throw new HttpError(429, 'This number already has 4 upcoming bookings. Please call reception to book more.')
  const appt = tx(() => {
    const patientId = findOrCreatePatient({ name: s.name!, phone: s.phone!, age: s.age, gender: s.gender })
    return book({ patientId, doctorId: s.doctorId!, date: s.date!, status: 'booked', source: channel === 'whatsapp' ? 'whatsapp' : 'web', strictDay: true })
  })
  const d = getDoctor(s.doctorId!)
  const msg = bookingMessage(appt, d, h.name)
  if (!appt.existing) {
    emit('booking', { token: appt.token, doctor: d.name, patient: s.name, date: appt.date, source: channel }, { roles: ['owner', 'reception', 'doctor'] })
    queueChanged(d.id)
    if (channel === 'web') void sendWhatsApp(s.phone!, msg)
  }
  return { appt, msg: appt.existing ? `You already have this booking 👇\n${msg}` : msg }
}

export function botReply(sid: string, input: string, channel: Channel, knownPhone?: string): BotMsg[] {
  const s = load(sid)
  const text = input.trim().slice(0, 200)
  const out: BotMsg[] = []
  if (knownPhone) s.phone = knownPhone
  if (!text || RESET.test(text) || /^(start over|menu)$/i.test(text)) out.push(menu(s, true))
  else {
    const i = pick(s, text)
    const value = i >= 0 ? s.values?.[i] : undefined
    switch (s.step) {
      case 'menu':
        if (i === 0) out.push(askDept(s))
        else if (i === 1) {
          if (s.phone) out.push(...trackReply(s.phone), menu(s))
          else {
            s.step = 'track'
            out.push({ text: 'Please share the 10-digit mobile number used for booking.' })
          }
        } else if (i === 2) {
          const h = settings()
          out.push({ text: `🕘 ${h.hours}\n📍 ${h.address}\n📞 ${h.phone}${h.map_url ? `\n🗺️ ${h.map_url}` : ''}` }, menu(s))
        } else if (i === 3) {
          const h = settings()
          out.push({ text: `🚑 For emergencies call ${h.emergency} right away — our emergency team is available 24×7. Do not wait for a chat reply.` }, menu(s))
        } else out.push({ text: "Sorry, I didn't get that. Tap an option or reply with its number.", options: s.options })
        break
      case 'dept':
        if (value == null) out.push({ text: 'Please choose a department from the list.', options: s.options })
        else {
          s.deptId = Number(value)
          out.push(askDoctor(s))
        }
        break
      case 'doctor':
        if (value == null) out.push({ text: 'Please choose a doctor from the list.', options: s.options })
        else {
          s.doctorId = Number(value)
          out.push(askDate(s))
        }
        break
      case 'date':
        if (value == null) out.push({ text: 'Please choose one of the days shown.', options: s.options })
        else {
          s.date = String(value)
          s.step = 'name'
          s.options = []
          out.push({ text: "Patient's full name?" })
        }
        break
      case 'name':
        if (!/^[\p{L} .'-]{2,60}$/u.test(text)) out.push({ text: 'Please type the name using letters only (2–60 characters).' })
        else {
          s.name = text.replace(/\s+/g, ' ')
          s.step = s.phone ? 'age' : 'phone'
          out.push({ text: s.phone ? 'Age of the patient? (reply a number, or "skip")' : 'Mobile number? (10 digits — we send the token on WhatsApp)' })
        }
        break
      case 'phone':
      case 'track': {
        const d = text.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
        if (!/^[6-9]\d{9}$/.test(d)) out.push({ text: 'That does not look like a valid 10-digit mobile number. Please try again.' })
        else {
          s.phone = d
          if (s.step === 'track') out.push(...trackReply(d), menu(s))
          else {
            s.step = 'age'
            out.push({ text: 'Age of the patient? (reply a number, or "skip")' })
          }
        }
        break
      }
      case 'age': {
        const n = Number(text)
        if (/^skip$/i.test(text)) s.age = null
        else if (!Number.isInteger(n) || n < 0 || n > 120) {
          out.push({ text: 'Please reply with age in years (0–120), or "skip".' })
          break
        } else s.age = n
        s.step = 'gender'
        out.push(ask(s, 'Gender?', ['Male', 'Female', 'Other']))
        break
      }
      case 'gender':
        if (value == null) out.push({ text: 'Please choose Male, Female or Other.', options: s.options })
        else {
          s.gender = String(value)
          out.push(summary(s))
        }
        break
      case 'confirm':
        if (i !== 0) out.push(menu(s, true))
        else
          try {
            out.push({ text: confirm(s, channel).msg }, menu(s))
          } catch (e) {
            if (!(e instanceof HttpError)) throw e
            out.push({ text: `⚠️ ${e.message}` }, menu(s))
          }
        break
    }
  }
  save(sid, s)
  return out
}
