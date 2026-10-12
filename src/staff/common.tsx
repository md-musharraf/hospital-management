import { useEffect, useState, type FormEvent } from 'react'
import { Ban, MessageCircle, Phone, Printer, Wallet } from 'lucide-react'
import { api, invalidate } from '../api.ts'
import { BillStatus, Button, Field, Modal, Seg, StatusBadge, inr, toast, toastError } from '../ui.tsx'
import Receipt, { type Bill } from '../components/Receipt.tsx'
import type { Me } from './Shell.tsx'

export type Patient = { id: number; uhid: string; name: string; phone: string; age: number | null; gender: string; address: string }

export function NewPatientModal(p: { open: boolean; onClose: () => void; onCreated: (pt: Patient) => void; initialName?: string; initialPhone?: string; edit?: Patient }) {
  const blank = { name: '', phone: '', age: '', gender: '', address: '' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (p.open) setF(p.edit ? { ...p.edit, age: p.edit.age?.toString() ?? '' } : { ...blank, name: p.initialName ?? '', phone: p.initialPhone ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const pt = await api<Patient & { existing?: boolean }>(p.edit ? `/patients/${p.edit.id}` : '/patients', f, p.edit ? 'PUT' : 'POST')
      toast(p.edit ? 'Patient updated' : pt.existing ? 'Patient already registered — selected' : `Registered ${pt.uhid}`)
      invalidate('/patients')
      p.onCreated(pt)
      p.onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={p.open} onClose={p.onClose} title={p.edit ? 'Edit patient' : 'Register new patient'}>
      <form className="grid-2" onSubmit={submit}>
        <Field label="Full name *" className="span-2">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoFocus />
        </Field>
        <Field label="Mobile (for WhatsApp)">
          <div className="input-icon">
            <Phone />
            <input className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10 digits" />
          </div>
        </Field>
        <Field label="Age (years)">
          <input className="input" type="number" min={0} max={120} value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
        </Field>
        <Field label="Gender" className="span-2">
          <Seg value={f.gender} onChange={(g) => setF({ ...f, gender: g })} options={['Male', 'Female', 'Other'].map((g) => ({ value: g, label: g }))} />
        </Field>
        <Field label="Address" className="span-2">
          <input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <div className="span-2 row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={p.onClose}>
            Cancel
          </Button>
          <Button busy={busy}>{p.edit ? 'Save changes' : 'Register patient'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Bill details with print, WhatsApp, collect due and (owner) cancel. */
export function BillModal({ id, onClose, me }: { id: number | null; onClose: () => void; me: Me }) {
  const [b, setB] = useState<Bill | null>(null)
  const [pay, setPay] = useState<{ amount: string; mode: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setB(null)
    setPay(null)
    if (id) api<Bill>(`/bills/${id}`).then(setB, toastError)
  }, [id])

  async function act(fn: () => Promise<Bill | void>, msg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (r) setB(r)
      toast(msg)
      invalidate('/bills', '/dashboard', '/lab')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  const due = b ? b.total - b.paid : 0
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={
        b ? (
          <span className="row">
            {b.bill_no} <BillStatus b={b} />
          </span>
        ) : (
          'Bill'
        )
      }
      footer={
        b && (
          <div className="row wrap" style={{ width: '100%', justifyContent: 'flex-end' }}>
            {me.role === 'owner' && b.status === 'active' && (
              <Button
                variant="danger"
                busy={busy}
                onClick={() => {
                  const reason = prompt('Reason for cancelling this bill? (paid amount will be refunded in the books)')
                  if (reason) act(() => api(`/bills/${b.id}/cancel`, { reason }), 'Bill cancelled')
                }}
              >
                <Ban /> Cancel bill
              </Button>
            )}
            {b.patient.phone && (
              <Button variant="ghost" busy={busy} onClick={() => act(() => api(`/bills/${b.id}/whatsapp`, {}).then(() => {}), 'Receipt sent on WhatsApp')}>
                <MessageCircle /> WhatsApp
              </Button>
            )}
            {due > 0 && b.status === 'active' && (
              <Button variant="soft" onClick={() => setPay({ amount: String(due / 100), mode: 'cash' })}>
                <Wallet /> Collect {inr(due)}
              </Button>
            )}
            <Button onClick={() => print()}>
              <Printer /> Print
            </Button>
          </div>
        )
      }
    >
      {!b ? (
        <div className="stack">
          <div className="skeleton" style={{ height: 60 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      ) : (
        <>
          {pay && (
            <form
              className="card no-print"
              style={{ marginBottom: 16, background: 'var(--brand-50)', borderColor: 'var(--brand-100)' }}
              onSubmit={(e) => {
                e.preventDefault()
                act(() => api(`/bills/${b.id}/pay`, { amount: Number(pay.amount), mode: pay.mode }), 'Payment recorded').then(() => setPay(null))
              }}
            >
              <div className="row wrap">
                <Field label="Amount (₹)">
                  <input className="input" type="number" step="0.01" min="0.01" max={due / 100} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required />
                </Field>
                <Field label="Mode">
                  <Seg value={pay.mode} onChange={(m) => setPay({ ...pay, mode: m })} options={['cash', 'upi', 'card'].map((m) => ({ value: m, label: m.toUpperCase() }))} />
                </Field>
                <Button busy={busy} style={{ alignSelf: 'flex-end' }}>
                  Record payment
                </Button>
              </div>
            </form>
          )}
          {b.lab_status && (
            <div className="row no-print" style={{ marginBottom: 14 }}>
              <span className="small muted">Lab status</span> <StatusBadge s={b.lab_status} />
            </div>
          )}
          <Receipt b={b} />
        </>
      )}
    </Modal>
  )
}
