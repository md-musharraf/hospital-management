import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarPlus, FileText, LogOut, Printer, Ticket, UserRound } from 'lucide-react'
import { api, clearAllCaches, useApi, usePublicQueue } from '../api.ts'
import { BillStatus, Empty, Modal, PageLoader, StatusBadge, fmtDay, inr, toast, toastError } from '../ui.tsx'
import Receipt, { type Bill } from '../components/Receipt.tsx'
import { Brand, type Site } from './Landing.tsx'
import './landing.css'

type Me = {
  phone: string
  today: string
  patients: { id: number; name: string; age: number; gender: string; uhid: string }[]
  appointments: { id: number; code: string; token: number; date: string; status: string; patient: string; doctor: string; room: string; start_time: string; department: string }[]
  bills: { id: number; bill_no: string; type: string; total: number; paid: number; status: string; lab_status: string | null; created_at: string; patient: string }[]
}

export default function Portal() {
  const nav = useNavigate()
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const { data: me, error, reload } = useApi<Me>('/patient/me', 0)
  const [bill, setBill] = useState<Bill | null>(null)
  const queue = usePublicQueue()

  useEffect(() => {
    if (error?.status === 401) nav('/login', { replace: true })
  }, [error, nav])
  useEffect(() => {
    if (queue) reload() // token moved somewhere → refresh my statuses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  if (!me) return <PageLoader />
  const upcoming = me.appointments.filter((a) => a.date >= me.today && ['booked', 'waiting', 'called'].includes(a.status))
  const past = me.appointments.filter((a) => !upcoming.includes(a))

  async function logout() {
    await api('/patient/logout', {})
    await clearAllCaches()
    nav('/', { replace: true })
  }
  async function cancel(id: number) {
    if (!confirm('Cancel this booking?')) return
    try {
      await api(`/patient/appointments/${id}/cancel`, {})
      toast('Booking cancelled')
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <>
      <div className="wrap public-top">
        <Brand s={site?.settings} />
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          <LogOut /> Log out
        </button>
      </div>
      <main className="wrap page" style={{ paddingBottom: 80 }}>
        <div className="row between wrap" style={{ margin: '12px 0 28px' }}>
          <div>
            <span className="eyebrow">Patient portal</span>
            <h1 style={{ fontSize: 'clamp(28px,4vw,38px)', marginTop: 8 }}>Hello, {me.patients[0]?.name.split(' ')[0] ?? 'there'} 👋</h1>
            <p className="muted">Signed in as +91 {me.phone}</p>
          </div>
          <a href="/#book" className="btn btn-primary">
            <CalendarPlus /> Book a new token
          </a>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <section className="card">
            <div className="card-h">
              <h3>
                <Ticket /> Upcoming tokens
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <Empty icon={Ticket} title="No upcoming tokens" text="Book a token and it will show up here with live status." />
            ) : (
              <div className="grid-2 stagger">
                {upcoming.map((a) => (
                  <div key={a.id} className="card hover-lift" style={{ boxShadow: 'none' }}>
                    <div className="row">
                      <div className="q-token" style={{ minWidth: 70, height: 60, fontSize: 24 }}>#{a.token}</div>
                      <div className="grow">
                        <b>{a.doctor}</b>
                        <div className="small muted">
                          {a.department} · {fmtDay(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · from {a.start_time}
                        </div>
                        <div className="small muted">For {a.patient}</div>
                      </div>
                    </div>
                    <div className="row between" style={{ marginTop: 14 }}>
                      <StatusBadge s={a.status} />
                      <div className="row">
                        {a.status === 'booked' && (
                          <button className="btn btn-danger btn-sm" onClick={() => cancel(a.id)}>
                            Cancel
                          </button>
                        )}
                        <Link className="btn btn-soft btn-sm" to={`/track/${a.code}`}>
                          Track live
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-h">
              <h3>
                <FileText /> Bills & lab reports
              </h3>
            </div>
            {me.bills.length === 0 ? (
              <Empty icon={FileText} title="No bills yet" />
            ) : (
              <div className="table-wrap">
                <table className="table rt">
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Date</th>
                      <th>Patient</th>
                      <th>Status</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {me.bills.map((b) => (
                      <tr key={b.id} className="click" tabIndex={0} onClick={() => api<Bill>(`/patient/bills/${b.id}`).then(setBill, toastError)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}>
                        <td>
                          <b>{b.bill_no}</b>
                          <div className="tiny muted">{b.type.toUpperCase()}</div>
                        </td>
                        <td>{fmtDay(b.created_at)}</td>
                        <td>{b.patient}</td>
                        <td>
                          <div className="row wrap" style={{ gap: 6 }}>
                            <BillStatus b={b} />
                            {b.lab_status && <StatusBadge s={b.lab_status} />}
                          </div>
                        </td>
                        <td className="right num bold">{inr(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid-2">
            <section className="card">
              <div className="card-h">
                <h3>
                  <UserRound /> Family on this number
                </h3>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {me.patients.map((p) => (
                  <div key={p.id} className="row between">
                    <span>
                      <b>{p.name}</b> <span className="small muted">{[p.age != null && `${p.age}y`, p.gender].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="badge">{p.uhid}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="card-h">
                <h3>Past visits</h3>
              </div>
              {past.length === 0 ? (
                <p className="muted small">No past visits.</p>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {past.slice(0, 8).map((a) => (
                    <div key={a.id} className="row between small">
                      <span>
                        {fmtDay(a.date)} · <b>{a.doctor}</b>
                      </span>
                      <StatusBadge s={a.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <Modal
        open={!!bill}
        onClose={() => setBill(null)}
        title={bill?.bill_no}
        footer={
          <button className="btn btn-primary" onClick={() => print()}>
            <Printer /> Print / Save PDF
          </button>
        }
      >
        {bill && <Receipt b={bill} />}
      </Modal>
    </>
  )
}
