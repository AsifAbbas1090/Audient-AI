import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Search, Clock, FileText, Zap,
  CheckCircle2, ChevronRight, Loader2,
  User, MessageSquare, AlertTriangle,
} from 'lucide-react'
import { Button } from './ui/Button'
import { cn }    from '../utils/cn'
import api       from '../lib/api'

interface Doctor {
  id:           string
  name:         string
  email:        string
  specialty:    string
  doctor_title: string | null
  clinic_name:  string | null
}

interface ConsultSession {
  id:           string
  title:        string | null
  patient_id?:  string | null
  patient_code?: string | null
  patient_name?: string | null
  patient?:     { session_count?: number } | null
}

interface ConsultModalProps {
  session: ConsultSession
  onClose: () => void
  onSent?: () => void
}

const MODES = [
  {
    id:          'quick_opinion',
    label:       'Quick Second Opinion',
    icon:        Clock,
    color:       'text-sky-400',
    border:      'border-sky-500/30',
    bg:          'bg-sky-500/10',
    bgSelected:  'bg-sky-500/20 border-sky-400/40',
    access:      'Read',
    expiry:      '4 hours',
    desc:        '4-hour read access — comment only.',
  },
  {
    id:          'formal_consult',
    label:       'Formal Consult',
    icon:        FileText,
    color:       'text-violet-400',
    border:      'border-violet-500/30',
    bg:          'bg-violet-500/10',
    bgSelected:  'bg-violet-500/20 border-violet-400/40',
    access:      'Comment',
    expiry:      '48 hours',
    desc:        '48 hours — can annotate and comment.',
  },
  {
    id:          'urgent',
    label:       'Urgent',
    icon:        Zap,
    color:       'text-red-400',
    border:      'border-red-500/30',
    bg:          'bg-red-500/10',
    bgSelected:  'bg-red-500/20 border-red-400/40',
    access:      'Write',
    expiry:      '24 hours',
    desc:        '24 hours — can edit and comment.',
  },
]

export function ConsultModal({ session, onClose, onSent }: ConsultModalProps) {
  const [step,           setStep]           = useState<1 | 2 | 3 | 4>(1)
  const [mode,           setMode]           = useState<string>('')
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [includeThread,  setIncludeThread]  = useState(false)
  const [note,           setNote]           = useState('')
  const [sending,        setSending]        = useState(false)

  const [query,          setQuery]          = useState('')
  const [doctors,        setDoctors]        = useState<Doctor[]>([])
  const [searching,      setSearching]      = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasPatientThread = !!session.patient_id
  const threadSessionCount = session.patient?.session_count ?? 1

  useEffect(() => {
    if (step !== 2) return
    if (searchRef.current) clearTimeout(searchRef.current)
    setSearching(true)
    searchRef.current = setTimeout(() => {
      api.get<{ users: Doctor[] }>(`/api/users/search${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        .then(r => setDoctors(r.data.users))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 300)
  }, [query, step])

  async function send() {
    if (!mode || !selectedDoctor) return
    setSending(true)
    try {
      await api.post('/api/consults', {
        session_id:     session.id,
        reviewer_id:    selectedDoctor.id,
        mode,
        include_thread: includeThread,
        requester_note: note || undefined,
      })
      onSent?.()
      onClose()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not send consult request')
    } finally {
      setSending(false)
    }
  }

  const selectedMode = MODES.find(m => m.id === mode)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-surface-200 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="font-semibold text-white text-sm">Request a Consultation</h2>
            <p className="text-xs text-slate-500 mt-0.5">Step {step} of {hasPatientThread ? 4 : 3}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 py-3 gap-1.5 border-b border-white/6">
          {Array.from({ length: hasPatientThread ? 4 : 3 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step > i ? 'bg-brand-500' : 'bg-white/10',
              )}
            />
          ))}
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Mode picker ── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <p className="text-xs text-slate-400 mb-4">What type of consultation do you need?</p>
                <div className="space-y-2">
                  {MODES.map(m => {
                    const Icon = m.icon
                    const selected = mode === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={cn(
                          'w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                          selected ? m.bgSelected : `border-white/10 bg-white/4 hover:border-white/20`,
                        )}
                      >
                        <Icon size={16} className={cn('mt-0.5 shrink-0', selected ? m.color : 'text-slate-500')} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn('text-sm font-medium', selected ? 'text-white' : 'text-slate-300')}>{m.label}</p>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', m.bg, m.color, m.border)}>
                              {m.access} · {m.expiry}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                        </div>
                        {selected && <CheckCircle2 size={14} className={cn('shrink-0 mt-0.5', m.color)} />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Colleague picker ── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <p className="text-xs text-slate-400 mb-3">Search for a colleague to send the request to.</p>
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {searching && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {doctors.length === 0 && !searching && (
                    <p className="text-xs text-slate-500 text-center py-6">
                      {query ? 'No doctors found.' : 'Start typing to search registered doctors.'}
                    </p>
                  )}
                  {doctors.map(d => {
                    const selected = selectedDoctor?.id === d.id
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDoctor(d)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                          selected
                            ? 'border-brand-500/40 bg-brand-500/15 text-white'
                            : 'border-white/8 bg-white/4 hover:border-white/20 text-slate-300',
                        )}
                      >
                        <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-brand-400">{d.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {[d.doctor_title, d.specialty?.replace('_', ' ')].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {selected && <CheckCircle2 size={13} className="text-brand-400 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Thread scope (only if patient thread exists) ── */}
            {step === 3 && hasPatientThread && (
              <motion.div key="step3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <p className="text-xs text-slate-400 mb-4">
                  This session is linked to patient {session.patient_code ?? ''} — {session.patient_name ?? 'Unknown'}.
                  What should your colleague be able to see?
                </p>
                <div className="space-y-2">
                  {[
                    {
                      value: false,
                      label: 'This session only',
                      desc:  'Colleague sees only the current session transcript and summary.',
                      icon:  FileText,
                    },
                    {
                      value: true,
                      label: `Share full patient thread (${threadSessionCount} session${threadSessionCount === 1 ? '' : 's'})`,
                      desc:  'Colleague sees every session linked to this patient.',
                      icon:  User,
                    },
                  ].map(opt => {
                    const Icon = opt.icon
                    const sel  = includeThread === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        onClick={() => setIncludeThread(opt.value)}
                        className={cn(
                          'w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                          sel ? 'border-brand-500/40 bg-brand-500/15' : 'border-white/10 bg-white/4 hover:border-white/20',
                        )}
                      >
                        <Icon size={15} className={cn('mt-0.5 shrink-0', sel ? 'text-brand-400' : 'text-slate-500')} />
                        <div>
                          <p className={cn('text-sm font-medium', sel ? 'text-white' : 'text-slate-300')}>{opt.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                        </div>
                        {sel && <CheckCircle2 size={13} className="text-brand-400 shrink-0 ml-auto mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Final step: Confirmation ── */}
            {((step === 3 && !hasPatientThread) || (step === 4 && hasPatientThread)) && (
              <motion.div key="confirm" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                {/* Confirmation banner */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200 leading-relaxed">
                      You are sharing{' '}
                      <strong>
                        {includeThread && session.patient_code
                          ? `${session.patient_code} — ${session.patient_name ?? 'patient'} — ${threadSessionCount} session${threadSessionCount === 1 ? '' : 's'}`
                          : `"${session.title || 'Untitled session'}"`}
                      </strong>
                      {' '}
                      with <strong>{selectedDoctor?.name}</strong>
                      {selectedDoctor?.specialty ? ` (${selectedDoctor.specialty.replace(/_/g, ' ')})` : ''} as{' '}
                      <strong>{selectedMode?.label}</strong>. Access expires in <strong>{selectedMode?.expiry}</strong>.
                    </p>
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-2 text-xs mb-4">
                  {[
                    { label: 'Session',    value: session.title || 'Untitled session' },
                    { label: 'Colleague',  value: selectedDoctor?.name ?? '' },
                    { label: 'Mode',       value: selectedMode?.label ?? '' },
                    { label: 'Access',     value: `${selectedMode?.access} · expires in ${selectedMode?.expiry}` },
                    { label: 'Scope',      value: includeThread ? 'Full patient thread' : 'This session only' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <span className="text-slate-500 shrink-0">{label}</span>
                      <span className="text-slate-200 text-right truncate">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Optional note */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Clinical note — optional
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Add a clinical note — optional"
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/8">
          <button
            onClick={() => step > 1 ? setStep(s => (s - 1) as typeof step) : onClose()}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {/* Step 1 */}
          {step === 1 && (
            <Button size="sm" glow disabled={!mode} onClick={() => setStep(2)}>
              Next <ChevronRight size={13} />
            </Button>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <Button size="sm" glow disabled={!selectedDoctor} onClick={() => setStep(hasPatientThread ? 3 : 3)}>
              Next <ChevronRight size={13} />
            </Button>
          )}

          {/* Step 3 thread scope */}
          {step === 3 && hasPatientThread && (
            <Button size="sm" glow onClick={() => setStep(4)}>
              Review & Confirm <ChevronRight size={13} />
            </Button>
          )}

          {/* Final step: send */}
          {((step === 3 && !hasPatientThread) || (step === 4 && hasPatientThread)) && (
            <Button size="sm" glow loading={sending} onClick={send}>
              <MessageSquare size={13} />
              Send Consult
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default ConsultModal
