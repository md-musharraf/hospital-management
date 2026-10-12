import { Link } from 'react-router'
import { PackagePlus, Plus } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { localDay, toast, toastError } from '../ui.tsx'
import { CatalogManager } from './Catalog.tsx'

type Med = { id: number; name: string; stock: number; reorder_level: number; expiry: string; active: number }

export default function Pharmacy() {
  const { data } = useApi<Med[]>('/catalog/medicines?all=1')
  const soon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
  const low = (data ?? []).filter((m) => m.active && m.stock <= m.reorder_level).length
  const expiring = (data ?? []).filter((m) => m.active && m.expiry && m.expiry <= soon).length

  async function stockIn(m: Med) {
    const qty = Number(prompt(`Add stock for ${m.name} (units received):`, '50'))
    if (!Number.isInteger(qty) || qty <= 0) return
    try {
      await api(`/medicines/${m.id}/stock`, { qty })
      toast(`+${qty} ${m.name}`, 'success', `Stock now ${m.stock + qty}`)
      invalidate('/catalog/medicines')
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Pharmacy stock</h2>
          <p>Stock drops automatically with every pharmacy bill and comes back if a bill is cancelled.</p>
        </div>
        <Link className="btn btn-primary" to="/staff/billing?type=pharmacy"><Plus /> New pharmacy bill</Link>
      </div>
      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <span className="badge rose">{low} low on stock</span>
        <span className="badge amber">{expiring} expiring within 60 days</span>
      </div>
      <CatalogManager
        kind="medicines"
        rowStyle={(r) => (r.active && (r.stock <= r.reorder_level || (r.expiry && r.expiry <= localDay())) ? { background: 'var(--rose-50)' } : r.active && r.expiry && r.expiry <= soon ? { background: 'var(--amber-50)' } : undefined)}
        actions={(r) => (
          <button className="btn btn-soft btn-sm" onClick={() => stockIn(r as Med)} title="Stock in">
            <PackagePlus /> Stock in
          </button>
        )}
      />
    </div>
  )
}
