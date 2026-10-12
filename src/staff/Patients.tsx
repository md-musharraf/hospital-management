import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, FlaskConical, Pencil, Pill, Search, Stethoscope, UserPlus, Users } from 'lucide-react'
import { invalidate, useApi } from '../api.ts'
import { BillStatus, Empty, Skeleton, StatusBadge, fmtDay, fmtDateTime, inr } from '../ui.tsx'
import { BillModal, NewPatientModal, type Patient } from './common.tsx'
import { useMe } from './Shell.tsx'
import { billTypesFor } from '../../shared/catalog.ts'

export default function Patients() {
  const { id } = useParams()
  return id ? <Detail id={Number(id)} /> : <List />
}

function List() {
  const nav = useNavigate()
  const me = useMe()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const { data } = useApi<(Patient & { day: string })[]>(`/patients?q=${encodeURIComponent(q.trim())}`)
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Patients</h2>
          <p>Every visit, note and bill linked to one UHID.</p>
        </div>
        {me.role !== 'doctor' && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <UserPlus /> Register patient
          </button>
        )}
      </div>
      <section className="card">
        <div className="input-icon" style={{ marginBottom: 14 }}>
          <Search />
          <input className="input" placeholder="Search by name, mobile or UHID (e.g. P000012)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {!data ? (
          <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
        ) : data.length === 0 ? (
          <Empty icon={Users} title="No patients match" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>UHID</th><th>Name</th><th>Mobile</th><th className="hide-sm">Age / gender</th><th className="hide-sm">Registered</th></tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="click" tabIndex={0} onClick={() => nav(`/staff/patients/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/staff/patients/${p.id}`)}>
                    <td><span className="badge">{p.uhid}</span></td>
                    <td><b>{p.name}</b></td>
                    <td>{p.phone || '—'}</td>
                    <td className="hide-sm">{[p.age != null && `${p.age}y`, p.gender].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="hide-sm small muted">{fmtDay(p.day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <NewPatientModal open={adding} onClose={() => setAdding(false)} onCreated={(p) => nav(`/staff/patients/${p.id}`)} />
    </div>
  )
}

type DetailData = Patient & {
  visits: { id: number; date: string; token: number; status: string; notes: string; doctor: string }[]
  bills: { id: number; bill_no: string; type: string; total: number; paid: number; status: string; lab_status: string | null; created_at: string }[]
}

function Detail({ id }: { id: number }) {
  const me = useMe()
  const { data: p, error } = useApi<DetailData>(`/patients/${id}`, 5_000)
  const [edit, setEdit] = useState(false)
  const [bill, setBill] = useState<number | null>(null)
  const types = billTypesFor(me.role)
  if (error) return <Empty icon={Users} title="Patient not found" text={error.message} />
  if (!p) return <Skeleton h={300} r={20} />
  return (
    <div className="page">
      <Link to="/staff/patients" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft /> All patients
      </Link>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap between">
          <div className="row">
            <div className="avatar" style={{ background: 'var(--grad)', width: 60, height: 60, borderRadius: 18, fontSize: 22 }}>{p.name[0]}</div>
            <div>
              <h2 style={{ fontSize: 24 }}>{p.name}</h2>
              <div className="muted">
                {p.uhid} · {[p.age != null && `${p.age} yrs`, p.gender, p.phone, p.address].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div className="row wrap">
            {['owner', 'reception'].includes(me.role) && (
              <button className="btn btn-ghost" onClick={() => setEdit(true)}><Pencil /> Edit</button>
            )}
            {types.includes('opd') && <Link className="btn btn-soft" to={`/staff/billing?type=opd&patient=${p.id}`}><Stethoscope /> OPD</Link>}
            {types.includes('lab') && <Link className="btn btn-soft" to={`/staff/billing?type=lab&patient=${p.id}`}><FlaskConical /> Lab</Link>}
            {types.includes('pharmacy') && <Link className="btn btn-soft" to={`/staff/billing?type=pharmacy&patient=${p.id}`}><Pill /> Pharmacy</Link>}
          </div>
        </div>
      </section>
      <div className="dash-grid" style={{ marginTop: 0 }}>
        <section className="card">
          <div className="card-h"><h3><Stethoscope /> Visits & notes</h3></div>
          {p.visits.length === 0 ? <Empty icon={Stethoscope} title="No visits yet" /> : (
            <div className="stack" style={{ gap: 10 }}>
              {p.visits.map((v) => (
                <div key={v.id} style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)' }}>
                  <div className="row between">
                    <b>{fmtDay(v.date)} · {v.doctor}</b>
                    <span className="row" style={{ gap: 6 }}><span className="badge">#{v.token}</span><StatusBadge s={v.status} /></span>
                  </div>
                  {v.notes && <p className="small" style={{ marginTop: 8, whiteSpace: 'pre-line', color: 'var(--ink-2)' }}>{v.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-h"><h3>Bills</h3></div>
          {p.bills.length === 0 ? <Empty icon={FlaskConical} title="No bills" /> : (
            <div className="stack" style={{ gap: 4 }}>
              {p.bills.map((b) => (
                <button key={b.id} className="token-row" style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setBill(b.id)}>
                  <div className="grow">
                    <b>{b.bill_no}</b>
                    <div className="tiny muted">{fmtDateTime(b.created_at)}</div>
                  </div>
                  <BillStatus b={b} />
                  <b className="num">{inr(b.total)}</b>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <NewPatientModal open={edit} edit={p} onClose={() => setEdit(false)} onCreated={() => invalidate(`/patients/${p.id}`)} />
      <BillModal id={bill} onClose={() => setBill(null)} me={me} />
    </div>
  )
}
