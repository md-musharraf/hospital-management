import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ChevronRight, FlaskConical, Pill, Search, Stethoscope, Ticket, UserPlus, X } from 'lucide-react'
import { useApi } from '../api.ts'
import { StatusBadge, fmtDay, inr } from '../ui.tsx'
import { NewPatientModal, type Patient } from './common.tsx'
import type { Me } from './Shell.tsx'
import { billTypesFor } from '../../shared/catalog.ts'

export type Hit = Patient & {
  visits: number
  lastVisit: { date: string; doctor: string } | null
  today: { id: number; token: number; status: string; doctorId: number; doctor: string } | null
  due?: number
}

/** Debounced, cached search (stale results stay on screen while the next ones load). */
export function usePatientSearch(q: string | null, limit = 8) {
  const [dq, setDq] = useState(q ?? '')
  useEffect(() => {
    const t = setTimeout(() => setDq(q ?? ''), 120)
    return () => clearTimeout(t)
  }, [q])
  const { data, loading } = useApi<{ total: number; rows: Hit[] }>(q === null ? null : `/patients?limit=${limit}&q=${encodeURIComponent(dq.trim())}`, 15_000)
  const last = useRef(data)
  if (data) last.current = data
  return { rows: last.current?.rows ?? [], total: last.current?.total ?? 0, loading: loading || dq !== (q ?? '') }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const uhidTerms = (q: string) => q.split(/\s+/).filter((t) => /^p\d/i.test(t)).join(' ')
/** Wraps every typed word inside text with <mark>. */
export function Hl({ text, q }: { text?: string | null; q: string }) {
  const terms = q.trim().split(/\s+/).filter(Boolean).map(esc)
  if (!text || !terms.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

/** One rich suggestion: who, today's token, last visit, dues, and optional quick actions. */
export function HitRow({ hit, q, active, onPick, actions }: { hit: Hit; q: string; active?: boolean; onPick: () => void; actions?: ReactNode }) {
  return (
    <div className={`hit ${active ? 'active' : ''}`} role="option" aria-selected={active} onClick={onPick}>
      <div className="avatar hit-av" aria-hidden>
        {hit.name[0]}
      </div>
      <div className="hit-main">
        <div className="hit-top">
          <b className="ellipsis">
            <Hl text={hit.name} q={q} />
          </b>
          <span className="badge">
            <Hl text={hit.uhid} q={uhidTerms(q)} />
          </span>
          {hit.today && <StatusBadge s={hit.today.status} />}
          {!!hit.due && hit.due > 0 && <span className="badge rose">Due {inr(hit.due)}</span>}
        </div>
        <div className="hit-sub">
          {[hit.age != null && `${hit.age}y`, hit.gender].filter(Boolean).join(' · ')}
          {hit.phone && (
            <>
              {' · '}
              <Hl text={hit.phone} q={q} />
            </>
          )}
          {hit.address && (
            <>
              {' · '}
              <Hl text={hit.address} q={q} />
            </>
          )}
        </div>
        <div className="hit-meta">
          {hit.today ? (
            <span>
              <Ticket size={13} /> Today: token #{hit.today.token} · {hit.today.doctor}
            </span>
          ) : hit.lastVisit ? (
            <span>
              Last visit {fmtDay(hit.lastVisit.date, { day: 'numeric', month: 'short' })} · {hit.lastVisit.doctor}
            </span>
          ) : (
            <span>No visits yet</span>
          )}
          {hit.visits > 0 && <span>{hit.visits} visit{hit.visits > 1 ? 's' : ''}</span>}
        </div>
        {actions && (
          <div className="hit-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

/** Ctrl+K / "/" patient search in the staff top bar with a quick-suggestion panel. */
export default function GlobalSearch({ me }: { me: Me }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const { rows, total, loading } = usePatientSearch(open ? q : null, 8)
  const types = billTypesFor(me.role)
  const canRegister = me.role !== 'doctor'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => input.current?.focus())
      }
    }
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])
  useEffect(() => setHi(0), [q])

  const go = (url: string) => {
    setOpen(false)
    setQ('')
    input.current?.blur()
    nav(url)
  }
  const bill = (h: Hit, type: string) => go(`/staff/billing?type=${type}&patient=${h.id}`)
  const actions = (h: Hit) => (
    <>
      {h.today?.status === 'booked' && types.includes('opd') && (
        <button className="btn btn-primary btn-sm" onClick={() => go(`/staff/billing?type=opd&patient=${h.id}&doctor=${h.today!.doctorId}&appointment=${h.today!.id}`)}>
          <Ticket /> Check in & bill
        </button>
      )}
      {types.includes('opd') && (
        <button className="btn btn-soft btn-sm" onClick={() => bill(h, 'opd')}>
          <Stethoscope /> OPD
        </button>
      )}
      {types.includes('lab') && (
        <button className="btn btn-soft btn-sm" onClick={() => bill(h, 'lab')}>
          <FlaskConical /> Lab
        </button>
      )}
      {types.includes('pharmacy') && (
        <button className="btn btn-soft btn-sm" onClick={() => bill(h, 'pharmacy')}>
          <Pill /> Pharmacy
        </button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => go(`/staff/patients/${h.id}`)}>
        Profile <ChevronRight className="go" />
      </button>
    </>
  )

  return (
    <div className={`gsearch ${open ? 'open' : ''}`} ref={box}>
      <button
        className="btn btn-ghost btn-sm btn-icon gsearch-btn"
        aria-label="Search patients"
        onClick={() => {
          setOpen(true)
          requestAnimationFrame(() => input.current?.focus())
        }}
      >
        <Search />
      </button>
      <div className="gsearch-field">
        <button className="btn btn-ghost btn-sm btn-icon gsearch-back" aria-label="Close search" onClick={() => setOpen(false)}>
          <ArrowLeft />
        </button>
        <div className="input-icon grow">
          <Search />
          <input
            ref={input}
            className="input"
            placeholder="Search patient: name, mobile, UHID, village…"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(0, Math.min(h + (e.key === 'ArrowDown' ? 1 : -1), rows.length - 1)))
              } else if (e.key === 'Enter' && rows[hi]) go(`/staff/patients/${rows[hi].id}`)
              else if (e.key === 'Escape') {
                setOpen(false)
                input.current?.blur()
              }
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls="gsearch-list"
            aria-label="Search patients"
            autoComplete="off"
          />
          {q ? (
            <button
              className="gsearch-clear"
              aria-label="Clear search"
              onClick={() => {
                setQ('')
                input.current?.focus()
              }}
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="gsearch-kbd">Ctrl K</kbd>
          )}
        </div>
      </div>
      {open && (
        <div className="gsearch-panel" id="gsearch-list" role="listbox" aria-label="Patient suggestions">
          <div className="gsearch-h">
            <span>{q.trim() ? `${total} patient${total === 1 ? '' : 's'} match “${q.trim()}”` : 'Recently active patients'}</span>
            {loading && <span className="live-dot" aria-label="Searching" />}
          </div>
          {rows.map((h, i) => (
            <div key={h.id} onMouseEnter={() => setHi(i)}>
              <HitRow hit={h} q={q} active={i === hi} onPick={() => go(`/staff/patients/${h.id}`)} actions={actions(h)} />
            </div>
          ))}
          {!loading && q.trim() && rows.length === 0 && <div className="gsearch-empty">No patient found. Try a part of the name, the last 4 digits of the mobile, or the UHID.</div>}
          <div className="gsearch-f">
            {total > rows.length && (
              <button className="btn btn-ghost btn-sm" onClick={() => go(`/staff/patients?q=${encodeURIComponent(q.trim())}`)}>
                See all {total} results <ChevronRight className="go" />
              </button>
            )}
            {canRegister && (
              <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
                <UserPlus /> Register {q.trim() && !/\d{4,}/.test(q) ? `“${q.trim()}”` : 'new patient'}
              </button>
            )}
            <span className="tiny muted hide-sm" style={{ marginLeft: 'auto' }}>
              ↑↓ to move · Enter to open · Esc to close
            </span>
          </div>
        </div>
      )}
      <NewPatientModal
        open={adding}
        onClose={() => setAdding(false)}
        initialName={/\d/.test(q) ? '' : q.trim()}
        initialPhone={/^\d+$/.test(q.trim()) ? q.trim() : ''}
        onCreated={(p) => go(`/staff/patients/${p.id}`)}
      />
    </div>
  )
}

/** Billing / booking patient field: same search + suggestions, picks a patient instead of navigating. */
export function PatientPicker({ value, onChange, autoFocus }: { value: Patient | null; onChange: (p: Patient | null) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { rows, total, loading } = usePatientSearch(open ? q : null, 8)

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => setHi(0), [q])

  if (value)
    return (
      <div className="selected-patient">
        <div className="avatar" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 15, background: 'var(--grad)' }}>
          {value.name[0]}
        </div>
        <div className="grow">
          <b>{value.name}</b>
          <div className="small muted">
            {[value.uhid, value.age != null && `${value.age}y`, value.gender, value.phone].filter(Boolean).join(' · ')}
          </div>
          {(value as Hit).due! > 0 && <span className="badge rose" style={{ marginTop: 4 }}>Previous due {inr((value as Hit).due!)}</span>}
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(null)} aria-label="Change patient">
          <X />
        </button>
      </div>
    )

  const pick = (p: Patient) => {
    onChange(p)
    setOpen(false)
    setQ('')
  }
  return (
    <div className="picker" ref={box}>
      <div className="row">
        <div className="input-icon grow">
          <Search />
          <input
            className="input"
            placeholder="Search by name, mobile, UHID or village…"
            value={q}
            autoFocus={autoFocus}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(0, Math.min(h + (e.key === 'ArrowDown' ? 1 : -1), rows.length - 1)))
              } else if (e.key === 'Enter' && rows[hi]) {
                e.preventDefault()
                pick(rows[hi])
              } else if (e.key === 'Escape') setOpen(false)
            }}
            role="combobox"
            aria-expanded={open}
            aria-label="Search patient"
            autoComplete="off"
          />
        </div>
        <button type="button" className="btn btn-soft" onClick={() => setAdding(true)}>
          <UserPlus /> New
        </button>
      </div>
      {open && (
        <div className="picker-list hits" role="listbox">
          <div className="gsearch-h">
            <span>{q.trim() ? `${total} match${total === 1 ? '' : 'es'}` : 'Recently active'}</span>
            {loading && <span className="live-dot" />}
          </div>
          {rows.map((h, i) => (
            <div key={h.id} onMouseEnter={() => setHi(i)}>
              <HitRow hit={h} q={q} active={i === hi} onPick={() => pick(h)} />
            </div>
          ))}
          {!loading && q.trim() && rows.length === 0 && (
            <div className="gsearch-empty">
              No match.{' '}
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
                <UserPlus /> Register “{q.trim()}”
              </button>
            </div>
          )}
        </div>
      )}
      <NewPatientModal open={adding} onClose={() => setAdding(false)} initialName={/\d/.test(q) ? '' : q.trim()} initialPhone={/^\d+$/.test(q.trim()) ? q.trim() : ''} onCreated={pick} />
    </div>
  )
}
