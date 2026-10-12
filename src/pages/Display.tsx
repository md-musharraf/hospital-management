import { useCallback, useEffect, useState } from 'react'
import { Maximize, Volume2, VolumeX } from 'lucide-react'
import { useApi, usePublicQueue } from '../api.ts'
import type { Site } from './Landing.tsx'

type Announce = { token: number; doctor: string; room: string; doctorId: number }

/** Waiting-hall TV: big tokens, live updates, spoken announcements (no patient names — privacy). */
export default function Display() {
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const [voice, setVoice] = useState(false)
  const [call, setCall] = useState<Announce | null>(null)
  const [now, setNow] = useState(new Date())

  const onAnnounce = useCallback(
    (a: Announce) => {
      setCall(a)
      setTimeout(() => setCall((c) => (c === a ? null : c)), 7000)
      if (voice && 'speechSynthesis' in window) {
        const text = `Token number ${a.token}, please go to ${a.doctor.replace(/^Dr\.?/i, 'Doctor')}${a.room ? `, room ${a.room}` : ''}.`
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'en-IN'
        u.rate = 0.92
        speechSynthesis.cancel()
        speechSynthesis.speak(u)
        setTimeout(() => speechSynthesis.speak(new SpeechSynthesisUtterance(text)), 4500)
      }
    },
    [voice],
  )
  const queue = usePublicQueue(onAnnounce)
  const active = (queue ?? []).filter((q) => q.current || q.waiting || q.booked || q.done)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    document.title = 'Queue display'
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(80% 60% at 80% 0%, #12304e 0%, #0b1f33 60%)', color: '#fff', padding: 'clamp(16px,3vw,36px)' }}>
      <header className="row between wrap" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 'clamp(22px,2.6vw,34px)', fontWeight: 800 }}>{site?.settings.name}</div>
          <div className="row" style={{ opacity: 0.7, gap: 8 }}>
            <span className="live-dot" /> Live OPD queue · Please wait for your token to be called
          </div>
        </div>
        <div className="row">
          <div className="num" style={{ fontSize: 'clamp(26px,3vw,42px)', fontWeight: 800 }}>
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button className="btn btn-ghost btn-icon" style={{ color: '#fff' }} onClick={() => setVoice(!voice)} title={voice ? 'Mute announcements' : 'Turn on voice announcements'}>
            {voice ? <Volume2 /> : <VolumeX />}
          </button>
          <button className="btn btn-ghost btn-icon" style={{ color: '#fff' }} onClick={() => document.documentElement.requestFullscreen?.()} title="Full screen">
            <Maximize />
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 18 }}>
        {active.map((q) => (
          <div key={q.doctorId} style={{ borderRadius: 24, padding: 22, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', boxShadow: call?.doctorId === q.doctorId ? '0 0 0 3px #5eead4' : 'none', transition: 'box-shadow .4s' }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{q.doctor}</div>
            <div style={{ opacity: 0.65, fontSize: 14 }}>
              {q.department}
              {q.room && ` · Room ${q.room}`}
            </div>
            <div style={{ marginTop: 16, opacity: 0.6, fontSize: 13, fontWeight: 700, letterSpacing: '.08em' }}>NOW SERVING</div>
            <div key={q.current ?? 'none'} className="num" style={{ fontSize: 76, fontWeight: 800, lineHeight: 1, color: q.current ? '#5eead4' : 'rgba(255,255,255,.3)', animation: 'pop .7s var(--spring)' }}>
              {q.current ? `#${q.current}` : '—'}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ opacity: 0.6, fontSize: 13 }}>Next:</span>
              {q.next.length ? q.next.map((n) => <span key={n} className="num" style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,.1)', fontWeight: 800 }}>#{n}</span>) : <span style={{ opacity: 0.5 }}>—</span>}
              <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 13 }}>{q.waiting} waiting</span>
            </div>
          </div>
        ))}
        {queue && active.length === 0 && <div style={{ opacity: 0.6, fontSize: 22 }}>No OPD running right now.</div>}
      </div>

      {call && (
        <div role="alert" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,31,51,.75)', backdropFilter: 'blur(6px)', animation: 'fade-in .3s' }}>
          <div style={{ textAlign: 'center', padding: '40px 60px', borderRadius: 32, background: 'var(--grad)', boxShadow: '0 40px 100px -20px rgba(0,0,0,.6)', animation: 'pop .6s var(--spring)' }}>
            <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}>Token number</div>
            <div className="num" style={{ fontSize: 'clamp(90px,16vw,180px)', fontWeight: 800, lineHeight: 1 }}>#{call.token}</div>
            <div style={{ fontSize: 'clamp(20px,3vw,32px)', fontWeight: 800 }}>
              {call.doctor}
              {call.room && ` · Room ${call.room}`}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
