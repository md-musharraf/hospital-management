import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Bell, FileText, MessageCircle, Phone, Ticket } from 'lucide-react'
import { api, useApi } from '../api.ts'
import { Button, Field } from '../ui.tsx'
import { Brand, type Site } from './Landing.tsx'

export default function PatientLogin() {
  const nav = useNavigate()
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [devCode, setDevCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    api('/patient/me').then(() => nav('/my', { replace: true }), () => {})
  }, [nav])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api<{ devCode?: string }>('/patient/otp', { phone })
      setDevCode(r.devCode)
      setStep('code')
      setWait(30)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/patient/verify', { phone, code })
      nav('/my', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-art">
        <Brand s={site?.settings} />
        <div className="stagger">
          <h2>Your tokens, bills and reports — in your pocket.</h2>
          <ul className="ticks" style={{ color: 'rgba(255,255,255,.8)' }}>
            {[
              [Ticket, 'Live status of your OPD token'],
              [FileText, 'Bills and receipts for every visit'],
              [Bell, 'Lab report ready alerts'],
              [MessageCircle, 'Login code arrives on WhatsApp — no password'],
            ].map(([I, t]) => {
              const Icon = I as typeof Ticket
              return (
                <li key={t as string} style={{ color: 'rgba(255,255,255,.85)' }}>
                  <Icon style={{ color: '#5eead4' }} /> {t as string}
                </li>
              )
            })}
          </ul>
        </div>
        <span className="small" style={{ opacity: 0.6 }}>
          Hospital staff? <Link to="/staff/login" style={{ textDecoration: 'underline' }}>Staff login</Link>
        </span>
      </aside>
      <main className="auth-form">
        <div className="auth-card page">
          <div className="row between" style={{ marginBottom: 28 }}>
            <span className="badge brand">Patient login</span>
            <Link to="/" className="small muted">← Back to site</Link>
          </div>
          <h1>{step === 'phone' ? 'Welcome back' : 'Enter your code'}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {step === 'phone' ? 'Use the mobile number you gave at booking or registration.' : `We sent a 6-digit code to WhatsApp on +91 ${phone}.`}
          </p>
          {step === 'phone' ? (
            <form className="stack" style={{ marginTop: 26 }} onSubmit={sendCode}>
              <Field label="Mobile number">
                <div className="input-icon">
                  <Phone />
                  <input className="input" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))} autoFocus required />
                </div>
              </Field>
              {err && <p className="error-text">{err}</p>}
              <Button size="lg" busy={busy} disabled={phone.length !== 10}>
                Get login code <ArrowRight className="go" />
              </Button>
            </form>
          ) : (
            <form className="stack" style={{ marginTop: 26 }} onSubmit={verify}>
              {devCode && (
                <div className="badge amber" style={{ height: 'auto', padding: '8px 12px', borderRadius: 12 }}>
                  Dev mode (WhatsApp not connected): your code is <b style={{ marginLeft: 4 }}>{devCode}</b>
                </div>
              )}
              <Field label="One-time code">
                <input className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
              </Field>
              {err && <p className="error-text">{err}</p>}
              <Button size="lg" busy={busy} disabled={code.length !== 6}>
                Verify & continue
              </Button>
              <div className="row between small">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('phone')}>
                  Change number
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={wait > 0 || busy} onClick={() => sendCode()}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
