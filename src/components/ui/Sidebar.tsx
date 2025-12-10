import { NavLink } from 'react-router-dom'
import { Mic, Settings, Radio, List, LineChart } from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { Button } from './Button'

const navItems = [
  { to: '/app', label: 'Sessions', icon: List },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/asr', label: 'ASR Demo', icon: Mic },
  { to: '/analytics', label: 'Analytics', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const { toggle, theme } = useTheme()
  return (
    <aside className="h-screen sticky top-0 w-72 p-4 border-r border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-soft">
            <Mic size={18} />
          </div>
          <div className="font-extrabold tracking-tight text-lg">Audient AI</div>
        </div>
        <Button variant="secondary" size="sm" onClick={toggle}>{theme === 'dark' ? 'Light' : 'Dark'}</Button>
      </div>
      <nav className="mt-6 flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-2 rounded-2xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${isActive ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <Button asChild className="w-full" glow>
          <a href="/live"><Mic className="mr-2" size={16} /> Start New Session</a>
        </Button>
      </div>
    </aside>
  )
}


