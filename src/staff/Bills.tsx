import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ClipboardList, Download, Plus, Search } from 'lucide-react'
import { useApi } from '../api.ts'
import { BillStatus, Empty, Seg, Skeleton, StatusBadge, fmtDateTime, inr, localDay } from '../ui.tsx'
import { BillModal } from './common.tsx'
import { useMe } from './Shell.tsx'
import { TYPE_COLOR } from './Dashboard.tsx'
import { BILL_LABEL, billTypesFor } from '../../shared/catalog.ts'

type Row = { id: number; bill_no: string; type: string; total: number; paid: number; discount: number; status: string; lab_status: string | null; created_at: string; patient: string; phone: string; doctor: string | null; created_by_name: string }

export default function Bills() {
  const me = useMe()
  const [sp, setSp] = useSearchParams()
  const today = localDay()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const status = sp.get('status') ?? ''
  const [open, setOpen] = useState<number | null>(null)
  const qs = new URLSearchParams({ from, to, q: q.trim(), type, status }).toString()
  const { data: rows } = useApi<Row[]>(`/bills?${qs}`, 10_000)

  const active = (rows ?? []).filter((r) => r.status === 'active')
  const sum = (k: 'total' | 'paid') => active.reduce((s, r) => s + r[k], 0)
  const types = billTypesFor(me.role)

  function csv() {
    const head = ['Bill', 'Date', 'Type', 'Patient', 'Phone', 'Doctor', 'Total', 'Paid', 'Due', 'Status', 'Billed by']
    const lines = (rows ?? []).map((r) => [r.bill_no, r.created_at, r.type, r.patient, r.phone, r.doctor ?? '', r.total / 100, r.paid / 100, (r.total - r.paid) / 100, r.status, r.created_by_name])
    const text = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }))
    a.download = `bills-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Bills & payments</h2>
          <p>Search, reprint, collect dues{me.role === 'owner' ? ' or cancel' : ''}.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={csv} disabled={!rows?.length}>
            <Download /> Export CSV
          </button>
          <Link className="btn btn-primary" to="/staff/billing">
            <Plus /> New bill
          </Link>
        </div>
      </div>

      <section className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <div className="input-icon" style={{ flex: '1 1 220px' }}>
            <Search />
            <input className="input" style={{ width: '100%' }} placeholder="Patient, mobile or bill no. (searches all dates)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!q && status !== 'due' && (
            <>
              <input type="date" className="input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
              <input type="date" className="input" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
            </>
          )}
          {types.length > 1 && <Seg label="Type" value={type} onChange={setType} options={[{ value: '', label: 'All' }, ...types.map((t) => ({ value: t, label: BILL_LABEL[t] }))]} />}
          <Seg label="Status" value={status} onChange={(s) => setSp(s ? { status: s } : {}, { replace: true })} options={[{ value: '', label: 'All' }, { value: 'due', label: 'Due' }, { value: 'cancelled', label: 'Cancelled' }]} />
        </div>

        {!rows ? (
          <div className="stack">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</div>
        ) : rows.length === 0 ? (
          <Empty icon={ClipboardList} title="No bills found" text="Try another date range or search." />
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
              <span className="badge">{active.length} bills</span>
              <span className="badge brand">Billed {inr(sum('total'))}</span>
              <span className="badge green">Collected {inr(sum('paid'))}</span>
              {sum('total') > sum('paid') && <span className="badge rose">Due {inr(sum('total') - sum('paid'))}</span>}
            </div>
            <div className="table-wrap">
              <table className="table rt">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Patient</th>
                    <th className="hide-sm">Doctor / by</th>
                    <th>Status</th>
                    <th className="right">Total</th>
                    <th className="right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="click" tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)} style={{ opacity: r.status === 'cancelled' ? 0.55 : 1 }}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 3, background: TYPE_COLOR[r.type] }} aria-hidden />
                          <b>{r.bill_no}</b>
                        </div>
                        <span className="tiny muted">{fmtDateTime(r.created_at)}</span>
                      </td>
                      <td>
                        <b>{r.patient}</b>
                        <div className="tiny muted">{r.phone}</div>
                      </td>
                      <td className="hide-sm small">
                        {r.doctor ?? '—'}
                        <div className="tiny muted">by {r.created_by_name}</div>
                      </td>
                      <td>
                        <div className="row wrap" style={{ gap: 4 }}>
                          <BillStatus b={r} />
                          {r.lab_status && <StatusBadge s={r.lab_status} />}
                        </div>
                      </td>
                      <td className="right num bold">{inr(r.total)}</td>
                      <td className="right num">{inr(r.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <BillModal id={open} onClose={() => setOpen(null)} me={me} />
    </div>
  )
}
