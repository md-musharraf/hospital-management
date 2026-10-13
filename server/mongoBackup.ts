import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Binary, MongoClient } from 'mongodb'
import type { DatabaseSync } from 'node:sqlite'

// Free-hosting mode (MONGODB_URI set, e.g. Render free with no persistent disk): the SQLite file is copied
// into one MongoDB document after changes and restored from it when the server boots with an empty disk.
// ponytail: single 16 MB document, and writes from the last ~30 s can be lost on a crash or during a
// deploy overlap. For a live hospital use a paid disk (DATA_DIR) — its first boot restores from here.

type Snapshot = { _id: string; data: Binary; size: number; savedAt: Date }
const ID = 'hospital.db'
const LIMIT = 15.5 * 1024 * 1024
let client: MongoClient | null = null
let lastChanges = -1

const snapshots = () => client!.db().collection<Snapshot>('sqlite_snapshots')

/** Connects, and writes the saved database to dbPath when no local file exists yet. */
export async function restoreFromMongo(uri: string, dbPath: string) {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 })
  await client.connect()
  if (existsSync(dbPath)) return 'local database kept (snapshots continue)'
  const doc = await snapshots().findOne({ _id: ID })
  if (!doc) return 'no snapshot yet — starting with a new database'
  mkdirSync(dirname(dbPath), { recursive: true })
  writeFileSync(dbPath, doc.data.buffer)
  return `restored ${Math.round(doc.size / 1024)} KB snapshot saved ${doc.savedAt.toISOString()}`
}

/** Uploads a consistent copy if anything changed since the last upload. Returns true when it uploaded. */
export async function backupToMongo(db: DatabaseSync) {
  if (!client) return false
  const changes = (db.prepare('SELECT total_changes() n').get() as { n: number }).n
  if (changes === lastChanges) return false
  const tmp = join(tmpdir(), `hms-snapshot-${process.pid}.db`)
  rmSync(tmp, { force: true })
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`) // consistent copy; node:sqlite is sync, so no write interleaves
  const data = readFileSync(tmp)
  rmSync(tmp, { force: true })
  if (data.length > LIMIT) {
    console.error(`MongoDB snapshot skipped: database is ${Math.round(data.length / 1048576)} MB (limit 15 MB). Move to a paid disk.`)
    return false
  }
  await snapshots().replaceOne({ _id: ID }, { data: new Binary(data), size: data.length, savedAt: new Date() }, { upsert: true })
  lastChanges = changes
  return true
}

export async function closeMongo() {
  await client?.close()
  client = null
}
