import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, HeartPulse, IndianRupee, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'

// ---- formatting ----
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 })
export const inr = (paise: number) => inrFmt.format((paise || 0) / 100)
export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(day.length === 10 ? day + 'T12:00:00' : day).toLocaleDateString('en-IN', opts)
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
export const fmtDateTime = (iso: string) => `${fmtDay(iso, { day: 'numeric', month: 'short' })}, ${fmtTime(iso)}`
export const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return fmtDay(iso, { day: 'numeric', month: 'short' })
}
export const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// ---- toasts ----
type Toast = { id: number; title: string; text?: string; kind: 'info' | 'success' | 'error' | 'money'; out?: boolean }
let toastSubs: ((t: Toast[]) => void) | null = null
let toasts: Toast[] = []
let tid = 0
export function toast(title: string, kind: Toast['kind'] = 'success', text?: string) {
  const t = { id: ++tid, title, text, kind }
  toasts = [...toasts.slice(-3), t]
  toastSubs?.(toasts)
  setTimeout(() => {
    toasts = toasts.map((x) => (x.id === t.id ? { ...x, out: true } : x))
    toastSubs?.(toasts)
  }, 4000)
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    toastSubs?.(toasts)
  }, 4300)
}
export const toastError = (e: unknown) => toast((e as Error).message || 'Something went wrong', 'error')

const TOAST_ICON = { info: Info, success: CircleCheck, error: TriangleAlert, money: IndianRupee }
export function Toasts() {
  const [list, set] = useState<Toast[]>([])
  useEffect(() => {
    toastSubs = set
    return () => void (toastSubs = null)
  }, [])
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => {
        const Icon = TOAST_ICON[t.kind]
        return (
          <div key={t.id} className={`toast ${t.kind} ${t.out ? 'out' : ''}`}>
            <span className="ic">
              <Icon />
            </span>
            <div>
              <b>{t.title}</b>
              {t.text && <span>{t.text}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---- modal on native <dialog>: focus trap, Esc and backdrop for free ----
export function Modal(p: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    if (p.open && !d.open) d.showModal()
    if (!p.open && d.open) d.close()
  }, [p.open])
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${p.wide ? 'wide' : ''}`}
      onClose={p.onClose}
      onClick={(e) => e.target === ref.current && p.onClose()}
      onCancel={(e) => {
        e.preventDefault()
        p.onClose()
      }}
    >
      {p.open && (
        <>
          <div className="modal-h">
            <h3>{p.title}</h3>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={p.onClose} aria-label="Close">
              <X />
            </button>
          </div>
          <div className="modal-b">{p.children}</div>
          {p.footer && <div className="modal-f">{p.footer}</div>}
        </>
      )}
    </dialog>,
    document.body,
  )
}

// ---- small pieces ----
export function Field(p: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={`field ${p.className ?? ''}`}>
      <span>{p.label}</span>
      {p.children}
      {p.hint && <small className="muted tiny">{p.hint}</small>}
    </label>
  )
}

export function Button(p: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: string; size?: 'sm' | 'lg' }) {
  const { busy, variant = 'primary', size, className, children, disabled, ...rest } = p
  return (
    <button className={`btn btn-${variant} ${size ? 'btn-' + size : ''} ${className ?? ''}`} disabled={disabled || busy} {...rest}>
      {busy && <LoaderCircle className="spin" />}
      {children}
    </button>
  )
}

export function Empty(p: { icon: React.ComponentType; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p.icon />
      <b style={{ color: 'var(--ink-2)' }}>{p.title}</b>
      {p.text && <span className="small">{p.text}</span>}
      {p.children}
    </div>
  )
}

export const Skeleton = ({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />

export function PageLoader() {
  return (
    <div className="page-loader">
      <div className="pulse-logo">
        <HeartPulse />
      </div>
    </div>
  )
}

const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Animated number that eases from its previous value — makes live updates visible. */
export function useCountUp(value: number, ms = 800) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (prefersReduced()) return setShown(value)
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value, ms])
  return shown
}

export function CountUp({ value, money }: { value: number; money?: boolean }) {
  const v = useCountUp(value)
  return <span className="num">{money ? inr(Math.round(v / 100) * 100) : Math.round(v).toLocaleString('en-IN')}</span>
}

/** Adds .in to [data-reveal] children as they scroll into view. */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.in)')
    if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'))
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in')
            io.unobserve(en.target)
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export function Seg<T extends string>(p: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={p.value === o.value} onClick={() => p.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const STATUS_BADGE: Record<string, [string, string]> = {
  booked: ['violet', 'Booked online'],
  waiting: ['amber', 'Waiting'],
  called: ['green', 'With doctor'],
  done: ['brand', 'Done'],
  skipped: ['rose', 'Skipped'],
  cancelled: ['', 'Cancelled'],
  pending: ['amber', 'Sample pending'],
  collected: ['violet', 'Sample collected'],
  ready: ['green', 'Report ready'],
}
export function StatusBadge({ s }: { s: string }) {
  const [c, l] = STATUS_BADGE[s] ?? ['', s]
  return (
    <span className={`badge ${c}`}>
      <span className="dot" />
      {l}
    </span>
  )
}

export function BillStatus({ b }: { b: { status: string; total: number; paid: number } }) {
  if (b.status === 'cancelled') return <span className="badge">Cancelled</span>
  if (b.paid >= b.total) return <span className="badge green">Paid</span>
  if (b.paid > 0) return <span className="badge amber">Part paid</span>
  return <span className="badge rose">Due</span>
}
