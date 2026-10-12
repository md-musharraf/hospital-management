import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { BellRing, Clock, DoorOpen, Stethoscope } from 'lucide-react'
import { api, useApi, usePublicQueue } from '../api.ts'
import { Empty, PageLoader, StatusBadge, fmtDay } from '../ui.tsx'
import { PublicTop } from './Legal.tsx'
import type { Site } from './Landing.tsx'
import './landing.css'

type T = { code: string; token: number; date: string; status: string; patient: string; doctor: string; room: string; startTime: string; ahead: number; current: number | null; doctorId: number; today: string }

export default function Track() {
  const { code = '' } = useParams()
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const [t, setT] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const queue = usePublicQueue()
  const prev = useRef<string>('')

  useEffect(() => {
    api<T>(`/public/track/${encodeURIComponent(code)}`).then(
      (x) => {
        setT(x)
        // buzz the phone when it becomes your turn
        if (prev.current && prev.current !== 'called' && x.status === 'called') navigator.vibrate?.([300, 120, 300])
        prev.current = x.status
      },
      (e) => setErr(e.message),
    )
  }, [code, queue])

  useEffect(() => {
    if (t) document.title = `Token #${t.token} · ${t.status === 'called' ? "It's your turn!" : `${t.ahead} ahead`}`
  }, [t])

  if (err) return (<><PublicTop s={site?.settings} /><Empty icon={Clock} title="Token not found" text={err} /></>)
  if (!t) return <PageLoader />
  const yourTurn = t.status === 'called'
  const isToday = t.date === t.today
  const progress = t.status === 'done' || yourTurn ? 100 : Math.max(6, 100 - t.ahead * 12)

  return (
    <>
      <PublicTop s={site?.settings} />
      <main className="wrap page" style={{ maxWidth: 560, paddingBottom: 60 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--sh-3)' }}>
          <div style={{ background: yourTurn ? 'linear-gradient(135deg,#059669,#10b981)' : 'var(--navy)', color: '#fff', padding: '30px 24px', textAlign: 'center', transition: 'background .6s' }}>
            <div className="small" style={{ opacity: 0.75 }}>Hi {t.patient}, your token</div>
            <div key={t.status} style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', animation: 'pop .6s var(--spring)' }} className="num">
              #{t.token}
            </div>
            {yourTurn ? (
              <div className="row" style={{ justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                <BellRing /> It’s your turn — please go in
              </div>
            ) : (
              <div style={{ opacity: 0.85 }}>
                {t.status === 'done' ? 'Consultation completed' : t.status === 'cancelled' ? 'This booking was cancelled' : t.status === 'skipped' ? 'You missed your turn — please meet reception' : isToday ? (t.ahead === 0 ? "You're next 🔔" : `${t.ahead} patient${t.ahead > 1 ? 's' : ''} ahead of you`) : `Booked for ${fmtDay(t.date, { weekday: 'long', day: 'numeric', month: 'short' })}`}
              </div>
            )}
          </div>
          <div style={{ padding: 24 }} className="stack">
            {isToday && ['booked', 'waiting', 'called'].includes(t.status) && (
              <div>
                <div className="row between small" style={{ marginBottom: 8 }}>
                  <span className="muted">Now serving</span>
                  <b className="num" style={{ fontSize: 18 }}>{t.current ? `#${t.current}` : 'Not started'}</b>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: '#eef2f7', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--grad)', borderRadius: 99, transition: 'width .8s var(--ease)' }} />
                </div>
              </div>
            )}
            <div className="row">
              <Stethoscope size={18} className="muted" /> <b>{t.doctor}</b>
            </div>
            <div className="row small">
              <DoorOpen size={18} className="muted" /> {t.room ? `Room ${t.room}` : 'Ask reception for the room'} · OPD from {t.startTime}
            </div>
            <div className="row between">
              <StatusBadge s={t.status} />
              <span className="badge green">
                <span className="live-dot" /> Updates live
              </span>
            </div>
            {t.status === 'booked' && <p className="small muted">Please check in at reception when you arrive and pay the consultation fee. Keep this page open — it updates by itself.</p>}
          </div>
        </div>
      </main>
    </>
  )
}
