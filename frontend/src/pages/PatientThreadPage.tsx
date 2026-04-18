import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, User, Clock, CheckCircle2, Loader2,
  AlertCircle, ShieldCheck, FileText, Pencil, Check,
  X, Phone, BookOpen, Calendar, Tag, Plus, Mic,
} from 'lucide-react'
import { Sidebar }    from '../components/ui/Sidebar'
import { Badge }      from '../components/ui/Badge'
import { Card }       from '../components/ui/Card'
import { Button }     from '../components/ui/Button'
import { Input }      from '../components/ui/Input'
import { useToast }   from '../components/ui/Toaster'
import { cn }         from '../utils/cn'
import api            from '../lib/api'

// ── Types ────────────────────────────────────────────────────
interface Session {
  id:          string
  title:       string | null
  status:      'complete' | 'processing' | 'failed' | 'approved'
  language:    string | null
  duration:    number | null
  created_at:  string
}

interface PatientThread {
  id:              string
  patient_code:    string | null
  name:            string
  age:             string | null
  gender:          string | null
  contact:         string | null
  medical_history: string | null
  session_count:   number
  last_session_at: string | null
  sessions:        Session[]
}

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const statusConfig = {
  complete:   { badge: <Badge variant="success"    dot>Complete</Badge> },
  processing: { badge: <Badge variant="processing" dot>Processing</Badge> },
  failed:     { badge: <Badge variant="error"      dot>Failed</Badge> },
  approved:   { badge: <Badge variant="success"    dot>Approved</Badge> },
}

// ── Session row in thread timeline ───────────────────────────
function SessionRow({ session, index }: { session: Session; index: number }) {
  const cfg = statusConfig[session.status] ?? statusConfig.complete
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
    >
      <Link to={`/session/${session.id}`} className="group block">
        <div className={cn(
          'flex items-center gap-4 rounded-2xl border px-4 py-3.5',
          'bg-white/3 border-white/8',
          'hover:bg-white/6 hover:border-brand-500/25 hover:shadow-glow',
          'transition-all duration-200',
        )}>
          {/* Index bubble */}
          <div className="h-7 w-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-slate-400">
              {index + 1}
            </span>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate group-hover:text-brand-300 transition-colors">
              {session.title || 'Untitled session'}
            </p>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatDateShort(session.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDuration(session.duration)}
              </span>
              {session.language && (
                <span className="flex items-center gap-1">
                  <Mic size={10} />
                  {session.language}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0">{cfg.badge}</div>
        </div>
      </Link>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function PatientThreadPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast    = useToast()

  const [patient,  setPatient]  = useState<PatientThread | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  const [draft, setDraft] = useState({
    name: '', age: '', gender: '', contact: '', medical_history: '',
  })

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get<{ patient: PatientThread }>(`/api/patients/${id}`)
      .then(r => setPatient(r.data.patient))
      .catch(err => {
        setError(err?.response?.status === 404 ? 'Patient not found.' : 'Could not load patient thread.')
      })
      .finally(() => setLoading(false))
  }, [id])

  function startEdit() {
    if (!patient) return
    setDraft({
      name:            patient.name,
      age:             patient.age    ?? '',
      gender:          patient.gender ?? '',
      contact:         patient.contact ?? '',
      medical_history: patient.medical_history ?? '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!patient || !draft.name.trim()) return
    setSaving(true)
    try {
      const res = await api.patch<{ patient: PatientThread }>(`/api/patients/${patient.id}`, {
        name:            draft.name.trim(),
        age:             draft.age.trim() || null,
        gender:          draft.gender.trim() || null,
        contact:         draft.contact.trim() || null,
        medical_history: draft.medical_history.trim() || null,
      })
      setPatient(prev => prev ? { ...prev, ...res.data.patient } : prev)
      setEditing(false)
      toast('Patient updated', 'success')
    } catch {
      toast('Could not save changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex bg-surface-400">
        <Sidebar />
        <main className="flex-1 flex flex-col">
          <header className="border-b border-white/8 px-6 py-4 flex items-center gap-4">
            <div className="h-8 w-8 rounded-xl bg-white/4 animate-pulse" />
            <div className="h-5 w-48 rounded-lg bg-white/4 animate-pulse" />
          </header>
          <div className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-4">
            <div className="h-32 rounded-2xl bg-white/4 animate-pulse" />
            <div className="h-48 rounded-2xl bg-white/4 animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────
  if (error || !patient) {
    return (
      <div className="min-h-screen flex bg-surface-400">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={36} className="mx-auto mb-4 text-red-400" />
            <p className="text-white font-semibold mb-1">{error || 'Patient not found'}</p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app')} className="mt-4">
              <ArrowLeft size={14} /> Back to sessions
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const sessions = patient.sessions ?? []

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">

        {/* ── Top bar ──────────────────────────────────────── */}
        <header className="border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-brand-400">{patient.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display font-bold text-lg text-white truncate">{patient.name}</h1>
                  {patient.patient_code && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-2.5 py-0.5 shrink-0">
                      <Tag size={9} />
                      {patient.patient_code}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {patient.session_count} session{patient.session_count !== 1 ? 's' : ''}
                  {patient.last_session_at && (
                    <> · Last seen {formatDateShort(patient.last_session_at)}</>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <Button variant="secondary" size="sm" onClick={startEdit}>
                <Pencil size={13} /> Edit details
              </Button>
            )}
            <Link
              to="/live"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow transition-colors"
            >
              <Plus size={13} />
              New session
            </Link>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

          {/* ── Patient details card ─────────────────────── */}
          <Card variant="elevated" className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <User size={14} className="text-brand-400" />
                Patient details
              </h2>
              {editing && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-white/4 border border-white/10 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    <X size={11} /> Cancel
                  </button>
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {editing ? (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <div className="sm:col-span-2">
                    <Input
                      label="Full name"
                      value={draft.name}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="Patient name"
                      icon={<User size={14} />}
                    />
                  </div>
                  <Input
                    label="Age"
                    value={draft.age}
                    onChange={e => setDraft(d => ({ ...d, age: e.target.value }))}
                    placeholder="e.g. 45 years"
                    icon={<Calendar size={14} />}
                  />
                  <Input
                    label="Gender"
                    value={draft.gender}
                    onChange={e => setDraft(d => ({ ...d, gender: e.target.value }))}
                    placeholder="e.g. Male, Female"
                    icon={<User size={14} />}
                  />
                  <Input
                    label="Contact"
                    value={draft.contact}
                    onChange={e => setDraft(d => ({ ...d, contact: e.target.value }))}
                    placeholder="Phone or email"
                    icon={<Phone size={14} />}
                  />
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Medical history</label>
                    <textarea
                      value={draft.medical_history}
                      onChange={e => setDraft(d => ({ ...d, medical_history: e.target.value }))}
                      placeholder="Pre-existing conditions, allergies, chronic medications…"
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: Calendar, label: 'Age',    value: patient.age    },
                      { icon: User,     label: 'Gender', value: patient.gender },
                      { icon: Phone,    label: 'Contact',value: patient.contact },
                    ].filter(f => f.value).map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-start gap-2">
                        <div className="h-6 w-6 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon size={11} className="text-brand-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                          <p className="text-sm text-white">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {patient.medical_history && (
                    <div className="pt-3 border-t border-white/8">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen size={11} className="text-slate-500" />
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Medical history</p>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {patient.medical_history}
                      </p>
                    </div>
                  )}
                  {!patient.age && !patient.gender && !patient.contact && !patient.medical_history && (
                    <p className="text-xs text-slate-500 py-2">No additional details. Click "Edit details" to add.</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* ── Session timeline ─────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <FileText size={14} className="text-brand-400" />
                Session history
                <span className="text-xs text-slate-500 font-normal ml-1">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                </span>
              </h2>
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 py-16 text-center">
                <FileText size={28} className="mx-auto mb-3 text-slate-600" />
                <p className="text-sm text-slate-500">No sessions linked to this patient yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Open any session and use the Patient panel to link it here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => (
                  <SessionRow key={s.id} session={s} index={i} />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
