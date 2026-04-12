import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Activity, ShieldCheck, Trash2, Pencil, X, Check,
  ChevronRight, BarChart3, Mic, ClipboardList,
} from 'lucide-react'
import api from '../lib/api'
import { getUser, logout } from '../hooks/useAuth'
import { useToast } from '../components/ui/Toaster'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

// ── Types ────────────────────────────────────────────────────
type RoleType = 'healthcare' | 'admin'

interface AdminStats {
  users: { total: number; healthcare: number; admin: number }
  conversations: { total: number; processing: number; done: number; failed: number }
}

interface AuditEntry {
  id:            string
  user_id:       string | null
  user_name:     string | null
  action:        string
  resource_type: string | null
  resource_id:   string | null
  details:       Record<string, unknown> | null
  created_at:    string
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: RoleType
  process_mode: string
  created_at: string
  last_login_at: string | null
  conversation_count: number
}

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────
export default function AdminPage() {
  const navigate  = useNavigate()
  const me        = getUser()
  const toast     = useToast()

  const [stats,      setStats]      = useState<AdminStats | null>(null)
  const [users,      setUsers]      = useState<AdminUser[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editRole,   setEditRole]   = useState<RoleType>('healthcare')
  const [saving,     setSaving]     = useState(false)
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [auditLog,   setAuditLog]   = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  // Fetch stats + users
  useEffect(() => {
    Promise.all([
      api.get<AdminStats>('/api/admin/stats'),
      api.get<{ users: AdminUser[] }>('/api/admin/users'),
    ])
      .then(([s, u]) => {
        setStats(s.data)
        setUsers(u.data.users)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Fetch audit log
  useEffect(() => {
    setAuditLoading(true)
    api.get<{ audit_log: AuditEntry[] }>('/api/admin/audit-log?limit=50')
      .then(r => setAuditLog(r.data.audit_log))
      .catch(console.error)
      .finally(() => setAuditLoading(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function saveRole(userId: string) {
    setSaving(true)
    try {
      await api.patch(`/api/admin/users/${userId}`, { role: editRole })
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, role: editRole } : u)
      )
      setEditId(null)
      toast('Role updated successfully', 'success')
    } catch {
      toast('Failed to update role', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(userId: string) {
    try {
      await api.delete(`/api/admin/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast('User deleted', 'success')
    } catch {
      toast('Failed to delete user', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  // ── Stat cards data ──────────────────────────────────────
  const statCards = stats
    ? [
        { label: 'Total Users',      value: stats.users.total,                icon: Users,     color: 'text-brand-400'   },
        { label: 'Healthcare Staff', value: stats.users.healthcare,           icon: Mic,       color: 'text-emerald-400' },
        { label: 'Admins',           value: stats.users.admin,                icon: ShieldCheck, color: 'text-violet-400' },
        { label: 'Sessions Total',   value: stats.conversations.total,        icon: BarChart3, color: 'text-amber-400'   },
      ]
    : []

  return (
    <div className="min-h-screen bg-surface-400">

      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-surface-400/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center">
            <Mic size={15} className="text-white" />
          </div>
          <div>
            <span className="font-display font-bold text-white text-sm">Audient AI</span>
            <span className="ml-2 text-xs text-slate-500">Admin Console</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="warning" dot>Admin</Badge>
          <span className="text-sm text-slate-400 hidden sm:block">{me?.name}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Page title ──────────────────────────────── */}
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Manage users and monitor system activity</p>
        </div>

        {/* ── Stats row ───────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/4 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label} variant="elevated" className="p-5">
                <div className={`mb-3 ${color}`}><Icon size={20} /></div>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-400 mt-1">{label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Session breakdown ───────────────────────── */}
        {stats && (
          <Card variant="elevated" className="p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={16} className="text-brand-400" />
              Session Breakdown
            </h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Processing', value: stats.conversations.processing, color: 'text-amber-400'   },
                { label: 'Completed',  value: stats.conversations.done,       color: 'text-emerald-400' },
                { label: 'Failed',     value: stats.conversations.failed,     color: 'text-red-400'     },
              ].map(item => (
                <div key={item.label}>
                  <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Users table ─────────────────────────────── */}
        <Card variant="elevated" className="overflow-hidden">
          <div className="p-5 border-b border-white/8">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Users size={16} className="text-brand-400" />
              All Users
              <span className="ml-1 text-xs text-slate-500 font-normal">({users.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : (
            <div className="divide-y divide-white/6">
              {users.map(user => (
                <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors">

                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-brand-400">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{user.name}</span>
                      {user.id === me?.id && (
                        <span className="text-xs text-slate-500">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                  </div>

                  {/* Role edit */}
                  <div className="shrink-0">
                    {editId === user.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as RoleType)}
                          className="text-xs bg-surface-300 border border-white/10 text-white rounded-lg px-2 py-1"
                        >
                          <option value="healthcare">Healthcare</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => saveRole(user.id)}
                          disabled={saving}
                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <Badge variant={user.role === 'admin' ? 'warning' : 'default'} dot>
                        {user.role}
                      </Badge>
                    )}
                  </div>

                  {/* Sessions count */}
                  <div className="hidden sm:block shrink-0 text-xs text-slate-500 w-20 text-right">
                    {user.conversation_count} session{user.conversation_count !== 1 ? 's' : ''}
                  </div>

                  {/* Last login */}
                  <div className="hidden md:block shrink-0 text-xs text-slate-500 w-20 text-right">
                    {timeAgo(user.last_login_at)}
                  </div>

                  {/* Actions */}
                  {user.id !== me?.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditId(user.id); setEditRole(user.role) }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="Edit role"
                      >
                        <Pencil size={14} />
                      </button>
                      {deleteId === user.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Confirm delete"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteId(user.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {users.length === 0 && !loading && (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No users found.
                </div>
              )}
            </div>
          )}
        </Card>
        {/* ── Audit Log ───────────────────────────────── */}
        <Card variant="elevated" className="overflow-hidden">
          <div className="p-5 border-b border-white/8 flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <ClipboardList size={16} className="text-brand-400" />
              Audit Log
              <span className="ml-1 text-xs text-slate-500 font-normal">(last 50 events)</span>
            </h2>
          </div>

          {auditLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : auditLog.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No events recorded yet.</div>
          ) : (
            <div className="divide-y divide-white/6">
              {auditLog.map(entry => {
                const actionColor: Record<string, string> = {
                  session_created:   'text-emerald-400 bg-emerald-500/10',
                  session_approved:  'text-sky-400 bg-sky-500/10',
                  session_deleted:   'text-red-400 bg-red-500/10',
                  session_restored:  'text-amber-400 bg-amber-500/10',
                  summary_updated:   'text-purple-400 bg-purple-500/10',
                  user_role_changed: 'text-brand-400 bg-brand-500/10',
                  user_deleted:      'text-red-400 bg-red-500/10',
                }
                const colorClass = actionColor[entry.action] ?? 'text-slate-400 bg-white/6'
                const label = entry.action.replace(/_/g, ' ')

                return (
                  <div key={entry.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                    <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${colorClass}`}>
                      {label}
                    </span>
                    <span className="flex-1 text-xs text-slate-400 truncate">
                      {entry.user_name || 'System'}
                      {entry.details && (
                        <span className="ml-2 text-slate-600">
                          {entry.details.title as string
                            || entry.details.target_name as string
                            || entry.details.name as string
                            || ''}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-600">
                      {new Date(entry.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

      </main>
    </div>
  )
}
