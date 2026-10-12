import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCheck, FlaskConical, Plus, TestTube } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Seg, Skeleton, StatusBadge, ago, toast, toastError } from '../ui.tsx'
import { BillModal } from './common.tsx'
import { useMe } from './Shell.tsx'

type Row = { id: number; bill_no: string; lab_status: string; created_at: string; patient: string; age: number | null; gender: string; phone: string; tests: string[]; total: number; paid: number }
const NEXT: Record<string, [string, string]> = { pending: ['collected', 'Sample collected'], collected: ['ready', 'Report ready'] }

export default function Lab() {
  const me = useMe()
  const { data } = useApi<Row[]>('/lab', 10_000)
  const [filter, setFilter] = useState('active')
  const [busy, setBusy] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const rows = (data ?? []).filter((r) => (filter === 'active' ? r.lab_status !== 'ready' : filter === 'all' || r.lab_status === filter))
  const count = (s: string) => (data ?? []).filter((r) => r.lab_status === s).length

  async function advance(r: Row) {
    const [status, label] = NEXT[r.lab_status]
    setBusy(r.id)
    try {
      await api(`/bills/${r.id}/lab-status`, { status })
      toast(label, 'success', status === 'ready' && r.phone ? 'Patient notified on WhatsApp' : r.bill_no)
      invalidate('/lab')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Lab worklist</h2>
          <p>Collect samples, mark reports ready — patients get a WhatsApp alert automatically.</p>
        </div>
        <Link className="btn btn-primary" to="/staff/billing?type=lab"><Plus /> New lab bill</Link>
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: `In progress (${count('pending') + count('collected')})` },
            { value: 'pending', label: `Pending (${count('pending')})` },
            { value: 'collected', label: `Collected (${count('collected')})` },
            { value: 'ready', label: `Ready today (${count('ready')})` },
          ]}
        />
      </div>
      {!data ? (
        <div className="board">{[0, 1, 2].map((i) => <Skeleton key={i} h={180} r={20} />)}</div>
      ) : rows.length === 0 ? (
        <Empty icon={FlaskConical} title="Nothing here" text="New lab bills appear instantly." />
      ) : (
        <div className="board stagger">
          {rows.map((r) => (
            <section key={r.id} className="card hover-lift">
              <div className="row between">
                <button className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto' }} onClick={() => setOpen(r.id)}>
                  <b>{r.bill_no}</b>
                </button>
                <StatusBadge s={r.lab_status} />
              </div>
              <div style={{ marginTop: 8 }}>
                <b>{r.patient}</b>
                <span className="small muted"> · {[r.age != null && `${r.age}y`, r.gender].filter(Boolean).join(' · ')} · {ago(r.created_at)}</span>
              </div>
              <div className="chips" style={{ margin: '12px 0' }}>
                {r.tests.map((t) => (
                  <span key={t} className="badge violet"><TestTube /> {t}</span>
                ))}
              </div>
              {r.paid < r.total && <div className="badge rose" style={{ marginBottom: 10 }}>Payment due</div>}
              {NEXT[r.lab_status] ? (
                <Button className="btn-block" variant={r.lab_status === 'collected' ? 'primary' : 'soft'} busy={busy === r.id} onClick={() => advance(r)}>
                  {r.lab_status === 'collected' ? <CheckCheck /> : <TestTube />} Mark: {NEXT[r.lab_status][1]}
                </Button>
              ) : (
                <div className="small muted"><CheckCheck size={16} style={{ display: 'inline', verticalAlign: -3, color: 'var(--green)' }} /> Report ready</div>
              )}
            </section>
          ))}
        </div>
      )}
      <BillModal id={open} onClose={() => setOpen(null)} me={me} />
    </div>
  )
}
