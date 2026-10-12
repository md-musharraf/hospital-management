import { useApi } from '../api.ts'
import { fmtDateTime, inr } from '../ui.tsx'
import type { Site } from '../pages/Landing.tsx'

export type Bill = {
  id: number
  bill_no: string
  type: 'opd' | 'lab' | 'pharmacy'
  status: string
  cancel_reason?: string
  subtotal: number
  discount: number
  total: number
  paid: number
  lab_status?: string
  created_at: string
  doctor?: string
  doctor_id?: number
  token?: number | null
  trackCode?: string | null
  created_by_name?: string
  patient: { id: number; name: string; phone: string; age?: number; gender?: string; uhid: string }
  items: { id: number; name: string; qty: number; rate: number; amount: number; kind: string }[]
  payments: { amount: number; mode: string; created_at: string; by_name?: string }[]
}

const TITLE = { opd: 'OPD Receipt', lab: 'Lab Receipt', pharmacy: 'Pharmacy Bill' }

export default function Receipt({ b }: { b: Bill }) {
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const s = site?.settings ?? {}
  const due = b.total - b.paid
  return (
    <div className="print-area" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
      <div style={{ textAlign: 'center', paddingBottom: 12, borderBottom: '2px solid var(--ink)' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{s.name}</div>
        <div className="small">{s.address}</div>
        <div className="small">
          {s.phone}
          {s.email && ` · ${s.email}`}
        </div>
        {s.gstin && <div className="tiny">{s.gstin}</div>}
      </div>
      <div className="row between" style={{ margin: '12px 0', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{TITLE[b.type]}</div>
          <div className="small">
            No. <b>{b.bill_no}</b>
          </div>
          <div className="small">{fmtDateTime(b.created_at)}</div>
        </div>
        <div className="right small">
          <div>
            <b>{b.patient.name}</b>
          </div>
          <div>
            {b.patient.uhid}
            {b.patient.age != null && ` · ${b.patient.age}y`}
            {b.patient.gender && ` · ${b.patient.gender}`}
          </div>
          {b.patient.phone && <div>{b.patient.phone}</div>}
          {b.doctor && <div>{b.doctor}</div>}
        </div>
      </div>
      {b.token && (
        <div style={{ textAlign: 'center', padding: 8, border: '1.5px dashed var(--ink-3)', borderRadius: 10, marginBottom: 12 }}>
          <span className="small">OPD token</span> <b style={{ fontSize: 22, marginLeft: 6 }}>#{b.token}</b>
        </div>
      )}
      <table className="table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ paddingLeft: 0 }}>Item</th>
            <th className="right">Qty</th>
            <th className="right">Rate</th>
            <th className="right" style={{ paddingRight: 0 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i) => (
            <tr key={i.id}>
              <td style={{ paddingLeft: 0 }}>{i.name}</td>
              <td className="right num">{i.qty}</td>
              <td className="right num">{inr(i.rate)}</td>
              <td className="right num" style={{ paddingRight: 0 }}>{inr(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: 'auto', maxWidth: 280, marginTop: 10, display: 'grid', gap: 4 }} className="num">
        <div className="row between"><span>Subtotal</span><span>{inr(b.subtotal)}</span></div>
        {b.discount > 0 && <div className="row between"><span>Discount</span><span>−{inr(b.discount)}</span></div>}
        <div className="row between" style={{ fontWeight: 800, fontSize: 16, borderTop: '1.5px solid var(--ink)', paddingTop: 6 }}>
          <span>Total</span>
          <span>{inr(b.total)}</span>
        </div>
        <div className="row between"><span>Paid</span><span>{inr(b.paid)}</span></div>
        {due > 0 && b.status === 'active' && (
          <div className="row between" style={{ color: 'var(--rose)', fontWeight: 800 }}>
            <span>Balance due</span>
            <span>{inr(due)}</span>
          </div>
        )}
      </div>
      {b.payments.length > 0 && (
        <div className="small muted" style={{ marginTop: 10 }}>
          Payments: {b.payments.map((p) => `${inr(p.amount)} ${p.mode.toUpperCase()} (${fmtDateTime(p.created_at)})`).join(' · ')}
        </div>
      )}
      {b.status === 'cancelled' && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'var(--rose-50)', color: 'var(--rose)', fontWeight: 700 }}>
          CANCELLED — {b.cancel_reason}
        </div>
      )}
      <div className="tiny muted" style={{ textAlign: 'center', marginTop: 18 }}>
        Computer-generated receipt{b.created_by_name && ` · Billed by ${b.created_by_name}`} · Get well soon!
      </div>
    </div>
  )
}
