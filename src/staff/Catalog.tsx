import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Building, Pencil, Plus, Search } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, Modal, Seg, Skeleton, fmtDay, inr, toast, toastError } from '../ui.tsx'
import { DEPT_ICON } from '../pages/Landing.tsx'
import { CATALOG, DAYS, type CatalogKind, type Field as F } from '../../shared/catalog.ts'

type Row = Record<string, any> & { id: number; active: number }

function show(f: F, v: any, depts?: Row[]) {
  if (v === '' || v == null) return <span className="muted">—</span>
  if (f.type === 'money') return <span className="num bold">{inr(v)}</span>
  if (f.type === 'date') return fmtDay(v)
  if (f.type === 'days') return <span className="small">{v.replace(/,/g, ' · ')}</span>
  if (f.options === 'departments') return depts?.find((d) => d.id === v)?.name ?? v
  if (f.key === 'icon') {
    const I = DEPT_ICON[v]
    return I ? <I size={18} /> : v
  }
  return String(v)
}

/** Generic list + form for any catalog in shared/catalog.ts. */
export function CatalogManager({ kind, rowStyle, actions, title }: { kind: CatalogKind; rowStyle?: (r: Row) => React.CSSProperties | undefined; actions?: (r: Row) => ReactNode; title?: ReactNode }) {
  const spec = CATALOG[kind]
  const { data } = useApi<Row[]>(`/catalog/${kind}?all=1`)
  const { data: depts } = useApi<Row[]>(kind === 'doctors' ? '/catalog/departments?all=1' : null)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Row | 'new' | null>(null)
  const cols = spec.fields.filter((f) => f.type !== 'textarea').slice(0, 6)
  const rows = (data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <section className="card">
      <div className="toolbar" style={{ marginBottom: 14 }}>
        {title}
        <div className="input-icon" style={{ flex: '1 1 200px' }}>
          <Search />
          <input className="input" style={{ width: '100%' }} placeholder={`Search ${spec.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setEdit('new')}>
          <Plus /> Add {spec.singular}
        </Button>
      </div>
      {!data ? (
        <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</div>
      ) : rows.length === 0 ? (
        <Empty icon={Building} title={`No ${spec.label.toLowerCase()}`} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {cols.map((f) => <th key={f.key} className={f.type === 'money' || f.type === 'int' ? 'right' : ''}>{f.label.replace(/ \(.*\)/, '')}</th>)}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5, ...rowStyle?.(r) }}>
                  {cols.map((f, i) => (
                    <td key={f.key} className={f.type === 'money' || f.type === 'int' ? 'right num' : ''}>{i === 0 ? <b>{r[f.key]}</b> : show(f, r[f.key], depts)}</td>
                  ))}
                  <td>{r.active ? <span className="badge green">Active</span> : <span className="badge">Hidden</span>}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    {actions?.(r)}
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`}><Pencil /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CatalogForm kind={kind} row={edit} depts={depts} onClose={() => setEdit(null)} />
    </section>
  )
}

function CatalogForm({ kind, row, depts, onClose }: { kind: CatalogKind; row: Row | 'new' | null; depts?: Row[]; onClose: () => void }) {
  const spec = CATALOG[kind]
  const [f, setF] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!row) return
    const base: Record<string, any> = { active: true }
    for (const fl of spec.fields) {
      const v = row === 'new' ? undefined : row[fl.key]
      base[fl.key] = fl.type === 'money' ? (v != null ? v / 100 : '') : v ?? (fl.type === 'days' ? 'Mon,Tue,Wed,Thu,Fri,Sat' : fl.type === 'time' ? (fl.key === 'start_time' ? '10:00' : '14:00') : fl.key === 'max_tokens' ? 40 : fl.key === 'reorder_level' ? 10 : '')
    }
    if (row !== 'new') base.active = !!row.active
    setF(base)
  }, [row, spec])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (row === 'new') await api(`/catalog/${kind}`, f)
      else await api(`/catalog/${kind}/${row!.id}`, f, 'PUT')
      toast(`${spec.singular[0].toUpperCase() + spec.singular.slice(1)} saved`)
      invalidate('/catalog', '/public/site')
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const input = (fl: F) => {
    const v = f[fl.key] ?? ''
    const set = (val: any) => setF((x) => ({ ...x, [fl.key]: val }))
    switch (fl.type) {
      case 'textarea':
        return <textarea className="textarea" value={v} maxLength={fl.max} onChange={(e) => set(e.target.value)} />
      case 'money':
        return <input className="input" type="number" min="0" step="0.01" value={v} onChange={(e) => set(e.target.value)} required={fl.required} />
      case 'int':
        return <input className="input" type="number" min="0" step="1" value={v} onChange={(e) => set(e.target.value)} />
      case 'time':
        return <input className="input" type="time" value={v} onChange={(e) => set(e.target.value)} />
      case 'date':
        return <input className="input" type="date" value={v} onChange={(e) => set(e.target.value)} />
      case 'days': {
        const list = String(v).split(',').filter(Boolean)
        return (
          <div className="chips">
            {DAYS.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={list.includes(d)} onClick={() => set(DAYS.filter((x) => (x === d ? !list.includes(d) : list.includes(x))).join(','))}>
                {d}
              </button>
            ))}
          </div>
        )
      }
      case 'select':
        return (
          <select className="select" value={v} onChange={(e) => set(fl.options === 'departments' ? Number(e.target.value) : e.target.value)} required={fl.required}>
            <option value="">Choose…</option>
            {fl.options === 'departments' ? depts?.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>) : fl.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      default:
        return <input className="input" value={v} maxLength={fl.max ?? 120} onChange={(e) => set(e.target.value)} required={fl.required} />
    }
  }

  return (
    <Modal open={!!row} onClose={onClose} title={row === 'new' ? `Add ${spec.singular}` : `Edit ${spec.singular}`} wide={kind === 'doctors'}>
      <form className="grid-2" onSubmit={submit}>
        {spec.fields.map((fl) => (
          <Field key={fl.key} label={fl.label + (fl.required ? ' *' : '')} className={fl.type === 'textarea' || fl.type === 'days' || fl.key === 'name' ? 'span-2' : ''}>
            {input(fl)}
          </Field>
        ))}
        {row !== 'new' && (
          <label className="check span-2">
            <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (shown in billing{kind === 'doctors' || kind === 'departments' ? ' and on the website' : ''})
          </label>
        )}
        <div className="span-2 row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

const KINDS: CatalogKind[] = ['doctors', 'departments', 'services', 'lab_tests', 'medicines']

export default function Catalog() {
  const [kind, setKind] = useState<CatalogKind>('doctors')
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Hospital setup</h2>
          <p>Doctors, departments and price lists. Changes show on the website and in billing immediately.</p>
        </div>
      </div>
      <div style={{ marginBottom: 16, overflowX: 'auto' }}>
        <Seg label="Catalog" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: CATALOG[k].label }))} />
      </div>
      <CatalogManager key={kind} kind={kind} />
    </div>
  )
}
