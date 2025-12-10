import { Sidebar } from '../components/ui/Sidebar'
import { useTheme } from '../components/providers/ThemeProvider'
import { Input } from '../shared/Input'
import { Button } from '../components/ui/Button'

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
          <h1 className="text-xl font-semibold">Settings</h1>
          <div className="mt-6 space-y-6">
            <div>
              <div className="font-medium">Language</div>
              <div className="mt-2 grid sm:grid-cols-2 gap-3">
                <Input placeholder="Primary Language (e.g., English)" />
                <Input placeholder="Translate To (e.g., Spanish)" />
              </div>
            </div>
            <div>
              <div className="font-medium">Privacy</div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" /> Enable end-to-end encryption
              </label>
            </div>
            <div>
              <div className="font-medium">Theme</div>
              <div className="mt-2 flex gap-2">
                <Button onClick={toggle}>Toggle to {theme === 'dark' ? 'Light' : 'Dark'}</Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}


