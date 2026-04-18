import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Mic, User, Mail, Lock, CheckCircle2, Stethoscope, ShieldCheck,
  Heart, Brain, Baby, ArrowLeft, Building2, BadgeCheck,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input }  from '../components/ui/Input'
import { register } from '../hooks/useAuth'
import { type SpecialtyCode } from '../lib/specialtyUi'

const BRAND_STEPS = [
  'Real-time transcription in any language',
  'Two-speaker diarization from one mic',
  'Offline AI medical field extraction',
  'Privacy-first — no cloud, no telemetry',
]

type Role = 'healthcare' | 'admin'

const SPECIALTIES: Array<{
  code: SpecialtyCode
  label: string
  desc: string
  icon: React.ElementType
}> = [
  { code: 'general_mbbs',    label: 'General MBBS',    desc: 'Broad clinical documentation',     icon: Stethoscope },
  { code: 'general_practice', label: 'General Practice', desc: 'First-contact & continuity care', icon: CheckCircle2 },
  { code: 'cardiology',      label: 'Cardiology',      desc: 'Cardiac history, tests & plan',    icon: Heart },
  { code: 'psychiatry',      label: 'Psychiatry',      desc: 'MSE, safety & psychosocial',       icon: Brain },
  { code: 'paediatrics',     label: 'Paediatrics',     desc: 'Child-specific history & growth',  icon: Baby },
]

export default function SignupPage() {
  const navigate = useNavigate()

  // Step 1 fields
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [role,     setRole]     = useState<Role>('healthcare')
  const [agreed,   setAgreed]   = useState(false)

  // Step 2 fields
  const [specialty,    setSpecialty]    = useState<SpecialtyCode>('general_mbbs')
  const [doctorTitle,  setDoctorTitle]  = useState('')
  const [clinicName,   setClinicName]   = useState('')

  const [step,    setStep]    = useState<1 | 2>(1)
  const [errors,  setErrors]  = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validateStep1() {
    const e: Record<string, string> = {}
    if (!name.trim())         e.name     = 'Full name is required.'
    if (!email.trim())        e.email    = 'Email address is required.'
    if (password.length < 6)  e.password = 'Password must be at least 6 characters.'
    if (password !== confirm)  e.confirm  = 'Passwords do not match.'
    if (!agreed)               e.agreed   = 'You must accept the terms to continue.'
    return e
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateStep1()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    // Only show step 2 for healthcare users — admins don't need specialty
    if (role === 'admin') {
      void handleCreate()
    } else {
      setStep(2)
    }
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    try {
      const user = await register(
        name.trim(), email.trim(), password, role,
        role === 'healthcare' ? specialty : undefined,
        role === 'healthcare' ? (doctorTitle.trim() || undefined) : undefined,
        role === 'healthcare' ? (clinicName.trim() || undefined) : undefined,
      )
      navigate(user.role === 'admin' ? '/admin' : '/app', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Registration failed. Please try again.'
      setErrors(prev => ({ ...prev, _form: msg }))
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  const BrandPanel = (
    <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-auth-panel relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-dots bg-grid opacity-20 pointer-events-none" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />

      <div className="relative flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur">
          <Mic size={18} className="text-white" />
        </div>
        <div>
          <div className="font-display font-bold text-white text-lg leading-none">Audient AI</div>
          <div className="text-xs text-brand-200/70 mt-0.5">Medical Transcription</div>
        </div>
      </div>

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
          {BRAND_STEPS.map(s => (
            <div key={s} className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span className="text-sm text-brand-100/80">{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative text-xs text-brand-200/40">
        Final Year Project — Medical AI Platform
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex">
      {BrandPanel}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-surface-400 overflow-y-auto">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Mic size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-white">Audient AI</span>
        </div>

        <div className="w-full max-w-sm space-y-8">

          {/* Step indicator */}
          {role === 'healthcare' && (
            <div className="flex items-center gap-2">
              {([1, 2] as const).map(n => (
                <div key={n} className="flex items-center gap-2">
                  <div className={[
                    'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    step >= n ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-400',
                  ].join(' ')}>
                    {n}
                  </div>
                  {n < 2 && <div className={['h-px w-8 transition-colors', step > n ? 'bg-brand-500' : 'bg-white/10'].join(' ')} />}
                </div>
              ))}
              <span className="ml-2 text-xs text-slate-400">Step {step} of 2</span>
            </div>
          )}

          {/* ── Step 1: Account ── */}
          {step === 1 && (
            <>
              <div>
                <h2 className="font-display font-bold text-2xl text-white">Create your account</h2>
                <p className="text-slate-400 text-sm mt-1">Start transcribing in under a minute</p>
              </div>

              <form onSubmit={handleNext} className="space-y-4">
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

                {errors._form && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                    {errors._form}
                  </p>
                )}

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
                  {role === 'admin' ? (loading ? 'Creating account…' : 'Create account') : 'Next — Set up profile'}
                </Button>
              </form>
            </>
          )}

          {/* ── Step 2: Specialty & profile ── */}
          {step === 2 && (
            <>
              <div>
                <h2 className="font-display font-bold text-2xl text-white">Your clinical profile</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Personalises AI summaries and PDF templates to your specialty
                </p>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                {/* Specialty selector */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-300">
                    Specialty <span className="text-red-400">*</span>
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {SPECIALTIES.map(sp => {
                      const Icon = sp.icon
                      const active = specialty === sp.code
                      return (
                        <button
                          key={sp.code}
                          type="button"
                          onClick={() => setSpecialty(sp.code)}
                          className={[
                            'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                            active
                              ? 'border-brand-500 bg-brand-500/10 text-white'
                              : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20',
                          ].join(' ')}
                        >
                          <Icon size={16} className={active ? 'text-brand-400 shrink-0' : 'text-slate-500 shrink-0'} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{sp.label}</div>
                            <div className="text-xs opacity-60 truncate">{sp.desc}</div>
                          </div>
                          {active && <CheckCircle2 size={14} className="text-brand-400 ml-auto shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Optional professional details */}
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                    Optional — printed on PDFs
                  </p>
                  <Input
                    label="Professional title"
                    type="text"
                    placeholder="e.g. MBBS, FCPS, Consultant Cardiologist"
                    value={doctorTitle}
                    onChange={e => setDoctorTitle(e.target.value)}
                    icon={<BadgeCheck size={15} />}
                  />
                  <Input
                    label="Clinic / Hospital name"
                    type="text"
                    placeholder="e.g. City General Hospital"
                    value={clinicName}
                    onChange={e => setClinicName(e.target.value)}
                    icon={<Building2 size={15} />}
                  />
                </div>

                {errors._form && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                    {errors._form}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:border-white/20 hover:text-slate-300 transition-colors"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <Button type="submit" className="flex-1" size="lg" glow loading={loading}>
                    {loading ? 'Creating account…' : 'Create account'}
                  </Button>
                </div>
              </form>
            </>
          )}

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
