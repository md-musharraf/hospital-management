import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export let db: DatabaseSync

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'stethoscope', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, department_id INTEGER REFERENCES departments(id),
  qualification TEXT NOT NULL DEFAULT '', fee INTEGER NOT NULL DEFAULT 0, room TEXT NOT NULL DEFAULT '',
  days TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri,Sat', start_time TEXT NOT NULL DEFAULT '10:00',
  end_time TEXT NOT NULL DEFAULT '14:00', max_tokens INTEGER NOT NULL DEFAULT 40,
  bio TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner','doctor','reception','lab','pharmacy')),
  doctor_id INTEGER REFERENCES doctors(id), active INTEGER NOT NULL DEFAULT 1,
  failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('staff','patient')),
  user_id INTEGER REFERENCES users(id), phone TEXT, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', age INTEGER,
  gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, day TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS patients_phone ON patients(phone);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES doctors(id), date TEXT NOT NULL, token INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked','waiting','called','done','skipped','cancelled')),
  source TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, called_at TEXT, done_at TEXT, UNIQUE (doctor_id, date, token));
CREATE INDEX IF NOT EXISTS appointments_date ON appointments(date, doctor_id);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY, bill_no TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK (type IN ('opd','lab','pharmacy')),
  patient_id INTEGER NOT NULL REFERENCES patients(id), doctor_id INTEGER REFERENCES doctors(id),
  appointment_id INTEGER REFERENCES appointments(id), subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0, lab_status TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')), cancel_reason TEXT,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, day TEXT NOT NULL,
  CHECK (paid >= 0 AND paid <= total AND discount <= subtotal));
CREATE INDEX IF NOT EXISTS bills_day ON bills(day);
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY, bill_id INTEGER NOT NULL REFERENCES bills(id), kind TEXT NOT NULL, ref_id INTEGER,
  name TEXT NOT NULL, qty INTEGER NOT NULL CHECK (qty > 0), rate INTEGER NOT NULL, amount INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, bill_id INTEGER NOT NULL REFERENCES bills(id), amount INTEGER NOT NULL,
  mode TEXT NOT NULL, user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL, day TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS payments_day ON payments(day);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL,
  tat TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, batch TEXT NOT NULL DEFAULT '', expiry TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), reorder_level INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount > 0), mode TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS expenses_day ON expenses(day);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY, direction TEXT NOT NULL, phone TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bot_sessions (sid TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);
`

export function initDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  return db
}

type Row = Record<string, any>
export const one = <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).get(...p) as T | undefined
export const all = <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).all(...p) as T[]
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p)
export const insert = (sql: string, ...p: any[]) => Number(run(sql, ...p).lastInsertRowid)

/** Synchronous transaction: node:sqlite is sync, so nothing else interleaves inside fn. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function nextCounter(key: string) {
  run('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key)
  return one<{ value: number }>('SELECT value FROM counters WHERE key = ?', key)!.value
}

export function settings(): Record<string, string> {
  return Object.fromEntries(all<{ key: string; value: string }>('SELECT key, value FROM settings').map((r) => [r.key, r.value]))
}
