import { useState } from 'react'
import { fmtDay, inr } from '../ui.tsx'

type Point = { day: string; income: number; expense: number; visits: number }
const SERIES = [
  { key: 'income', label: 'Income', color: '#0d9488' },
  { key: 'expense', label: 'Expense', color: '#e11d48' },
] as const

// Bar with a 4px rounded top, flat on the baseline.
const bar = (x: number, y: number, w: number, h: number) => {
  if (h <= 0) return ''
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}
const nice = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v) ?? v
}
const short = (paise: number) => {
  const r = paise / 100
  return r >= 100000 ? `₹${+(r / 100000).toFixed(1)}L` : r >= 1000 ? `₹${+(r / 1000).toFixed(1)}k` : `₹${r}`
}

/** 14-day income vs expense, grouped bars, one axis, hover tooltip, hidden data table. */
export default function IncomeChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 240
  const pad = { l: 52, r: 8, t: 12, b: 28 }
  const max = nice(Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1))
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const slot = iw / data.length
  const bw = Math.min(14, (slot - 10) / 2)
  const y = (v: number) => pad.t + ih - (Math.max(v, 0) / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max)

  return (
    <div style={{ position: 'relative' }}>
      <div className="row small" style={{ gap: 16, marginBottom: 8 }} aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="row" style={{ gap: 6, color: 'var(--ink-2)', fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Income and expense, last 14 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {short(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = pad.l + i * slot + (slot - bw * 2 - 2) / 2
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${fmtDay(d.day)}: income ${inr(d.income)}, expense ${inr(d.expense)}`}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? 'rgba(11,31,51,.04)' : 'transparent'} />
              <path className="bar" d={bar(x0, y(d.income), bw, pad.t + ih - y(d.income))} fill={SERIES[0].color} />
              <path className="bar" d={bar(x0 + bw + 2, y(d.expense), bw, pad.t + ih - y(d.expense))} fill={SERIES[1].color} />
              {(i % 2 === data.length % 2 || data.length < 8) && (
                <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                  {fmtDay(d.day, { day: 'numeric', month: 'short' })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(Math.max(data[hover].income, data[hover].expense)) / H) * 100}%` }}>
          <b>{fmtDay(data[hover].day, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <div>Income {inr(data[hover].income)}</div>
          <div>Expense {inr(data[hover].expense)}</div>
          <div style={{ opacity: 0.7 }}>{data[hover].visits} OPD visits</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Daily income and expense</caption>
        <thead>
          <tr><th>Day</th><th>Income</th><th>Expense</th><th>Visits</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}><td>{d.day}</td><td>{inr(d.income)}</td><td>{inr(d.expense)}</td><td>{d.visits}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
