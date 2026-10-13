import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router'
import {
  Building, CalendarCheck, ClipboardList, FlaskConical, KeyRound, LayoutDashboard, LogOut, Menu, Monitor, Pill, Receipt, RefreshCw, Settings, ShieldCheck, Stethoscope, Ticket, Users, Wallet,
} from 'lucide-react'
import { api, clearAllCaches, startLive, stopLive, useApi, useLiveEvent, useLiveStatus } from '../api.ts'
import { Button, Field, Modal, PageLoader, initials, inr, toast, toastError } from '../ui.tsx'
import { avatarBg, Brand, type Site } from '../pages/Landing.tsx'
import { ROLE_LABEL, type Role } from '../../shared/catalog.ts'
import GlobalSearch from './PatientSearch.tsx'
import './staff.css'

export type Me = { id: number; name: string; username: string; role: Role; doctor_id: number | null }
export const useMe = () => useOutletContext<Me>()

const NAV: { to: string; label: string; icon: typeof Ticket; roles: Role[]; group: string }[] = [
  { to: 'dashboard', label: 'Owner dashboard', icon: LayoutDashboard, roles: ['owner'], group: 'Overview' },
  { to: 'desk', label: 'Doctor desk', icon: Stethoscope, roles: ['doctor', 'owner'], group: 'Overview' },
  { to: 'front-desk', label: 'Front desk & queue', icon: Ticket, roles: ['owner', 'reception'], group: 'Daily work' },
  { to: 'billing', label: 'New bill', icon: Receipt, roles: ['owner', 'reception', 'lab', 'pharmacy'], group: 'Daily work' },
  { to: 'bills', label: 'Bills & payments', icon: ClipboardList, roles: ['owner', 'reception', 'lab', 'pharmacy'], group: 'Daily work' },
  { to: 'patients', label: 'Patients', icon: Users, roles: ['owner', 'reception', 'doctor', 'lab', 'pharmacy'], group: 'Daily work' },
  { to: 'lab', label: 'Lab worklist', icon: FlaskConical, roles: ['owner', 'reception', 'lab'], group: 'Departments' },
  { to: 'pharmacy', label: 'Pharmacy stock', icon: Pill, roles: ['owner', 'pharmacy'], group: 'Departments' },
  { to: 'expenses', label: 'Expenses', icon: Wallet, roles: ['owner', 'reception'], group: 'Departments' },
  { to: 'catalog', label: 'Hospital setup', icon: Building, roles: ['owner'], group: 'Admin' },
  { to: 'team', label: 'Staff accounts', icon: ShieldCheck, roles: ['owner'], group: 'Admin' },
  { to: 'settings', label: 'Settings & WhatsApp', icon: Settings, roles: ['owner'], group: 'Admin' },
]
const HOME: Record<Role, string> = { owner: 'dashboard', doctor: 'desk', reception: 'front-desk', lab: 'lab', pharmacy: 'pharmacy' }

export default function Shell() {
  const { data: me, error } = useApi<Me>('/auth/me', 60_000)
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const { pathname } = useLocation()
  const nav = useNavigate()
  const live = useLiveStatus()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState(false)

  useEffect(() => {
    if (!me) return
    startLive()
    return stopLive
  }, [me])
  useEffect(() => setOpen(false), [pathname])

  // Money & bookings pop up live for whoever should see them.
  useLiveEvent(
    useCallback(
      (type: string, d: any) => {
        if (type === 'payment' && me?.role === 'owner')
          toast(d.amount > 0 ? `${inr(d.amount)} received` : `${inr(-d.amount)} refunded`, 'money', `${d.billNo} · ${d.patient} · ${d.mode.toUpperCase()} · by ${d.by}`)
        if (type === 'booking') toast(`New ${d.source === 'whatsapp' ? 'WhatsApp' : 'online'} booking`, 'info', `Token #${d.token} · ${d.patient} → ${d.doctor}`)
        if (type === 'expense' && me?.role === 'owner' && d.amount) toast(`Expense ${inr(d.amount)}`, 'info', `${d.category} · by ${d.by}`)
      },
      [me?.role],
    ),
  )

  if (error?.status === 401) return <Navigate to="/staff/login" replace />
  if (error) return <div className="page-loader"><p className="error-text">{error.message}</p></div>
  if (!me) return <PageLoader />
  if (pathname === '/staff' || pathname === '/staff/') return <Navigate to={`/staff/${HOME[me.role]}`} replace />

  const items = NAV.filter((n) => n.roles.includes(me.role))
  const current = items.find((n) => pathname.startsWith(`/staff/${n.to}`))
  if (!current) return <Navigate to={`/staff/${HOME[me.role]}`} replace />
  const groups = [...new Set(items.map((i) => i.group))]

  async function logout() {
    await api('/auth/logout', {}).catch(() => {})
    stopLive()
    await clearAllCaches()
    nav('/staff/login', { replace: true })
  }

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="side" aria-label="Staff navigation">
        <Brand s={site?.settings} to={`/staff/${HOME[me.role]}`} />
        {groups.map((g) => (
          <div key={g}>
            <div className="side-label">{g}</div>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <NavLink key={i.to} to={i.to} className="nav-item">
                  <i.icon /> {i.label}
                </NavLink>
              ))}
          </div>
        ))}
        <div className="side-label">Screens</div>
        <a className="nav-item" href="/display" target="_blank" rel="noreferrer">
          <Monitor /> TV queue display
        </a>
        <a className="nav-item" href="/" target="_blank" rel="noreferrer">
          <CalendarCheck /> Public website
        </a>
        <div className="side-user">
          <div className="avatar" style={{ background: avatarBg(me.id) }}>{initials(me.name)}</div>
          <div className="grow">
            <b className="ellipsis">{me.name}</b>
            <span>{ROLE_LABEL[me.role]}</span>
          </div>
        </div>
      </aside>
      <div className="overlay" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <h1 className="grow ellipsis">{current.label}</h1>
          <GlobalSearch me={me} />
          <span className={`live-pill ${live ? '' : 'off'}`} title={live ? 'Live sync connected' : 'Reconnecting…'}>
            <span className="live-dot" /> <span className="hide-sm">{live ? 'Live' : 'Reconnecting'}</span>
          </span>
          <span className="small muted hide-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <button className="btn btn-ghost btn-sm btn-icon" title="Change password" aria-label="Change password" onClick={() => setPw(true)}>
            <KeyRound />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon hide-sm"
            title="Clear cached data on this computer"
            aria-label="Clear cache"
            onClick={async () => {
              await clearAllCaches()
              toast('Cache cleared', 'success', 'Fresh data will load from the server')
              setTimeout(() => location.reload(), 600)
            }}
          >
            <RefreshCw />
          </button>
          <button className="btn btn-sm" onClick={logout}>
            <LogOut /> <span className="hide-sm">Log out</span>
          </button>
        </header>
        <main className="content" key={pathname}>
          <Outlet context={me} />
        </main>
      </div>
      <PasswordModal open={pw} onClose={() => setPw(false)} />
    </div>
  )
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (f.next !== f.again) return toast('New passwords do not match', 'error')
    setBusy(true)
    try {
      await api('/auth/password', { current: f.current, next: f.next })
      toast('Password changed')
      setF({ current: '', next: '', again: '' })
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form className="stack" onSubmit={submit}>
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />
        </Field>
        <Field label="New password (8+ characters)">
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />
        </Field>
        <Field label="Repeat new password">
          <input className="input" type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required />
        </Field>
        <Button busy={busy}>Update password</Button>
      </form>
    </Modal>
  )
}
