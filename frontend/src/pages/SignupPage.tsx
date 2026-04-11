import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mic, User, Mail, Lock, CheckCircle2, Stethoscope, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input }  from '../components/ui/Input'
import { register } from '../hooks/useAuth'

const steps = [
  'Real-time transcription in any language',
  'Two-speaker diarization from one mic',
  'Offline AI medical field extraction',
  'Privacy-first — no cloud, no telemetry',
]

type Role = 'healthcare' | 'admin'

export default function SignupPage() {
  const navigate = useNavigate()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [role,     setRole]     = useState<Role>('healthcare')
  const [agreed,   setAgreed]   = useState(false)
  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())         e.name     = 'Full name is required.'
    if (!email.trim())        e.email    = 'Email address is required.'
    if (password.length < 6)  e.password = 'Password must be at least 6 characters.'
    if (password !== confirm)  e.confirm  = 'Passwords do not match.'
    if (!agreed)               e.agreed   = 'You must accept the terms to continue.'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      const user = await register(name.trim(), email.trim(), password, role)
      navigate(user.role === 'admin' ? '/admin' : '/app', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Registration failed. Please try again.'
      setErrors(prev => ({ ...prev, _form: msg }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-auth-panel relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots bg-grid opacity-20 pointer-events-none" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />

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
            Everything you need<br />
            for <span className="text-brand-200">medical documentation.</span>
          </h1>
          <p className="text-brand-100/70 text-base leading-relaxed max-w-sm">
            Set up in seconds. All models run locally — your patients'
            data never touches a server.
          </p>

          <div className="space-y-3">
            {steps.map(step => (
              <div key={step} className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="text-sm text-brand-100/80">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-brand-200/40">
          Final Year Project — Medical AI Platform
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-surface-400 overflow-y-auto">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Mic size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-white">Audient AI</span>
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">Create your account</h2>
            <p className="text-slate-400 text-sm mt-1">Start transcribing in under a minute</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              type="text"
              placeholder="Dr. Asif Abbas"
              value={name}
              onChange={e => setName(e.target.value)}
              icon={<User size={15} />}
              error={errors.name}
              autoComplete="name"
            />
            <Input
              label="Email address"
              type="email"
              placeholder="doctor@hospital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              icon={<Mail size={15} />}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              icon={<Lock size={15} />}
              error={errors.password}
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              icon={<Lock size={15} />}
              error={errors.confirm}
              autoComplete="new-password"
            />

            {/* Role selector */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">Account type</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'healthcare', label: 'Healthcare', icon: Stethoscope, desc: 'Doctor / Clinician' },
                  { value: 'admin',      label: 'Admin',      icon: ShieldCheck,  desc: 'System Administrator' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={[
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                      role === opt.value
                        ? 'border-brand-500 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20',
                    ].join(' ')}
                  >
                    <opt.icon size={16} className={role === opt.value ? 'text-brand-400' : 'text-slate-500'} />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form-level error */}
            {errors._form && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                {errors._form}
              </p>
            )}

            {/* Terms */}
            <div>
              <label className="flex items-start gap-3 text-sm text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded accent-brand-500 shrink-0"
                />
                <span>
                  I understand this is a research prototype and agree to use it
                  only for authorised academic and clinical purposes.
                </span>
              </label>
              {errors.agreed && (
                <p className="text-xs text-red-400 mt-1.5">{errors.agreed}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" glow loading={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
