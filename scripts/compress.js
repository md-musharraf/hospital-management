// After `vite build`: write .br and .gz next to every text asset so the server can send them
// without compressing on each request (≈70% smaller downloads on mobile data).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dist = join(import.meta.dirname, '..', 'dist')
const TEXT = /\.(js|css|html|svg|json|webmanifest|txt)$/
let files = 0
let before = 0
let after = 0

for (const name of readdirSync(dist, { recursive: true })) {
  const file = join(dist, String(name))
  if (!TEXT.test(file) || !statSync(file).isFile()) continue
  const raw = readFileSync(file)
  if (raw.length < 1024) continue
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  writeFileSync(file + '.br', br)
  writeFileSync(file + '.gz', gzipSync(raw, { level: 9 }))
  files++
  before += raw.length
  after += br.length
}
console.log(`compressed ${files} files: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (brotli)`)
