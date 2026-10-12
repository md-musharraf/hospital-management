import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, FlaskConical, HandCoins, IndianRupee, Pill, Stethoscope, Users, Wallet } from 'lucide-react'
import { useApi } from '../api.ts'
import { CountUp, Empty, Skeleton, ago, fmtDay, inr, localDay } from '../ui.tsx'
import IncomeChart from '../components/Chart.tsx'

type Dash = {
  day: string
  income: number
  expense: number
  byType: { type: string; amount: number; bills: number }[]
  byMode: { mode: string; amount: number }[]
  expenseByCategory: { category: string; amount: number }[]
  visits: { total: number; done: number; waiting: number; booked: number; online: number }
  newPatients: number
  billed: { bills: number; patients: number; amount: number }
  dues: { amount: number; bills: number }
  lab: { pending: number; collected: number; ready: number }
  doctors: { id: number; name: string; patients: number; done: number; income: number }[]
  lowStock: { id: number; name: string; stock: number; reorder_level: number }[]
  expiring: { id: number; name: string; expiry: string; stock: number }[]
  series: { day: string; income: number; expense: number; visits: number }[]
  recent: any[]
}

export const TYPE_COLOR: Record<string, string> = { opd: '#0d9488', lab: '#6366f1', pharmacy: '#d97706' }
const TYPE_LABEL: Record<string, string> = { opd: 'OPD consultations', lab: 'Lab', pharmacy: 'Pharmacy' }

export default function Dashboard() {
  const today = localDay()
  const [day, setDay] = useState(today)
  const { data: d } = useApi<Dash>(`/dashboard?date=${day}`, 10_000)
  // Pulse the income card when money arrives live (not when switching days).
  const [pulse, setPulse] = useState(0)
  const prev = useRef<{ day: string; income: number } | null>(null)
  useEffect(() => {
    if (!d) return
    if (prev.current?.day === d.day && prev.current.income !== d.income) setPulse((n) => n + 1)
    prev.current = { day: d.day, income: d.income }
  }, [d])

  const net = d ? d.income - d.expense : 0
  const typeTotal = d ? d.byType.reduce((s, t) => s + Math.max(t.amount, 0), 0) : 0

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>{day === today ? 'Today at a glance' : fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p>Every bill, payment and expense appears here the moment it is saved — no refresh needed.</p>
        </div>
        <div className="toolbar">
          <input type="date" className="input" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pick a day" />
          {day !== today && (
            <button className="btn btn-soft" onClick={() => setDay(today)}>
              Today
            </button>
          )}
        </div>
      </div>

      {!d ? (
        <div className="kpis">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={150} r={20} />)}
        </div>
      ) : (
        <>
          <div className="kpis stagger">
            <div className="kpi hero">
              {pulse > 0 && <span key={pulse} className="kpi-ring" />}
              <div className="ic"><IndianRupee /></div>
              <div className="label">Income collected</div>
              <div className="value"><CountUp value={d.income} money /></div>
              <div className="sub">
                Net {inr(net)} after expenses · {d.billed.bills} bills
              </div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--brand-50)', color: 'var(--brand-ink)' }}><Users /></div>
              <div className="label">OPD patients</div>
              <div className="value"><CountUp value={d.visits.total} /></div>
              <div className="sub">
                {d.visits.done} seen · {d.visits.waiting} waiting · {d.visits.booked} yet to arrive · {d.newPatients} new
              </div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--rose-50)', color: 'var(--rose)' }}><Wallet /></div>
              <div className="label">Expenses</div>
              <div className="value"><CountUp value={d.expense} money /></div>
              <div className="sub">{d.expenseByCategory.map((c) => c.category).slice(0, 2).join(', ') || 'Nothing spent yet'}</div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--amber-50)', color: 'var(--amber)' }}><HandCoins /></div>
              <div className="label">Dues to collect</div>
              <div className="value"><CountUp value={d.dues.amount} money /></div>
              <div className="sub">
                <Link to="/staff/bills?status=due" style={{ textDecoration: 'underline' }}>{d.dues.bills} bills with balance →</Link>
              </div>
            </div>
          </div>

          <div className="dash-grid">
            <section className="card">
              <div className="card-h">
                <h3><Activity /> Income vs expense · 14 days</h3>
              </div>
              <IncomeChart data={d.series} />
            </section>
            <section className="card">
              <div className="card-h">
                <h3><IndianRupee /> Where the money came from</h3>
              </div>
              <div className="split" role="img" aria-label="Income split by department">
                {d.byType.filter((t) => t.amount > 0).map((t) => (
                  <div key={t.type} style={{ width: `${(t.amount / (typeTotal || 1)) * 100}%`, background: TYPE_COLOR[t.type] }} />
                ))}
              </div>
              <div className="legend">
                {['opd', 'lab', 'pharmacy'].map((type) => {
                  const t = d.byType.find((x) => x.type === type)
                  return (
                    <div key={type} className="row between">
                      <span className="row grow" style={{ gap: 8 }}>
                        <span style={{ background: TYPE_COLOR[type], width: 10, height: 10, borderRadius: 3 }} />
                        <span style={{ color: 'var(--ink-2)' }}>{TYPE_LABEL[type]}</span>
                        <span className="tiny muted">{t?.bills ?? 0} bills</span>
                      </span>
                      <b className="num">{inr(t?.amount ?? 0)}</b>
                    </div>
                  )
                })}
              </div>
              <div className="row wrap" style={{ marginTop: 18, gap: 8 }}>
                {d.byMode.map((m) => (
                  <span key={m.mode} className={`badge ${m.mode === 'refund' ? 'rose' : ''}`}>
                    {m.mode.toUpperCase()} {inr(m.amount)}
                  </span>
                ))}
              </div>
              <div className="row wrap" style={{ marginTop: 18, gap: 8 }}>
                <span className="badge amber"><FlaskConical /> {d.lab.pending} samples pending</span>
                <span className="badge violet">{d.lab.collected} in process</span>
                <span className="badge green">{d.lab.ready} reports ready</span>
              </div>
            </section>
          </div>

          <div className="dash-grid">
            <section className="card">
              <div className="card-h">
                <h3><Stethoscope /> Doctors {day === today ? 'today' : 'on this day'}</h3>
                <Link to="/staff/front-desk" className="btn btn-ghost btn-sm">Open queue</Link>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th className="right">Patients</th>
                      <th className="right">Seen</th>
                      <th className="right">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.doctors.filter((x) => x.patients || x.income).map((x) => (
                      <tr key={x.id}>
                        <td><b>{x.name}</b></td>
                        <td className="right num">{x.patients}</td>
                        <td className="right num">
                          {x.done}
                          <div style={{ height: 4, borderRadius: 4, background: '#eef2f7', marginTop: 4 }}>
                            <div style={{ width: `${x.patients ? (x.done / x.patients) * 100 : 0}%`, height: '100%', borderRadius: 4, background: 'var(--brand)', transition: 'width .8s var(--ease)' }} />
                          </div>
                        </td>
                        <td className="right num bold">{inr(x.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.doctors.some((x) => x.patients || x.income) && <Empty icon={Stethoscope} title="No OPD activity" />}
              </div>
            </section>

            <section className="card">
              <div className="card-h">
                <h3><span className="live-dot" style={{ marginRight: 4 }} /> Live money feed</h3>
              </div>
              <div className="feed">
                {d.recent.length === 0 && <Empty icon={IndianRupee} title="No transactions yet" text="Payments appear here instantly." />}
                {d.recent.map((r, i) => (
                  <div className="feed-item" key={`${r.kind}-${r.created_at}-${i}`} style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}>
                    <span className="ic" style={{ background: r.kind === 'expense' || r.amount < 0 ? 'var(--rose-50)' : 'var(--green-50)', color: r.kind === 'expense' || r.amount < 0 ? 'var(--rose)' : 'var(--green)' }}>
                      {r.kind === 'expense' || r.amount < 0 ? <ArrowDownRight /> : <ArrowUpRight />}
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b className="ellipsis" style={{ display: 'block', fontSize: 14 }}>
                        {r.kind === 'expense' ? r.category : `${r.bill_no} · ${r.patient}`}
                      </b>
                      <span className="tiny muted">
                        {r.kind === 'expense' ? r.description || 'Expense' : r.type.toUpperCase()} · {r.mode.toUpperCase()} · {r.by_name} · {ago(r.created_at)}
                      </span>
                    </div>
                    <b className="num" style={{ color: r.kind === 'expense' || r.amount < 0 ? 'var(--rose)' : 'var(--green)' }}>
                      {r.kind === 'expense' ? '−' : r.amount < 0 ? '' : '+'}
                      {inr(r.amount)}
                    </b>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {(d.lowStock.length > 0 || d.expiring.length > 0) && (
            <section className="card" style={{ marginTop: 16 }}>
              <div className="card-h">
                <h3><AlertTriangle style={{ color: 'var(--amber)' }} /> Pharmacy alerts</h3>
                <Link to="/staff/pharmacy" className="btn btn-ghost btn-sm">Manage stock</Link>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {d.lowStock.map((m) => (
                  <span key={'l' + m.id} className="badge rose"><Pill /> {m.name}: {m.stock} left</span>
                ))}
                {d.expiring.map((m) => (
                  <span key={'e' + m.id} className="badge amber">{m.name}: expires {fmtDay(m.expiry)}</span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
