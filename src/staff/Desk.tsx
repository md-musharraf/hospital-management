import { useEffect, useState } from 'react'
import { BellRing, CheckCheck, ChevronRight, IndianRupee, Megaphone, NotebookPen, SkipForward, Stethoscope, UserRound, Users } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, CountUp, Empty, Skeleton, StatusBadge, fmtDay, fmtTime, toast, toastError } from '../ui.tsx'
import { useMe } from './Shell.tsx'

type Appt = { id: number; token: number; status: string; source: string; notes: string; called_at: string | null; patient_id: number; name: string; age: number | null; gender: string; phone: string; visits_before: number }
type DeskData = { doctor: { id: number; name: string; department: string; room: string; start_time: string; end_time: string }; appointments: Appt[]; income: number; week: { day: string; patients: number }[]; doctors: { id: number; name: string }[] }

export default function Desk() {
  const me = useMe()
  const [doctorId, setDoctorId] = useState<string>('')
  const { data: d, error } = useApi<DeskData>(`/desk${doctorId ? `?doctorId=${doctorId}` : ''}`, 5_000)
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState('')

  const current = d?.appointments.find((a) => a.status === 'called')
  const waiting = d?.appointments.filter((a) => a.status === 'waiting') ?? []
  const booked = d?.appointments.filter((a) => a.status === 'booked') ?? []
  const done = d?.appointments.filter((a) => a.status === 'done') ?? []
  useEffect(() => setNotes(current?.notes ?? ''), [current?.id, current?.notes])

  async function run(label: string, fn: () => Promise<any>, ok?: string) {
    setBusy(label)
    try {
      if (current && notes !== current.notes && (label === 'next' || label === 'done')) await api(`/appointments/${current.id}/notes`, { notes }, 'PUT')
      const r = await fn()
      if (ok) toast(ok)
      invalidate('/desk', '/queue')
      return r
    } catch (e) {
      toastError(e)
    } finally {
      setBusy('')
    }
  }
  const next = () =>
    d &&
    run('next', async () => {
      const r = await api<{ called: Appt | null }>(`/queue/${d.doctor.id}/next`, {})
      toast(r.called ? `Calling token #${r.called.token}` : 'Queue is empty', r.called ? 'success' : 'info')
    })

  // Keyboard: N = next patient (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !(e.target as HTMLElement).closest('input,textarea,select') && !e.metaKey && !e.ctrlKey) next()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (error) return <Empty icon={Stethoscope} title="Doctor desk unavailable" text={error.message} />
  if (!d) return <Skeleton h={300} r={20} />
  const maxWeek = Math.max(...d.week.map((w) => w.patients), 1)

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>{d.doctor.name}</h2>
          <p>
            {d.doctor.department} · Room {d.doctor.room || '—'} · OPD {d.doctor.start_time}–{d.doctor.end_time}
          </p>
        </div>
        {me.role === 'owner' && (
          <select className="select" style={{ width: 240 }} value={doctorId || d.doctor.id} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
            {d.doctors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="kpis stagger">
        <div className="kpi hero">
          <div className="ic"><Users /></div>
          <div className="label">Seen today</div>
          <div className="value"><CountUp value={done.length} /> <span style={{ fontSize: 16, opacity: 0.75 }}>/ {d.appointments.length}</span></div>
          <div className="sub">{d.appointments.length - done.length} still to go</div>
        </div>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--amber-50)', color: 'var(--amber)' }}><BellRing /></div>
          <div className="label">Waiting now</div>
          <div className="value"><CountUp value={waiting.length} /></div>
          <div className="sub">{booked.length} booked online, not arrived</div>
        </div>
        <div className="kpi">
          <div className="ic" style={{ background: 'var(--green-50)', color: 'var(--green)' }}><IndianRupee /></div>
          <div className="label">My consultations today</div>
          <div className="value"><CountUp value={d.income} money /></div>
          <div className="sub">Collected at reception</div>
        </div>
        <div className="kpi">
          <div className="label" style={{ marginBottom: 10 }}>Patients seen · 7 days</div>
          <div className="row" style={{ alignItems: 'flex-end', height: 70, gap: 6 }} role="img" aria-label={d.week.map((w) => `${w.day}: ${w.patients}`).join(', ')}>
            {d.week.map((w) => (
              <div key={w.day} title={`${fmtDay(w.day, { weekday: 'short', day: 'numeric' })}: ${w.patients}`} style={{ flex: 1, display: 'grid', gap: 4, justifyItems: 'center' }}>
                <div style={{ width: '100%', maxWidth: 18, height: Math.max(4, (w.patients / maxWeek) * 52), background: 'var(--brand)', borderRadius: '4px 4px 0 0', transition: 'height .8s var(--ease)' }} />
                <span className="tiny muted">{fmtDay(w.day, { weekday: 'narrow' })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="desk-grid">
        <section className="now-card">
          <div className="row between">
            <span className="badge" style={{ background: 'rgba(255,255,255,.1)', color: '#5eead4' }}>
              <span className="live-dot" /> With you now
            </span>
            <span className="small" style={{ opacity: 0.6 }}>Press N for next patient</span>
          </div>
          {current ? (
            <div key={current.id} style={{ animation: 'rise .5s var(--ease)' }}>
              <div className="row" style={{ marginTop: 18, gap: 18, alignItems: 'flex-start' }}>
                <div className="now-token num">#{current.token}</div>
                <div className="grow">
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{current.name}</div>
                  <div style={{ opacity: 0.75 }}>
                    {[current.age != null && `${current.age} yrs`, current.gender, current.phone].filter(Boolean).join(' · ')}
                  </div>
                  <span className="badge" style={{ marginTop: 8, background: current.visits_before ? 'rgba(99,102,241,.25)' : 'rgba(94,234,212,.2)', color: '#fff' }}>
                    {current.visits_before ? `Follow-up · ${current.visits_before} earlier visit${current.visits_before > 1 ? 's' : ''}` : 'First visit'}
                  </span>
                </div>
              </div>
              <label className="field" style={{ marginTop: 18 }}>
                <span style={{ color: 'rgba(255,255,255,.7)' }}>
                  <NotebookPen size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Consultation notes (saved with the visit)
                </span>
                <textarea className="textarea" style={{ background: 'rgba(255,255,255,.06)', borderColor: 'rgba(255,255,255,.15)', color: '#fff' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Complaints, findings, advice, medicines…" />
              </label>
              <div className="row wrap" style={{ marginTop: 14 }}>
                <Button busy={busy === 'next'} onClick={next}>
                  Next patient <ChevronRight className="go" />
                </Button>
                <Button variant="ghost" style={{ color: '#fff' }} busy={busy === 'recall'} onClick={() => run('recall', () => api(`/appointments/${current.id}/recall`, {}), 'Announced again on the display')}>
                  <Megaphone /> Recall
                </Button>
                <Button variant="ghost" style={{ color: '#fff' }} busy={busy === 'done'} onClick={() => run('done', () => api(`/appointments/${current.id}/done`, {}), 'Marked done')}>
                  <CheckCheck /> Done
                </Button>
                <Button variant="ghost" style={{ color: '#fff' }} busy={busy === 'skip'} onClick={() => run('skip', () => api(`/appointments/${current.id}/skip`, {}), 'Skipped')}>
                  <SkipForward /> Not present
                </Button>
                {notes !== current.notes && (
                  <Button variant="soft" busy={busy === 'save'} onClick={() => run('save', () => api(`/appointments/${current.id}/notes`, { notes }, 'PUT'), 'Notes saved')}>
                    Save notes
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <UserRound size={44} style={{ margin: '0 auto', opacity: 0.4 }} />
              <p style={{ margin: '12px 0 18px', opacity: 0.75 }}>{waiting.length ? `${waiting.length} patient${waiting.length > 1 ? 's' : ''} waiting` : 'Nobody is waiting right now'}</p>
              <Button size="lg" busy={busy === 'next'} disabled={!waiting.length} onClick={next}>
                Call next patient <ChevronRight className="go" />
              </Button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-h">
            <h3><Users /> Today's queue</h3>
            <span className="badge">{waiting.length} waiting</span>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {[...waiting, ...booked].map((a) => (
              <div key={a.id} className={`token-row ${a.status}`}>
                <span className="tok">#{a.token}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>{a.name}</b>
                  <span className="tiny muted">
                    {[a.age != null && `${a.age}y`, a.gender, a.visits_before ? 'Follow-up' : 'New'].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {a.status === 'waiting' ? (
                  <button className="btn btn-soft btn-sm" disabled={!!busy} onClick={() => run('call' + a.id, () => api(`/appointments/${a.id}/call`, {}), `Calling #${a.token}`)}>
                    Call
                  </button>
                ) : (
                  <StatusBadge s={a.status} />
                )}
              </div>
            ))}
            {!waiting.length && !booked.length && <Empty icon={Users} title="Queue is clear" />}
            {done.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small bold" style={{ cursor: 'pointer', color: 'var(--ink-3)' }}>Seen today ({done.length})</summary>
                {done.map((a) => (
                  <div key={a.id} className="token-row">
                    <span className="tok">#{a.token}</span>
                    <span className="grow small">{a.name}</span>
                    <span className="tiny muted">{a.called_at && fmtTime(a.called_at)}</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
