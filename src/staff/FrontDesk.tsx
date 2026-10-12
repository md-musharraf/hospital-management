import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarPlus, ChevronRight, Monitor, Receipt, RotateCcw, SkipForward, Ticket, UserPlus } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, Modal, Skeleton, StatusBadge, localDay, toast, toastError } from '../ui.tsx'
import { NewPatientModal, PatientPicker, type Patient } from './common.tsx'

type QAppt = { id: number; code: string; token: number; status: string; source: string; patient_id: number; name: string; age: number | null; gender: string; phone: string; billed: number }
type QDoc = { id: number; name: string; room: string; start_time: string; end_time: string; fee: number; department: string; appointments: QAppt[] }

const SOURCE: Record<string, string> = { web: '🌐 Web', whatsapp: '💬 WhatsApp', reception: '' }

export default function FrontDesk() {
  const nav = useNavigate()
  const [date, setDate] = useState(localDay())
  const { data } = useApi<{ date: string; doctors: QDoc[] }>(`/queue?date=${date}`, 5_000)
  const [reg, setReg] = useState(false)
  const [later, setLater] = useState(false)
  const isToday = date === localDay()

  async function act(id: number, action: string) {
    try {
      await api(`/appointments/${id}/${action}`, {})
      invalidate('/queue')
    } catch (e) {
      toastError(e)
    }
  }
  async function next(doctorId: number) {
    try {
      const r = await api<{ called: QAppt | null }>(`/queue/${doctorId}/next`, {})
      toast(r.called ? `Token #${r.called.token} called` : 'Nobody waiting', r.called ? 'success' : 'info')
      invalidate('/queue')
    } catch (e) {
      toastError(e)
    }
  }
  const bill = (a: QAppt, d: QDoc) => nav(`/staff/billing?type=opd&patient=${a.patient_id}&doctor=${d.id}&appointment=${a.id}`)

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Front desk</h2>
          <p>Check in online bookings, issue tokens and keep every doctor's queue moving.</p>
        </div>
        <div className="toolbar">
          <input type="date" className="input" value={date} min={localDay()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Queue date" />
          <a className="btn" href="/display" target="_blank" rel="noreferrer">
            <Monitor /> TV display
          </a>
          <Button variant="soft" onClick={() => setLater(true)}>
            <CalendarPlus /> Book for later
          </Button>
          <Button variant="ghost" onClick={() => setReg(true)}>
            <UserPlus /> Register
          </Button>
          <Link className="btn btn-primary" to="/staff/billing?type=opd">
            <Receipt /> New OPD bill + token
          </Link>
        </div>
      </div>

      {!data ? (
        <div className="board">{[0, 1, 2].map((i) => <Skeleton key={i} h={260} r={20} />)}</div>
      ) : data.doctors.length === 0 ? (
        <Empty icon={Ticket} title="No OPD on this day" />
      ) : (
        <div className="board stagger">
          {data.doctors.map((d) => {
            const current = d.appointments.find((a) => a.status === 'called')
            const waiting = d.appointments.filter((a) => a.status === 'waiting').length
            return (
              <section key={d.id} className="card hover-lift">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 16 }} className="ellipsis">{d.name}</h3>
                    <div className="small muted">
                      {d.department} · Room {d.room || '—'} · {d.start_time}–{d.end_time}
                    </div>
                  </div>
                  <div className="right">
                    <div className="tiny muted">Now</div>
                    <b key={current?.token ?? 0} className="num" style={{ fontSize: 22, color: 'var(--brand-ink)', display: 'inline-block', animation: 'pop .5s var(--spring)' }}>
                      {current ? `#${current.token}` : '—'}
                    </b>
                  </div>
                </div>
                <div className="row wrap" style={{ margin: '12px 0', gap: 6 }}>
                  <span className="badge amber">{waiting} waiting</span>
                  <span className="badge violet">{d.appointments.filter((a) => a.status === 'booked').length} booked</span>
                  <span className="badge brand">{d.appointments.filter((a) => a.status === 'done').length} done</span>
                  {isToday && (
                    <button className="btn btn-soft btn-sm" style={{ marginLeft: 'auto' }} disabled={!waiting} onClick={() => next(d.id)}>
                      Call next <ChevronRight className="go" />
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 340, overflowY: 'auto', margin: '0 -8px' }}>
                  {d.appointments.filter((a) => a.status !== 'done').map((a) => (
                    <div key={a.id} className={`token-row ${a.status}`}>
                      <span className="tok">#{a.token}</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b className="ellipsis" style={{ display: 'block', fontSize: 14 }}>{a.name}</b>
                        <span className="tiny muted">
                          {[a.age != null && `${a.age}y`, a.gender, SOURCE[a.source]].filter(Boolean).join(' · ')}
                          {!a.billed && a.status !== 'booked' && <b style={{ color: 'var(--rose)' }}> · not billed</b>}
                        </span>
                      </div>
                      {a.status === 'booked' && isToday && (
                        <button className="btn btn-primary btn-sm" onClick={() => bill(a, d)}>Check in & bill</button>
                      )}
                      {a.status === 'booked' && !isToday && <StatusBadge s="booked" />}
                      {a.status === 'waiting' && (
                        <>
                          {!a.billed && <button className="btn btn-soft btn-sm" onClick={() => bill(a, d)}>Bill</button>}
                          <button className="btn btn-ghost btn-sm btn-icon" title="Skip (not present)" aria-label={`Skip token ${a.token}`} onClick={() => act(a.id, 'skip')}><SkipForward /></button>
                        </>
                      )}
                      {a.status === 'called' && <StatusBadge s="called" />}
                      {a.status === 'skipped' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => act(a.id, 'requeue')}><RotateCcw /> Re-queue</button>
                      )}
                    </div>
                  ))}
                  {d.appointments.filter((a) => a.status !== 'done').length === 0 && <p className="small muted" style={{ padding: '8px 10px' }}>No pending tokens.</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <NewPatientModal open={reg} onClose={() => setReg(false)} onCreated={(p) => nav(`/staff/billing?type=opd&patient=${p.id}`)} />
      <BookLater open={later} onClose={() => setLater(false)} />
    </div>
  )
}

function BookLater({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: doctors } = useApi<{ id: number; name: string; days: string }[]>(open ? '/catalog/doctors' : null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState(localDay())
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!patient) return toast('Pick a patient', 'error')
    setBusy(true)
    try {
      const a = await api<{ token: number; existing: boolean }>('/appointments', { patientId: patient.id, doctorId: Number(doctorId), date })
      toast(a.existing ? `Already booked — token #${a.token}` : `Booked token #${a.token}`)
      invalidate('/queue')
      setPatient(null)
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  const doc = doctors?.find((d) => String(d.id) === doctorId)
  return (
    <Modal open={open} onClose={onClose} title="Book a token for a later date">
      <form className="stack" onSubmit={submit}>
        <PatientPicker value={patient} onChange={setPatient} />
        <div className="grid-2">
          <Field label="Doctor">
            <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
              <option value="">Choose…</option>
              {doctors?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Date" hint={doc ? `OPD days: ${doc.days}` : undefined}>
            <input className="input" type="date" min={localDay()} value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <Button busy={busy}>Book token</Button>
      </form>
    </Modal>
  )
}
