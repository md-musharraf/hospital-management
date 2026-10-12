import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CreditCard, FlaskConical, IndianRupee, Minus, Pill, Plus, Receipt, Search, Smartphone, Stethoscope, Trash, Wallet } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, Seg, fmtDay, inr, toast, toastError } from '../ui.tsx'
import { BillModal, PatientPicker, type Patient } from './common.tsx'
import { useMe } from './Shell.tsx'
import { BILL_LABEL, billTypesFor, type BillType } from '../../shared/catalog.ts'

type CatalogItem = { id: number; name: string; price: number; stock?: number; expiry?: string; category?: string; tat?: string }
type Line = { key: string; kind: string; refId?: number; name: string; rate: number; qty: number; max?: number }
type Doctor = { id: number; name: string; fee: number }

const SOURCE: Record<BillType, { path: string; kind: string; icon: typeof Pill; noun: string }> = {
  opd: { path: '/catalog/services', kind: 'service', icon: Stethoscope, noun: 'service (dressing, ECG…)' },
  lab: { path: '/catalog/lab_tests', kind: 'test', icon: FlaskConical, noun: 'lab test' },
  pharmacy: { path: '/catalog/medicines', kind: 'medicine', icon: Pill, noun: 'medicine' },
}
const MODE_ICON = { cash: Wallet, upi: Smartphone, card: CreditCard }

export default function Billing() {
  const me = useMe()
  const allowed = billTypesFor(me.role)
  const [sp, setSp] = useSearchParams()
  const type = (allowed.includes(sp.get('type') as BillType) ? sp.get('type') : allowed[0]) as BillType
  const appointmentId = sp.get('appointment')

  const [patient, setPatient] = useState<Patient | null>(null)
  const [doctorId, setDoctorId] = useState(sp.get('doctor') ?? '')
  const [consult, setConsult] = useState(true)
  const [token, setToken] = useState(true)
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [paid, setPaid] = useState<string | null>(null)
  const [mode, setMode] = useState<'cash' | 'upi' | 'card'>('cash')
  const [busy, setBusy] = useState(false)
  const [billId, setBillId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [custom, setCustom] = useState({ name: '', rate: '' })
  const search = useRef<HTMLInputElement>(null)

  const { data: catalog } = useApi<CatalogItem[]>(SOURCE[type].path)
  const { data: doctors } = useApi<Doctor[]>(type === 'opd' ? '/catalog/doctors' : null)

  useEffect(() => {
    const id = sp.get('patient')
    if (id) api<Patient>(`/patients/${id}`).then(setPatient, toastError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doctor = doctors?.find((d) => String(d.id) === doctorId)
  const consultFee = type === 'opd' && doctor && consult ? doctor.fee : 0
  const subtotal = consultFee + lines.reduce((s, l) => s + l.rate * l.qty, 0)
  const disc = Math.min(subtotal, Math.round(Number(discount || 0) * 100))
  const total = subtotal - disc
  const paidP = paid == null ? total : Math.min(total, Math.round(Number(paid || 0) * 100))
  const due = total - paidP

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return (catalog ?? []).filter((c) => c.name.toLowerCase().includes(t) || c.category?.toLowerCase().includes(t)).slice(0, 8)
  }, [q, catalog])

  function switchType(t: BillType) {
    setSp({ type: t }, { replace: true })
    setLines([])
    setQ('')
  }
  function add(c: CatalogItem) {
    if (c.stock === 0) return toast(`${c.name} is out of stock`, 'error')
    setLines((ls) => {
      const found = ls.find((l) => l.refId === c.id)
      if (found) return ls.map((l) => (l === found ? { ...l, qty: Math.min(l.qty + 1, l.max ?? 1000) } : l))
      return [...ls, { key: `${c.id}`, kind: SOURCE[type].kind, refId: c.id, name: c.name, rate: c.price, qty: 1, max: c.stock }]
    })
    setQ('')
    search.current?.focus()
  }
  function addCustom() {
    const rate = Math.round(Number(custom.rate) * 100)
    if (!custom.name.trim() || !(rate > 0)) return toast('Enter item name and rate', 'error')
    setLines((ls) => [...ls, { key: `c${Date.now()}`, kind: 'custom', name: custom.name.trim(), rate, qty: 1 }])
    setCustom({ name: '', rate: '' })
  }
  const setQty = (key: string, qty: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(qty || 1, l.max ?? 1000)) } : l)))

  async function save() {
    if (!patient) return toast('Select or register the patient first', 'error')
    if (type === 'opd' && !doctor && !lines.length) return toast('Choose a doctor or add a service', 'error')
    if (!subtotal) return toast('Add at least one item', 'error')
    setBusy(true)
    try {
      const b = await api<{ id: number; bill_no: string; token: number | null }>('/bills', {
        type,
        patientId: patient.id,
        doctorId: type === 'opd' && doctor ? doctor.id : undefined,
        appointmentId: type === 'opd' && appointmentId ? Number(appointmentId) : undefined,
        consult,
        token,
        items: lines.map((l) => ({ kind: l.kind, refId: l.refId, name: l.name, qty: l.qty, rate: l.rate / 100 })),
        discount: disc / 100,
        paid: paidP / 100,
        mode,
      })
      toast(`Bill ${b.bill_no} saved${b.token ? ` · Token #${b.token}` : ''}`, 'success', paidP ? `${inr(paidP)} collected — owner dashboard updated` : 'Saved as due')
      invalidate('/queue', '/bills', '/catalog/medicines', '/lab')
      setBillId(b.id)
      setLines([])
      setDiscount('')
      setPaid(null)
      setPatient(null)
      setSp({ type }, { replace: true })
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const Src = SOURCE[type]
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>New {BILL_LABEL[type]} bill</h2>
          <p>Prices come from the hospital catalog. Saved bills reach the owner's dashboard instantly.</p>
        </div>
        {allowed.length > 1 && (
          <Seg
            label="Bill type"
            value={type}
            onChange={switchType}
            options={allowed.map((t) => ({ value: t, label: <>{t === 'opd' ? <Stethoscope /> : t === 'lab' ? <FlaskConical /> : <Pill />} {BILL_LABEL[t]}</> }))}
          />
        )}
      </div>

      <div className="bill-layout">
        <div className="stack">
          <section className="card">
            <div className="card-h">
              <h3>1 · Patient</h3>
            </div>
            <PatientPicker value={patient} onChange={setPatient} autoFocus />
          </section>

          {type === 'opd' && (
            <section className="card">
              <div className="card-h">
                <h3>2 · Doctor & token</h3>
                {appointmentId && <span className="badge violet">Checking in an online booking</span>}
              </div>
              <div className="grid-2">
                <Field label="Consulting doctor">
                  <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!!appointmentId}>
                    <option value="">No consultation (services only)</option>
                    {doctors?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {inr(d.fee)}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="stack" style={{ gap: 8, alignContent: 'end' }}>
                  <label className="check">
                    <input type="checkbox" checked={consult} onChange={(e) => setConsult(e.target.checked)} /> Charge consultation fee
                  </label>
                  {!appointmentId && (
                    <label className="check">
                      <input type="checkbox" checked={token} onChange={(e) => setToken(e.target.checked)} /> Issue queue token for today
                    </label>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-h">
              <h3>{type === 'opd' ? '3' : '2'} · {type === 'opd' ? 'Extra services' : type === 'lab' ? 'Tests' : 'Medicines'}</h3>
            </div>
            <div className="picker">
              <div className="input-icon">
                <Search />
                <input
                  ref={search}
                  className="input"
                  placeholder={`Search ${Src.noun}…`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches[0]) {
                      e.preventDefault()
                      add(matches[0])
                    }
                  }}
                  aria-label={`Search ${Src.noun}`}
                />
              </div>
              {matches.length > 0 && (
                <div className="picker-list">
                  {matches.map((c) => (
                    <button key={c.id} type="button" disabled={c.stock === 0} onClick={() => add(c)}>
                      <span>
                        <b>{c.name}</b>
                        {c.category && <span className="small muted"> · {c.category}</span>}
                        {c.stock != null && (
                          <span className={`small ${c.stock <= 10 ? '' : 'muted'}`} style={{ color: c.stock <= 10 ? 'var(--rose)' : undefined }}>
                            {' '}
                            · {c.stock} in stock{c.expiry && ` · exp ${fmtDay(c.expiry, { month: 'short', year: '2-digit' })}`}
                          </span>
                        )}
                      </span>
                      <b className="num">{inr(c.price)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length === 0 && !consultFee ? (
              <Empty icon={Src.icon} title="No items yet" text={`Search above and press Enter to add a ${Src.noun}.`} />
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th className="right">Rate</th>
                      <th className="right">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {consultFee > 0 && (
                      <tr>
                        <td><b>Consultation — {doctor!.name}</b></td>
                        <td>1</td>
                        <td className="right num">{inr(consultFee)}</td>
                        <td className="right num bold">{inr(consultFee)}</td>
                        <td />
                      </tr>
                    )}
                    {lines.map((l) => (
                      <tr key={l.key} style={{ animation: 'rise .3s var(--ease)' }}>
                        <td>
                          <b>{l.name}</b>
                          {l.kind === 'custom' && <span className="badge" style={{ marginLeft: 6 }}>custom</span>}
                        </td>
                        <td>
                          <div className="qty">
                            <button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Less"><Minus size={14} /></button>
                            <input value={l.qty} inputMode="numeric" onChange={(e) => setQty(l.key, Number(e.target.value.replace(/\D/g, '')))} aria-label={`Quantity of ${l.name}`} />
                            <button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="More"><Plus size={14} /></button>
                          </div>
                        </td>
                        <td className="right num">{inr(l.rate)}</td>
                        <td className="right num bold">{inr(l.rate * l.qty)}</td>
                        <td className="right">
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.name}`}>
                            <Trash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details style={{ marginTop: 14 }}>
              <summary className="small bold" style={{ cursor: 'pointer', color: 'var(--brand-ink)' }}>+ Add an item not in the list</summary>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <input className="input grow" style={{ minWidth: 180 }} placeholder="Item name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                <input className="input" style={{ width: 130 }} type="number" min="0" step="0.01" placeholder="Rate ₹" value={custom.rate} onChange={(e) => setCustom({ ...custom, rate: e.target.value })} />
                <Button type="button" variant="soft" onClick={addCustom}><Plus /> Add</Button>
              </div>
            </details>
          </section>
        </div>

        <aside className="card summary">
          <div className="card-h">
            <h3><Receipt /> Summary</h3>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between"><span className="muted">Subtotal</span><b className="num">{inr(subtotal)}</b></div>
            <Field label="Discount (₹)">
              <input className="input" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
            <div className="row between" style={{ padding: '12px 0', borderTop: '1px dashed var(--line-2)', borderBottom: '1px dashed var(--line-2)' }}>
              <span className="bold">Total payable</span>
              <span className="total-big num" key={total} style={{ animation: 'pop .35s var(--spring)' }}>{inr(total)}</span>
            </div>
            <Field label="Payment mode">
              <Seg value={mode} onChange={setMode} options={(['cash', 'upi', 'card'] as const).map((m) => {
                const I = MODE_ICON[m]
                return { value: m, label: <><I /> {m.toUpperCase()}</> }
              })} />
            </Field>
            <Field label="Amount received now (₹)" hint={paid == null ? 'Full amount by default — change it for part payment' : undefined}>
              <div className="input-icon">
                <IndianRupee />
                <input className="input" type="number" min="0" step="0.01" value={paid ?? (total / 100).toString()} onChange={(e) => setPaid(e.target.value)} />
              </div>
            </Field>
            {due > 0 && <div className="badge rose" style={{ height: 'auto', padding: '8px 12px' }}>Balance due {inr(due)} — can be collected later from Bills</div>}
            <Button size="lg" busy={busy} onClick={save} disabled={!patient || !subtotal}>
              Save bill · {inr(paidP)}
            </Button>
            <span className="tiny muted" style={{ textAlign: 'center' }}>Ctrl + Enter to save</span>
          </div>
        </aside>
      </div>
      <BillModal id={billId} onClose={() => setBillId(null)} me={me} />
    </div>
  )
}
