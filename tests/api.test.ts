import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { createApp } from '../server/app.ts'

let server: Server
let base = ''
const PW = 'test-pass-123'

before(async () => {
  const app = createApp({ dbPath: ':memory:', demo: true, demoPassword: PW, prod: false })
  await new Promise<void>((r) => (server = app.listen(0, () => r())))
  base = `http://localhost:${(server.address() as any).port}/api`
})
after(() => {
  server.closeAllConnections()
  server.close()
})

/** Tiny client with its own cookie jar. */
function client() {
  let cookie = ''
  return async function call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', headers: Record<string, string> = {}) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = r.headers.getSetCookie().map((c) => c.split(';')[0])
    if (set.length) cookie = set.join('; ')
    const data = await r.json().catch(() => null)
    return { status: r.status, data, cookie }
  }
}

const login = async (username: string) => {
  const c = client()
  const r = await c('/auth/login', { username, password: PW })
  assert.equal(r.status, 200, `login ${username}`)
  return c
}

test('staff auth and role guards', async () => {
  const anon = client()
  assert.equal((await anon('/auth/login', { username: 'owner', password: 'nope' })).status, 401)
  assert.equal((await anon('/dashboard')).status, 401)
  const reception = await login('reception')
  assert.equal((await reception('/dashboard')).status, 403)
  const lab = await login('lab')
  assert.equal((await lab('/bills', { type: 'opd', patientId: 1, items: [] })).status, 403)
  // cross-site write is blocked even with a valid session
  assert.equal((await reception('/patients', { name: 'Evil' }, 'POST', { origin: 'https://evil.example' })).status, 403)
})

test('OPD bill → token, income and dues sync to the owner dashboard live', async () => {
  const owner = await login('owner')
  const reception = await login('reception')
  const before = (await owner('/dashboard')).data

  // owner's live stream should receive the payment event
  const stream = await fetch(base + '/stream', { headers: { cookie: (await owner('/auth/me')).cookie } })
  const reader = stream.body!.getReader()
  const got = (async () => {
    let buf = ''
    while (!buf.includes('event: payment')) buf += new TextDecoder().decode((await reader.read()).value)
    return buf
  })()

  const p = (await reception('/patients', { name: 'Test Patient', phone: '9123456780', age: 30, gender: 'Female' })).data
  const doctors = (await reception('/catalog/doctors')).data
  const doc = doctors[0]
  const bill = await reception('/bills', { type: 'opd', patientId: p.id, doctorId: doc.id, items: [], discount: 0, paid: doc.fee / 100 - 100, mode: 'upi' })
  assert.equal(bill.status, 201, JSON.stringify(bill.data))
  assert.ok(bill.data.token > 0, 'token issued')
  assert.equal(bill.data.total, doc.fee)
  assert.match(await got, /"amount":\d+/)
  await reader.cancel()

  const after = (await owner('/dashboard')).data
  assert.equal(after.income - before.income, doc.fee - 10000)
  assert.equal(after.dues.amount - before.dues.amount, 10000)

  // collect the due
  const paid = await reception(`/bills/${bill.data.id}/pay`, { amount: 100, mode: 'cash' })
  assert.equal(paid.data.paid, doc.fee)
  assert.equal((await reception(`/bills/${bill.data.id}/pay`, { amount: 1, mode: 'cash' })).status, 400)
})

test('pharmacy: server prices, stock checks, cancel refunds and restocks', async () => {
  const owner = await login('owner')
  const pharmacy = await login('pharmacy')
  const med = (await pharmacy('/catalog/medicines')).data.find((m: any) => m.stock > 20)
  const pid = (await pharmacy('/patients', { name: 'Walk In' })).data.id
  const income0 = (await owner('/dashboard')).data.income

  const tooMany = await pharmacy('/bills', { type: 'pharmacy', patientId: pid, items: [{ kind: 'medicine', refId: med.id, qty: med.stock + 1 }] })
  assert.equal(tooMany.status, 400)
  // client-sent rate is ignored for catalog items
  const b = await pharmacy('/bills', { type: 'pharmacy', patientId: pid, items: [{ kind: 'medicine', refId: med.id, qty: 10, rate: 0.01 }], mode: 'cash' })
  assert.equal(b.status, 201)
  assert.equal(b.data.total, med.price * 10)
  const stockAfter = (await pharmacy('/catalog/medicines')).data.find((m: any) => m.id === med.id).stock
  assert.equal(stockAfter, med.stock - 10)

  assert.equal((await pharmacy(`/bills/${b.data.id}/cancel`, { reason: 'wrong patient' })).status, 403)
  const c = await owner(`/bills/${b.data.id}/cancel`, { reason: 'wrong patient' })
  assert.equal(c.data.status, 'cancelled')
  assert.equal((await pharmacy('/catalog/medicines')).data.find((m: any) => m.id === med.id).stock, med.stock)
  assert.equal((await owner('/dashboard')).data.income, income0) // +sale −refund
})

test('bot booking → queue → patient portal with OTP', async () => {
  const web = client()
  let r = await web('/bot', { text: 'hi' })
  const sid = r.data.sid
  const say = async (text: string) => (r = await web('/bot', { sid, text })).data.messages
  await say('1') // book
  const depts = r.data.messages[0].options as string[]
  await say(String(depts.indexOf('General Medicine') + 1))
  await say('1') // first doctor
  const dates = r.data.messages[0].options
  assert.ok(dates.length > 0, 'doctor has dates')
  await say('1')
  await say('Sita Kumari')
  await say('9876543210')
  await say('28')
  await say('Female')
  const done = await say('Confirm booking')
  assert.match(done[0].text, /Token #\d+/)
  const code = /track\/([\w-]+)/.exec(done[0].text)![1]
  const t = (await web('/public/track/' + code)).data
  assert.equal(t.status, 'booked')
  assert.equal(t.patient, 'Sita') // first name only on the public page

  // patient login
  const pt = client()
  assert.equal((await pt('/patient/otp', { phone: '9999999999' })).status, 404)
  const otp = await pt('/patient/otp', { phone: '9876543210' })
  assert.ok(otp.data.devCode)
  assert.equal((await pt('/patient/verify', { phone: '9876543210', code: '000000' })).status, 400)
  assert.equal((await pt('/patient/verify', { phone: '9876543210', code: otp.data.devCode })).status, 200)
  const me = (await pt('/patient/me')).data
  assert.equal(me.appointments[0].code, code)
  assert.equal((await pt('/patient/bills/1')).status, 404) // someone else's bill

  // patient can cancel own booking
  assert.equal((await pt(`/patient/appointments/${me.appointments[0].id}/cancel`, {})).data.status, 'cancelled')
})

test('doctor queue: call next only for own patients', async () => {
  const reception = await login('reception')
  const doctor = await login('doctor')
  const me = (await doctor('/auth/me')).data
  const p = (await reception('/patients', { name: 'Queue Test', phone: '9811111111' })).data
  const bill = (await reception('/bills', { type: 'opd', patientId: p.id, doctorId: me.doctor_id, items: [], mode: 'cash' })).data
  // drain until our patient is called
  let called
  for (let i = 0; i < 50; i++) {
    called = (await doctor(`/queue/${me.doctor_id}/next`, {})).data.called
    if (!called || called.token === bill.token) break
  }
  assert.equal(called.token, bill.token)
  const pub = (await client()('/public/queue')).data.find((q: any) => q.doctorId === me.doctor_id)
  assert.equal(pub.current, bill.token)
  const other = (await reception('/catalog/doctors')).data.find((d: any) => d.id !== me.doctor_id)
  assert.equal((await doctor(`/queue/${other.id}/next`, {})).status, 403)
})
