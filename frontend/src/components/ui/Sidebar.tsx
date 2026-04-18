import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  Mic, Settings, LayoutDashboard, LineChart, LogOut, Moon, Sun, ShieldCheck, LayoutTemplate, Users, MessageSquare, Bell,
} from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../../utils/cn'
import { logout, isAdmin } from '../../hooks/useAuth'
import { usePreferencesUser } from '../../hooks/usePreferencesUser'
import { getSpecialtyUi } from '../../lib/specialtyUi'
import api from '../../lib/api'

const navItems = [
  { to: '/app',       label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/patients',  label: 'Patients',     icon: Users           },
  { to: '/consults',  label: 'Consultations',icon: MessageSquare   },
  { to: '/analytics', label: 'Analytics',    icon: LineChart       },
  { to: '/templates', label: 'Templates',    icon: LayoutTemplate  },
  { to: '/settings',  label: 'Settings',     icon: Settings        },
]

const NOTIF_TYPE_LABEL: Record<string, string> = {
  consult_received:    'Consults',
  consult_responded:     'Consults',
  access_revoked:        'Access',
  consult_expiring_soon: 'Consults',
}

interface AppNotification {
  id:           string
  type:         string
  payload_json: Record<string, unknown>
  read_at:      string | null
  created_at:   string
}

export function Sidebar() {
  const { toggle, theme } = useTheme()
  const navigate = useNavigate()
  const user = usePreferencesUser()
  const admin = isAdmin()
  const specUi = getSpecialtyUi(user?.specialty)
  const [pendingConsults, setPendingConsults] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return

    function poll() {
      Promise.all([
        api.get<{ pending: number }>('/api/consults/inbox/count'),
        api.get<{ notifications: AppNotification[]; unread_count: number }>('/api/notifications'),
      ])
        .then(([c, n]) => {
          setPendingConsults(c.data.pending)
          setNotifications(n.data.notifications)
          setUnreadNotifs(n.data.unread_count)
        })
        .catch(() => {})
    }

    poll()
    const interval = setInterval(poll, 60000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!notifOpen) return
    function onDoc(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen])

  async function handleNotifClick(n: AppNotification) {
    const sid = n.payload_json?.session_id
    if (!n.read_at) {
      try {
        await api.patch(`/api/notifications/${n.id}/read`)
        setNotifications(prev =>
          prev.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)),
        )
        setUnreadNotifs(u => Math.max(0, u - 1))
      } catch {
        /* still navigate */
      }
    }
    setNotifOpen(false)
    if (typeof sid === 'string' && sid) {
      navigate(`/session/${sid}`)
    } else if (n.type.startsWith('consult')) {
      navigate('/consults')
    }
  }

  const grouped = notifications.reduce<Record<string, AppNotification[]>>((acc, n) => {
    const key = NOTIF_TYPE_LABEL[n.type] || 'Other'
    if (!acc[key]) acc[key] = []
    acc[key].push(n)
    return acc
  }, {})

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="h-screen sticky top-0 w-64 flex flex-col border-r border-white/8 bg-surface-100/80 backdrop-blur-xl shrink-0">

      {/* Logo + notifications */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/6 overflow-visible">
        <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-glow shrink-0">
          <Mic size={15} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-sm text-white leading-none">Audient AI</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">Medical Transcription</div>
          {user && (
            <div className="text-[10px] text-brand-400/90 mt-0.5 font-medium truncate" title={specUi.tagline}>
              {specUi.label}
            </div>
          )}
        </div>

        {user && (
          <div className="relative shrink-0" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen(o => !o)}
              className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-bold text-slate-900 flex items-center justify-center">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-[200]',
                  'w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]',
                  'max-h-[min(65vh,24rem)] overflow-hidden flex flex-col',
                  'rounded-xl border border-white/10 bg-surface-200 shadow-2xl',
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                  <span className="text-xs font-semibold text-slate-300">Notifications</span>
                  {unreadNotifs > 0 && (
                    <button
                      type="button"
                      className="text-[10px] text-brand-400 hover:text-brand-300"
                      onClick={async () => {
                        try {
                          await api.patch('/api/notifications/read-all')
                          setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
                          setUnreadNotifs(0)
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1 py-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8 px-3">No notifications yet.</p>
                  ) : (
                    Object.entries(grouped).map(([label, items]) => (
                      <div key={label} className="mb-2 last:mb-0">
                        <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
                        <ul className="space-y-0.5">
                          {items.map(n => {
                            const p = n.payload_json
                            const title =
                              n.type === 'consult_received'
                                ? `Consult from ${p.from_name || 'a colleague'}`
                                : n.type === 'consult_responded'
                                  ? `Consult ${p.action === 'accept' ? 'accepted' : 'declined'}`
                                  : n.type === 'access_revoked'
                                    ? 'Access revoked'
                                    : n.type
                            const sub =
                              typeof p.patient_code === 'string' && p.patient_code
                                ? p.patient_code
                                : typeof p.session_title === 'string'
                                  ? p.session_title
                                  : ''
                            return (
                              <li key={n.id}>
                                <button
                                  type="button"
                                  onClick={() => handleNotifClick(n)}
                                  className={cn(
                                    'w-full text-left px-3 py-2 text-xs transition-colors rounded-lg mx-1',
                                    n.read_at ? 'text-slate-500 hover:bg-white/5' : 'text-slate-200 bg-white/6 hover:bg-white/10',
                                  )}
                                >
                                  <div className="font-medium line-clamp-2">{title}</div>
                                  {sub && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/patients' || to === '/app'}
            className={({ isActive }) => cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium theme-transition',
              isActive
                ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            )}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'} />
                {label}
                {to === '/consults' && pendingConsults > 0 && !isActive && (
                  <span className="ml-auto h-4 min-w-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center px-1">
                    {pendingConsults}
                  </span>
                )}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
              </>
            )}
          </NavLink>
        ))}

        {/* Admin console link — only for admins */}
        {admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium theme-transition mt-2',
              isActive
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            )}
          >
            {({ isActive }) => (
              <>
                <ShieldCheck size={16} className={isActive ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'} />
                Admin Console
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-4 space-y-1 border-t border-white/6 pt-4">
        {/* User pill */}
        {user && (
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-brand-400">{user.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-300 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-500 truncate">
                {user.role === 'admin' ? <span className="capitalize">{user.role}</span> : specUi.label}
              </div>
            </div>
          </div>
        )}

        <NavLink
          to="/live"
          className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow theme-transition"
        >
          <Mic size={14} />
          New Session
        </NavLink>

        <div className="flex gap-1 mt-2">
          <button
            onClick={toggle}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 theme-transition"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 theme-transition"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
