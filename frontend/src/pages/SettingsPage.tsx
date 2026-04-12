import { useState } from 'react'
import {
  Moon, Sun, Server, Mic2, Brain, ShieldCheck,
  Globe, Save, RotateCcw,
} from 'lucide-react'
import { Sidebar }    from '../components/ui/Sidebar'
import { Button }     from '../components/ui/Button'
import { Card }       from '../components/ui/Card'
import { Input }      from '../components/ui/Input'
import { Toggle }     from '../components/ui/Toggle'
import { Badge }      from '../components/ui/Badge'
import { useTheme }   from '../components/providers/ThemeProvider'
import { getUser }    from '../hooks/useAuth'
import { useToast }   from '../components/ui/Toaster'

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const user  = getUser()
  const toast = useToast()

  // Model settings (UI-only — no backend persist yet)
  const [whisperModel,  setWhisperModel]  = useState('base')
  const [ollamaModel,   setOllamaModel]   = useState('phi3:mini')
  const [ollamaUrl,     setOllamaUrl]     = useState('http://localhost:11434/v1')
  const [diarize,       setDiarize]       = useState(true)
  const [translate,     setTranslate]     = useState(true)
  const [saved,         setSaved]         = useState(false)

  const handleSave = () => {
    setSaved(true)
    toast('Settings saved', 'success')
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Settings</h1>
            <p className="text-xs text-slate-500 mt-0.5">Configure models, appearance, and preferences</p>
          </div>
          <Button size="sm" onClick={handleSave} glow={saved}>
            {saved ? <><RotateCcw size={13} /> Saved!</> : <><Save size={13} /> Save changes</>}
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">

          {/* ── Account ──────────────────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={15} className="text-brand-400" />
              <h2 className="font-semibold text-white text-sm">Account</h2>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-white">{user?.name ?? '—'}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <Badge variant={user?.role === 'admin' ? 'warning' : 'default'} dot>
                {user?.role ?? 'healthcare'}
              </Badge>
            </div>
          </Card>

          {/* ── Appearance ───────────────────────────────── */}
          <Card variant="elevated" className="p-5">
            <div className="flex items-center gap-2 mb-4">
              {theme === 'dark' ? <Moon size={15} className="text-brand-400" /> : <Sun size={15} className="text-brand-400" />}
              <h2 className="font-semibold text-white text-sm">Appearance</h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Theme</p>
                <p className="text-xs text-slate-500 mt-0.5">Switch between dark and light mode</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 capitalize">{theme}</span>
                <Button variant="secondary" size="sm" onClick={toggle}>
                  {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </Button>
              </div>
            </div>
          </Card>

          {/* ── Transcription ────────────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Mic2 size={15} className="text-brand-400" />
              <h2 className="font-semibold text-white text-sm">Transcription (Whisper)</h2>
              <Badge variant="success" className="ml-auto">Offline</Badge>
            </div>

            {/* Whisper model select */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Whisper Model</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'base',     label: 'Base',     desc: '~15s/chunk · Fast'      },
                  { value: 'small',    label: 'Small',    desc: '~30s/chunk · Balanced'  },
                  { value: 'large-v3', label: 'Large v3', desc: '~2min/chunk · Accurate' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWhisperModel(opt.value)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                      whisperModel === opt.value
                        ? 'border-brand-500 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20',
                    ].join(' ')}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Change requires backend restart. Set <code className="text-slate-400">WHISPER_MODEL</code> in <code className="text-slate-400">.env</code>.
              </p>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Auto-translate to English</p>
                  <p className="text-xs text-slate-500">Translate any language to English during transcription</p>
                </div>
                <Toggle checked={translate} onChange={setTranslate} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Speaker diarization</p>
                  <p className="text-xs text-slate-500">Label Speaker 1 / Speaker 2 (requires HF_TOKEN)</p>
                </div>
                <Toggle checked={diarize} onChange={setDiarize} />
              </div>
            </div>
          </Card>

          {/* ── Ollama / Extraction ──────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Brain size={15} className="text-brand-400" />
              <h2 className="font-semibold text-white text-sm">Medical Extraction (Ollama)</h2>
              <Badge variant="success" className="ml-auto">Offline</Badge>
            </div>

            <Input
              label="Ollama base URL"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              icon={<Server size={14} />}
              placeholder="http://localhost:11434/v1"
            />

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Extraction Model</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'phi3:mini',   label: 'phi3:mini',   desc: 'Recommended'  },
                  { value: 'gemma2:2b',   label: 'gemma2:2b',   desc: 'Alternative'  },
                  { value: 'llama3.2:1b', label: 'llama3.2:1b', desc: 'Lightest'     },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOllamaModel(opt.value)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                      ollamaModel === opt.value
                        ? 'border-brand-500 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20',
                    ].join(' ')}
                  >
                    <span className="text-sm font-medium font-mono">{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Pull with: <code className="text-slate-400">ollama pull {ollamaModel}</code>
              </p>
            </div>
          </Card>

          {/* ── Language ─────────────────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Globe size={15} className="text-brand-400" />
              <h2 className="font-semibold text-white text-sm">Language</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Primary language"
                placeholder="e.g. Urdu, Arabic, English"
                icon={<Globe size={14} />}
              />
              <Input
                label="Translate to"
                placeholder="English"
                icon={<Globe size={14} />}
                disabled
              />
            </div>
            <p className="text-xs text-slate-600">
              Translation is handled automatically by Whisper when enabled above.
            </p>
          </Card>

        </div>
      </main>
    </div>
  )
}
