import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Eye, EyeOff, LayoutDashboard, Lock, Receipt, Ticket, UserRound, Zap } from 'lucide-react'
import { api, clearAllCaches, useApi } from '../api.ts'
import { Button, Field } from '../ui.tsx'
import { Brand, type Site } from './Landing.tsx'
import './landing.css'

export default function StaffLogin() {
  const nav = useNavigate()
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/auth/me').then(() => nav('/staff', { replace: true }), () => {})
  }, [nav])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await clearAllCaches() // never show the previous user's cached data
      await api('/auth/login', { username, password })
      nav('/staff', { replace: true })
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
          <span className="badge" style={{ background: 'rgba(255,255,255,.1)', color: '#5eead4' }}>
            <Zap /> Live hospital operations
          </span>
          <h2 style={{ marginTop: 16 }}>Reception, doctors and owner — on the same live page.</h2>
          <ul className="ticks">
            {[
              [Receipt, 'OPD, lab & pharmacy billing in seconds'],
              [Ticket, 'Token queue with TV display and WhatsApp alerts'],
              [LayoutDashboard, 'Owner sees every rupee the moment it is collected'],
            ].map(([I, t]) => {
              const Icon = I as typeof Receipt
              return (
                <li key={t as string} style={{ color: 'rgba(255,255,255,.85)' }}>
                  <Icon style={{ color: '#5eead4' }} /> {t as string}
                </li>
              )
            })}
          </ul>
        </div>
        <span className="small" style={{ opacity: 0.6 }}>Access is logged. Use only your own account.</span>
      </aside>
      <main className="auth-form">
        <form className="auth-card page stack" onSubmit={submit}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="badge dark">Staff login</span>
            <Link to="/login" className="small muted">
              Patient? Log in here →
            </Link>
          </div>
          <h1>Sign in to work</h1>
          <p className="muted" style={{ marginTop: -6 }}>Owner, doctor, reception, lab and pharmacy accounts.</p>
          <Field label="Username">
            <div className="input-icon">
              <UserRound />
              <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </div>
          </Field>
          <Field label="Password">
            <div className="input-icon" style={{ position: 'relative' }}>
              <Lock />
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 46 }} />
              <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ position: 'absolute', right: 5, top: 5 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </Field>
          {err && <p className="error-text">{err}</p>}
          <Button size="lg" busy={busy}>
            Sign in <ArrowRight className="go" />
          </Button>
          {import.meta.env.DEV && (
            <p className="small muted" style={{ padding: 12, borderRadius: 12, background: 'var(--amber-50)' }}>
              Demo users: <b>owner</b>, <b>reception</b>, <b>doctor</b>, <b>lab</b>, <b>pharmacy</b>. Password is <code>DEMO_PASSWORD</code> in the project’s <code>.env</code> file.
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
