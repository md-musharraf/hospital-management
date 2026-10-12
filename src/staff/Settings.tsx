import { useEffect, useState, type FormEvent } from 'react'
import { Building, Copy, Database, MessageCircle, Monitor, Send, Trash } from 'lucide-react'
import { api, clearAllCaches, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, fmtDateTime, toast, toastError } from '../ui.tsx'
import { SETTINGS_FIELDS } from '../../shared/catalog.ts'

type S = { settings: Record<string, string>; waConfigured: boolean; publicUrl: string }
type Msg = { id: number; direction: string; phone: string; body: string; status: string; error: string | null; created_at: string }

export default function Settings() {
  const { data } = useApi<S>('/settings')
  const { data: msgs } = useApi<Msg[]>('/whatsapp/messages', 5_000)
  const [f, setF] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState({ phone: '', text: 'Test message from the hospital system ✅' })
  useEffect(() => {
    if (data) setF(data.settings)
  }, [data])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/settings', f, 'PUT')
      toast('Hospital profile saved', 'success', 'Website and receipts updated')
      invalidate('/settings', '/public/site')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  async function sendTest(e: FormEvent) {
    e.preventDefault()
    try {
      const r = await api<{ sent: boolean; configured: boolean }>('/whatsapp/test', test)
      toast(r.sent ? 'Sent on WhatsApp' : r.configured ? 'WhatsApp rejected it — see log' : 'Logged only (WhatsApp not connected)', r.sent ? 'success' : 'info')
      invalidate('/whatsapp')
    } catch (e) {
      toastError(e)
    }
  }
  const webhook = `${data?.publicUrl ?? location.origin}/api/whatsapp/webhook`

  return (
    <div className="page stack" style={{ gap: 16 }}>
      <div className="page-h" style={{ marginBottom: 0 }}>
        <div>
          <h2>Settings</h2>
          <p>Hospital profile, WhatsApp connection and this device's cache.</p>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="card-h">
          <h3><Building /> Hospital profile</h3>
          <Button busy={busy}>Save profile</Button>
        </div>
        <div className="grid-2">
          {SETTINGS_FIELDS.map((s) => (
            <Field key={s.key} label={s.label} className={s.key === 'about' || s.key === 'address' ? 'span-2' : ''}>
              {s.key === 'about' ? (
                <textarea className="textarea" maxLength={600} value={f[s.key] ?? ''} onChange={(e) => setF({ ...f, [s.key]: e.target.value })} />
              ) : (
                <input className="input" value={f[s.key] ?? ''} required={s.key === 'name'} onChange={(e) => setF({ ...f, [s.key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </form>

      <section className="card">
        <div className="card-h">
          <h3><MessageCircle /> WhatsApp Cloud API</h3>
          {data && (data.waConfigured ? <span className="badge green"><span className="live-dot" /> Connected</span> : <span className="badge amber">Not connected — messages are only logged</span>)}
        </div>
        <div className="grid-2">
          <div className="stack small" style={{ color: 'var(--ink-2)' }}>
            <p>
              Booking bot, token alerts (“you’re next”), receipts, lab-ready messages and patient login codes all go through WhatsApp. To go live, create a WhatsApp Business app at
              developers.facebook.com and put these in the server’s <code>.env</code>, then restart:
            </p>
            <code style={{ display: 'block', padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', whiteSpace: 'pre-wrap' }}>
              WA_TOKEN=…{'\n'}WA_PHONE_NUMBER_ID=…{'\n'}WA_VERIFY_TOKEN=any-secret-you-choose{'\n'}WA_APP_SECRET=…{'\n'}WA_OTP_TEMPLATE=(approved auth template)
            </code>
            <div>
              <b>Webhook URL</b> (subscribe to “messages”):
              <div className="row" style={{ marginTop: 6 }}>
                <code className="grow ellipsis" style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>{webhook}</code>
                <button type="button" className="btn btn-sm btn-icon" aria-label="Copy webhook URL" onClick={() => navigator.clipboard.writeText(webhook).then(() => toast('Copied'))}>
                  <Copy />
                </button>
              </div>
            </div>
          </div>
          <form className="stack" onSubmit={sendTest}>
            <Field label="Send a test message to">
              <input className="input" inputMode="numeric" placeholder="10-digit mobile" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} required />
            </Field>
            <Field label="Message">
              <input className="input" value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} required />
            </Field>
            <Button variant="soft"><Send /> Send test</Button>
          </form>
        </div>
        <h4 style={{ margin: '22px 0 10px', fontSize: 14 }}>Message log</h4>
        {!msgs?.length ? (
          <Empty icon={MessageCircle} title="No messages yet" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
            <table className="table rt">
              <thead>
                <tr><th>When</th><th>To / from</th><th>Message</th><th>Status</th></tr>
              </thead>
              <tbody>
                {msgs.map((m) => (
                  <tr key={m.id}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.created_at)}</td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{m.direction === 'in' ? '⬅️' : '➡️'} {m.phone}</td>
                    <td className="small" style={{ whiteSpace: 'pre-line', maxWidth: 420 }}>{m.body.length > 220 ? m.body.slice(0, 220) + '…' : m.body}</td>
                    <td>
                      <span className={`badge ${m.status === 'sent' || m.status === 'received' ? 'green' : m.status === 'failed' ? 'rose' : ''}`} title={m.error ?? ''}>{m.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-h"><h3><Database /> Cache management</h3></div>
          <ul className="small" style={{ color: 'var(--ink-2)', paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
            <li>Patient & billing data is never stored by the browser (<code>no-store</code>).</li>
            <li>Screens keep a short in-memory cache and refresh instantly on every live update.</li>
            <li>App files are cached forever by version, so updates load fresh automatically.</li>
            <li>Logging out wipes this device’s cache — safe for shared reception PCs.</li>
          </ul>
          <Button
            variant="danger"
            style={{ marginTop: 16 }}
            onClick={async () => {
              await clearAllCaches()
              toast('This device’s cache was cleared')
              setTimeout(() => location.reload(), 600)
            }}
          >
            <Trash /> Clear cache on this device
          </Button>
        </section>
        <section className="card">
          <div className="card-h"><h3><Monitor /> Waiting-hall TV</h3></div>
          <p className="small" style={{ color: 'var(--ink-2)' }}>
            Open the display on any smart TV or PC browser. It shows the token each doctor is serving, flashes and announces new calls by voice — no patient names are shown.
          </p>
          <a className="btn" style={{ marginTop: 16 }} href="/display" target="_blank" rel="noreferrer"><Monitor /> Open queue display</a>
        </section>
      </div>
    </div>
  )
}
