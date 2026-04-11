import { NavLink, useNavigate } from 'react-router-dom'
import { Mic, Settings, Radio, LayoutDashboard, LineChart, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../../utils/cn'

const navItems = [
  { to: '/app',       label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/live',      label: 'Live Session',     icon: Radio           },
  { to: '/asr',       label: 'Record & Extract', icon: Mic             },
  { to: '/analytics', label: 'Analytics',        icon: LineChart       },
  { to: '/settings',  label: 'Settings',         icon: Settings        },
]

export function Sidebar() {
  const { toggle, theme } = useTheme()
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('auth')
    navigate('/login')
  }

  return (
    <aside className="h-screen sticky top-0 w-64 flex flex-col border-r border-white/8 bg-surface-100/80 backdrop-blur-xl shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/6">
        <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-glow shrink-0">
          <Mic size={15} className="text-white" />
        </div>
        <div>
          <div className="font-display font-bold text-sm text-white leading-none">Audient AI</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Medical Transcription</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-4 space-y-1 border-t border-white/6 pt-4">
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
