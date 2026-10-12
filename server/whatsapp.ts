import { createHmac, timingSafeEqual } from 'node:crypto'
import { insert, run } from './db.ts'

// WhatsApp Cloud API (Meta Graph). Without WA_TOKEN every message is still written to
// wa_messages with status "logged", so the outbox is visible in Settings → WhatsApp.
const GRAPH = 'https://graph.facebook.com/v21.0'
export const waConfigured = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_NUMBER_ID)

async function post(payload: object) {
  const r = await fetch(`${GRAPH}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 300)}`)
}

/**
 * phone = 10-digit Indian mobile. Never throws: failures are logged, the caller's work goes on.
 * logBody replaces the text stored in the outbox (used to keep OTPs out of the log).
 */
export async function sendWhatsApp(phone: string, body: string, opts: { template?: { name: string; code: string }; logBody?: string } = {}) {
  const { template } = opts
  const id = insert(
    'INSERT INTO wa_messages (direction, phone, body, status, created_at) VALUES (?, ?, ?, ?, ?)',
    'out', phone, opts.logBody ?? body, waConfigured() ? 'sending' : 'logged', new Date().toISOString(),
  )
  if (!waConfigured()) return false
  try {
    const to = '91' + phone
    await post(
      template
        ? {
            to,
            type: 'template',
            template: {
              name: template.name,
              language: { code: 'en' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: template.code }] },
                { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: template.code }] },
              ],
            },
          }
        : { to, type: 'text', text: { body, preview_url: true } },
    )
    run("UPDATE wa_messages SET status = 'sent' WHERE id = ?", id)
    return true
  } catch (e) {
    run("UPDATE wa_messages SET status = 'failed', error = ? WHERE id = ?", String((e as Error).message), id)
    return false
  }
}

export function logIncoming(phone: string, body: string) {
  insert("INSERT INTO wa_messages (direction, phone, body, status, created_at) VALUES ('in', ?, ?, 'received', ?)", phone, body, new Date().toISOString())
}

/** X-Hub-Signature-256 check; skipped only when WA_APP_SECRET is not set (dev). */
export function validSignature(raw: Buffer | undefined, header: string | undefined) {
  const secret = process.env.WA_APP_SECRET
  if (!secret) return true
  if (!raw || !header?.startsWith('sha256=')) return false
  const a = Buffer.from(header.slice(7), 'hex')
  const b = createHmac('sha256', secret).update(raw).digest()
  return a.length === b.length && timingSafeEqual(a, b)
}
