import { useState, type FormEvent } from 'react'
import { Plus, Trash, Wallet } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, Seg, Skeleton, fmtDay, inr, localDay, toast, toastError } from '../ui.tsx'
import { useMe } from './Shell.tsx'
import { EXPENSE_CATEGORIES } from '../../shared/catalog.ts'

type Expense = { id: number; day: string; category: string; description: string; amount: number; mode: string; created_by_name: string }

export default function Expenses() {
  const me = useMe()
  const today = localDay()
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const { data } = useApi<Expense[]>(`/expenses?from=${from}&to=${to}`)
  const blank = { day: today, category: EXPENSE_CATEGORIES[0], description: '', amount: '', mode: 'cash' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)

  const total = (data ?? []).reduce((s, e) => s + e.amount, 0)
  const byCat = Object.entries((data ?? []).reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + e.amount), m), {})).sort((a, b) => b[1] - a[1])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/expenses', { ...f, amount: Number(f.amount) })
      toast(`Expense ${inr(Number(f.amount) * 100)} added`, 'success', 'Owner dashboard updated')
      setF({ ...blank, category: f.category, day: f.day })
      invalidate('/expenses', '/dashboard')
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  async function remove(x: Expense) {
    if (!confirm(`Delete ${x.category} ${inr(x.amount)}?`)) return
    try {
      await api(`/expenses/${x.id}`, undefined, 'DELETE')
      toast('Expense deleted')
      invalidate('/expenses', '/dashboard')
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Expenses</h2>
          <p>Every rupee spent, so the owner sees true daily profit.</p>
        </div>
      </div>
      <div className="bill-layout">
        <section className="card">
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <input type="date" className="input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
            <input type="date" className="input" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
            <span className="badge rose" style={{ marginLeft: 'auto' }}>Total {inr(total)}</span>
          </div>
          {byCat.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
              {byCat.map(([c, v]) => <span key={c} className="badge">{c} {inr(v)}</span>)}
            </div>
          )}
          {!data ? (
            <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
          ) : data.length === 0 ? (
            <Empty icon={Wallet} title="No expenses in this period" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Category</th><th className="hide-sm">By</th><th className="right">Amount</th>{me.role === 'owner' && <th />}</tr>
                </thead>
                <tbody>
                  {data.map((x) => (
                    <tr key={x.id}>
                      <td className="small">{fmtDay(x.day)}</td>
                      <td>
                        <b>{x.category}</b>
                        <div className="tiny muted">{[x.description, x.mode.toUpperCase()].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="hide-sm small muted">{x.created_by_name}</td>
                      <td className="right num bold">{inr(x.amount)}</td>
                      {me.role === 'owner' && (
                        <td className="right">
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(x)} aria-label="Delete expense"><Trash /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <form className="card summary stack" onSubmit={submit}>
          <div className="card-h" style={{ marginBottom: 0 }}><h3><Plus /> Add expense</h3></div>
          <Field label="Date">
            <input className="input" type="date" max={today} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required />
          </Field>
          <Field label="Category">
            <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Details">
            <input className="input" value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Oxygen cylinder refill" />
          </Field>
          <Field label="Amount (₹)">
            <input className="input" type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
          </Field>
          <Field label="Paid by">
            <Seg value={f.mode} onChange={(m) => setF({ ...f, mode: m })} options={['cash', 'upi', 'card', 'bank'].map((m) => ({ value: m, label: m.toUpperCase() }))} />
          </Field>
          <Button busy={busy}>Add expense</Button>
        </form>
      </div>
    </div>
  )
}
