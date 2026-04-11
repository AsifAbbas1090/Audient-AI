import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mic, Mail, Lock, ShieldCheck, Zap, WifiOff } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { login, isAdmin } from '../hooks/useAuth'

const perks = [
  { icon: WifiOff,     text: 'Fully offline — no data leaves your machine' },
  { icon: ShieldCheck, text: 'Privacy-first medical transcription' },
  { icon: Zap,         text: 'Real-time speaker diarization + AI extraction' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    try {
      const user = await login(email.trim(), password)
      // Role-based redirect
      navigate(user.role === 'admin' ? '/admin' : '/app', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Invalid email or password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-auth-panel relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots bg-grid opacity-20 pointer-events-none" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur">
            <Mic size={18} className="text-white" />
          </div>
          <div>
            <div className="font-display font-bold text-white text-lg leading-none">Audient AI</div>
            <div className="text-xs text-brand-200/70 mt-0.5">Medical Transcription</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative space-y-6">
          <h1 className="font-display font-bold text-4xl text-white leading-tight">
            Turn patient conversations<br />
            into <span className="text-brand-200">structured data.</span>
          </h1>
          <p className="text-brand-100/70 text-base leading-relaxed max-w-sm">
            Real-time two-speaker transcription, automatic language translation,
            and offline AI medical field extraction — all on your machine.
          </p>

          <div className="space-y-3">
            {perks.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-brand-200" />
                </div>
                <span className="text-sm text-brand-100/80">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-brand-200/40">
          Final Year Project — Medical AI Platform
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-surface-400">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Mic size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-white">Audient AI</span>
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="doctor@hospital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              icon={<Mail size={15} />}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              icon={<Lock size={15} />}
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-500" />
                Remember me
              </label>
              <span className="text-slate-600 cursor-default">Forgot password?</span>
            </div>

            <Button type="submit" className="w-full" size="lg" glow loading={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/8" />
            </div>
            <div className="relative flex justify-center text-xs text-slate-600 px-3 bg-surface-400">
              or
            </div>
          </div>

          <p className="text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
