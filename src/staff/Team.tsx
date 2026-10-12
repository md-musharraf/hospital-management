import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, ShieldCheck, UserPlus } from 'lucide-react'
import { api, invalidate, useApi } from '../api.ts'
import { Button, Empty, Field, Modal, Skeleton, fmtDay, initials, toast, toastError } from '../ui.tsx'
import { avatarBg } from '../pages/Landing.tsx'
import { useMe } from './Shell.tsx'
import { ROLES, ROLE_LABEL, type Role } from '../../shared/catalog.ts'

type User = { id: number; name: string; username: string; role: Role; doctor_id: number | null; doctor: string | null; active: number; created_at: string }

const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, including money dashboard, cancellations, setup',
  doctor: 'Own queue, notes and consultation income',
  reception: 'Registration, tokens, all billing, expenses',
  lab: 'Lab bills and sample/report status',
  pharmacy: 'Pharmacy bills and medicine stock',
}

export default function Team() {
  const me = useMe()
  const { data } = useApi<User[]>('/users')
  const [edit, setEdit] = useState<User | 'new' | null>(null)
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Staff accounts</h2>
          <p>Separate logins per person — every bill records who created it.</p>
        </div>
        <Button onClick={() => setEdit('new')}><UserPlus /> Add staff</Button>
      </div>
      <section className="card">
        {!data ? (
          <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={52} />)}</div>
        ) : data.length === 0 ? (
          <Empty icon={ShieldCheck} title="No staff" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Username</th><th>Role</th><th className="hide-sm">Since</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{ width: 36, height: 36, borderRadius: 11, fontSize: 13, background: avatarBg(u.id) }}>{initials(u.name)}</div>
                        <div>
                          <b>{u.name}</b>
                          {u.id === me.id && <span className="badge brand" style={{ marginLeft: 6 }}>You</span>}
                          {u.doctor && <div className="tiny muted">Linked: {u.doctor}</div>}
                        </div>
                      </div>
                    </td>
                    <td><code>{u.username}</code></td>
                    <td><span className="badge">{ROLE_LABEL[u.role]}</span></td>
                    <td className="hide-sm small muted">{fmtDay(u.created_at.slice(0, 10))}</td>
                    <td>{u.active ? <span className="badge green">Active</span> : <span className="badge">Disabled</span>}</td>
                    <td className="right"><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEdit(u)} aria-label={`Edit ${u.name}`}><Pencil /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <UserForm user={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function UserForm({ user, onClose }: { user: User | 'new' | null; onClose: () => void }) {
  const { data: doctors } = useApi<{ id: number; name: string }[]>(user ? '/catalog/doctors' : null)
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'reception' as Role, doctorId: '', active: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (user === 'new') setF({ name: '', username: '', password: '', role: 'reception', doctorId: '', active: true })
    else if (user) setF({ name: user.name, username: user.username, password: '', role: user.role, doctorId: user.doctor_id ? String(user.doctor_id) : '', active: !!user.active })
  }, [user])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { ...f, doctorId: f.doctorId ? Number(f.doctorId) : null, password: f.password || undefined }
      if (user === 'new') await api('/users', body)
      else await api(`/users/${user!.id}`, body, 'PUT')
      toast(user === 'new' ? `Account ${f.username} created` : 'Account updated', 'success', f.password && user !== 'new' ? 'They have been signed out everywhere' : undefined)
      invalidate('/users')
      onClose()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={!!user} onClose={onClose} title={user === 'new' ? 'Add staff account' : 'Edit staff account'}>
      <form className="grid-2" onSubmit={submit}>
        <Field label="Full name *" className="span-2">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        </Field>
        <Field label="Username *">
          <input className="input" value={f.username} disabled={user !== 'new'} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required minLength={3} autoComplete="off" />
        </Field>
        <Field label={user === 'new' ? 'Password * (8+ chars)' : 'Reset password'}>
          <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={user === 'new'} minLength={8} autoComplete="new-password" placeholder={user === 'new' ? '' : 'Leave blank to keep'} />
        </Field>
        <Field label="Role" className="span-2" hint={ROLE_HINT[f.role]}>
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {(f.role === 'doctor' || f.role === 'owner') && (
          <Field label={f.role === 'doctor' ? 'Doctor profile *' : 'Also a doctor? (optional)'} className="span-2">
            <select className="select" value={f.doctorId} onChange={(e) => setF({ ...f, doctorId: e.target.value })} required={f.role === 'doctor'}>
              <option value="">—</option>
              {doctors?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        {user !== 'new' && (
          <label className="check span-2">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Account active (untick to block login immediately)
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
