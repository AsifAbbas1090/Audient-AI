import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Clock, Globe, CheckCircle2,
  AlertCircle, Loader2, FileText, Brain, User,
  Calendar, HeartPulse, BookOpen, Smile, StickyNote,
  Pencil, X, Check, Plus, Lock, ShieldCheck, Bell,
  Sparkles, FlaskConical, Stethoscope, TriangleAlert, RefreshCw,
  UserSearch, UserPlus, Phone, Link2, Unlink,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Button }        from '../components/ui/Button'
import { Badge }         from '../components/ui/Badge'
import { Card }          from '../components/ui/Card'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { useToast }      from '../components/ui/Toaster'
import api from '../lib/api'

// ── Types ────────────────────────────────────────────────────
interface TranscriptLine {
  id:         string
  speaker:    string | null
  text:       string
  start_time: number | null
  end_time:   number | null
  line_order: number
}

interface FieldReminder {
  id:          string
  field_name:  string
  severity:    'critical' | 'important' | 'optional'
  is_resolved: boolean
  resolved_at: string | null
}

interface SummaryFields {
  patient_name:    string | null
  patient_age:     string | null
  patient_gender:  string | null
  disease:         string | null
  education:       string | null
  emotional_state: string | null
  additional_notes:string | null
  summary_text:    string | null
}

interface Summary extends SummaryFields {
  field_reminders: FieldReminder[]
}

interface Recommendations {
  differential_diagnosis: string[]
  suggested_tests:        string[]
  treatment_suggestions:  string[]
  followup_notes:         string
  risk_flags:             string[]
}

interface Patient {
  id:              string
  name:            string
  age:             string | null
  gender:          string | null
  contact:         string | null
  medical_history: string | null
}

interface Conversation {
  id:          string
  title:       string | null
  status:      'complete' | 'processing' | 'failed' | 'approved'
  language:    string | null
  duration:    number | null
  created_at:  string
  approved_at: string | null
  patient_id:  string | null
  patient?:    Patient | null
  transcript?: {
    raw_text:   string | null
    lines:      TranscriptLine[]
  }
  summary?: Summary | null
}

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

function formatTimestamp(sec: number | null): string | undefined {
  if (sec == null) return undefined
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const statusConfig = {
  complete:   { variant: 'success'  as const, icon: <CheckCircle2 size={13} /> },
  processing: { variant: 'warning'  as const, icon: <Loader2 size={13} className="animate-spin" /> },
  failed:     { variant: 'error'    as const, icon: <AlertCircle size={13} /> },
  approved:   { variant: 'success'  as const, icon: <ShieldCheck size={13} /> },
}

// ── Page ─────────────────────────────────────────────────────
export default function SessionDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast    = useToast()

  const [conv,          setConv]          = useState<Conversation | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [editingTitle,  setEditingTitle]  = useState(false)
  const [titleDraft,    setTitleDraft]    = useState('')
  const [savingTitle,   setSavingTitle]   = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Approval
  const [approvingSession, setApprovingSession] = useState(false)

  // AI Recommendations
  const [recommendations,     setRecommendations]     = useState<Recommendations | null>(null)
  const [loadingRecommend,    setLoadingRecommend]    = useState(false)
  const [recommendError,      setRecommendError]      = useState<string | null>(null)

  // Patient linking
  const [patientSearch,       setPatientSearch]       = useState('')
  const [patientResults,      setPatientResults]      = useState<Patient[]>([])
  const [searchingPatient,    setSearchingPatient]    = useState(false)
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [linkingPatient,      setLinkingPatient]      = useState(false)
  const [showNewPatient,      setShowNewPatient]      = useState(false)
  const [newPatientName,      setNewPatientName]      = useState('')
  const patientSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Summary editing
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryDraft,   setSummaryDraft]   = useState<SummaryFields>({
    patient_name: null, patient_age: null, patient_gender: null,
    disease: null, education: null, emotional_state: null,
    additional_notes: null, summary_text: null,
  })
  const [savingSummary, setSavingSummary] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api.get<{ conversation: Conversation }>(`/api/conversations/${id}`)
      .then(r => setConv(r.data.conversation))
      .catch(err => {
        const msg = err?.response?.status === 404
          ? 'Session not found.'
          : 'Could not load session — is the backend running?'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [id])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  function startEditTitle() {
    setTitleDraft(conv?.title || '')
    setEditingTitle(true)
  }

  async function saveTitle() {
    if (!conv || !titleDraft.trim()) { setEditingTitle(false); return }
    setSavingTitle(true)
    try {
      await api.patch(`/api/conversations/${conv.id}`, { title: titleDraft.trim() })
      setConv(prev => prev ? { ...prev, title: titleDraft.trim() } : prev)
      toast('Title updated', 'success')
    } catch {
      toast('Could not update title', 'error')
    } finally {
      setSavingTitle(false)
      setEditingTitle(false)
    }
  }

  function cancelEditTitle() {
    setEditingTitle(false)
    setTitleDraft('')
  }

  // ── Summary editing ───────────────────────────────────────
  function startEditSummary() {
    const s = conv?.summary
    setSummaryDraft({
      patient_name:     s?.patient_name     ?? null,
      patient_age:      s?.patient_age      ?? null,
      patient_gender:   s?.patient_gender   ?? null,
      disease:          s?.disease          ?? null,
      education:        s?.education        ?? null,
      emotional_state:  s?.emotional_state  ?? null,
      additional_notes: s?.additional_notes ?? null,
      summary_text:     s?.summary_text     ?? null,
    })
    setEditingSummary(true)
  }

  async function saveSummary() {
    if (!conv) return
    setSavingSummary(true)
    try {
      const res = await api.patch(`/api/conversations/${conv.id}/summary`, summaryDraft)
      setConv(prev => prev ? { ...prev, summary: res.data.summary } : prev)
      setEditingSummary(false)
      toast('Medical data updated', 'success')
    } catch {
      toast('Could not save changes', 'error')
    } finally {
      setSavingSummary(false)
    }
  }

  function cancelEditSummary() {
    setEditingSummary(false)
  }

  // ── Approval ──────────────────────────────────────────────
  async function handleApprove() {
    if (!conv) return
    setApprovingSession(true)
    try {
      const res = await api.patch(`/api/conversations/${conv.id}`, { status: 'approved' })
      setConv(prev => prev ? { ...prev, ...res.data.conversation } : prev)
      setEditingSummary(false)
      setEditingTitle(false)
      toast('Record approved and locked', 'success')
    } catch {
      toast('Could not approve record', 'error')
    } finally {
      setApprovingSession(false)
    }
  }

  // ── AI Recommendations ───────────────────────────────────
  async function generateRecommendations() {
    if (!conv) return
    setLoadingRecommend(true)
    setRecommendError(null)
    try {
      const res = await api.post<{ recommendations: Recommendations }>(
        `/api/conversations/${conv.id}/recommend`
      )
      setRecommendations(res.data.recommendations)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Could not generate recommendations'
      setRecommendError(msg)
    } finally {
      setLoadingRecommend(false)
    }
  }

  // ── Resolve field reminder ───────────────────────────────
  async function resolveReminder(reminderId: string) {
    if (!conv) return
    try {
      await api.patch(`/api/conversations/${conv.id}/reminders/${reminderId}/resolve`)
      setConv(prev => {
        if (!prev?.summary) return prev
        return {
          ...prev,
          summary: {
            ...prev.summary!,
            field_reminders: prev.summary!.field_reminders.map(r =>
              r.id === reminderId ? { ...r, is_resolved: true } : r
            ),
          },
        }
      })
    } catch {
      toast('Could not resolve alert', 'error')
    }
  }

  // ── Patient search / link ────────────────────────────────
  function handlePatientSearchChange(val: string) {
    setPatientSearch(val)
    setShowPatientDropdown(true)
    if (patientSearchRef.current) clearTimeout(patientSearchRef.current)
    if (!val.trim()) { setPatientResults([]); return }
    patientSearchRef.current = setTimeout(async () => {
      setSearchingPatient(true)
      try {
        const res = await api.get<{ patients: Patient[] }>(`/api/patients?q=${encodeURIComponent(val)}&limit=8`)
        setPatientResults(res.data.patients)
      } catch { /* silent */ }
      finally { setSearchingPatient(false) }
    }, 300)
  }

  async function linkPatient(patientId: string | null) {
    if (!conv) return
    setLinkingPatient(true)
    try {
      const res = await api.patch(`/api/conversations/${conv.id}/patient`, { patient_id: patientId })
      setConv(prev => prev ? {
        ...prev,
        patient_id: res.data.conversation.patient_id,
        patient:    res.data.conversation.patient ?? null,
      } : prev)
      toast(patientId ? 'Patient linked' : 'Patient unlinked', 'success')
    } catch { toast('Could not update patient link', 'error') }
    finally {
      setLinkingPatient(false)
      setPatientSearch('')
      setPatientResults([])
      setShowPatientDropdown(false)
      setShowNewPatient(false)
    }
  }

  async function createAndLinkPatient() {
    if (!conv || !newPatientName.trim()) return
    setLinkingPatient(true)
    try {
      const res = await api.post<{ patient: Patient }>('/api/patients', { name: newPatientName.trim() })
      await linkPatient(res.data.patient.id)
    } catch { toast('Could not create patient', 'error'); setLinkingPatient(false) }
  }

  // ── Export ────────────────────────────────────────────────
  const handleExport = () => {
    if (!conv) return
    const lines: string[] = [
      `Session: ${conv.title || 'Untitled'}`,
      `Date:    ${formatDate(conv.created_at)}`,
      `Lang:    ${conv.language || 'Unknown'}`,
      `Dur:     ${formatDuration(conv.duration)}`,
      '',
    ]

    if (conv.transcript?.lines?.length) {
      lines.push('── TRANSCRIPT ──')
      conv.transcript.lines.forEach(l => {
        const ts = formatTimestamp(l.start_time)
        lines.push(`${ts ? `[${ts}] ` : ''}${l.speaker || 'Speaker'}: ${l.text}`)
      })
      lines.push('')
    }

    if (conv.summary) {
      const s = conv.summary
      lines.push('── MEDICAL EXTRACTION ──')
      if (s.patient_name)    lines.push(`Name:            ${s.patient_name}`)
      if (s.patient_age)     lines.push(`Age:             ${s.patient_age}`)
      if (s.patient_gender)  lines.push(`Gender:          ${s.patient_gender}`)
      if (s.disease)         lines.push(`Condition:       ${s.disease}`)
      if (s.education)       lines.push(`Education:       ${s.education}`)
      if (s.emotional_state) lines.push(`Emotional State: ${s.emotional_state}`)
      if (s.additional_notes)lines.push(`Notes:           ${s.additional_notes}`)
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `session-${id}.txt`; a.click()
    URL.revokeObjectURL(url)
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
          <div className="flex-1 p-6">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-64 rounded-2xl bg-white/4 animate-pulse" />
                <div className="h-48 rounded-2xl bg-white/4 animate-pulse" />
              </div>
              <div className="space-y-4">
                <div className="h-40 rounded-2xl bg-white/4 animate-pulse" />
                <div className="h-32 rounded-2xl bg-white/4 animate-pulse" />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────
  if (error || !conv) {
    return (
      <div className="min-h-screen flex bg-surface-400">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={36} className="mx-auto mb-4 text-red-400" />
            <p className="text-white font-semibold mb-1">{error || 'Session not found'}</p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app')} className="mt-4">
              <ArrowLeft size={14} /> Back to sessions
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const lines      = conv.transcript?.lines ?? []
  const summary    = conv.summary
  const cfg        = statusConfig[conv.status] ?? statusConfig.complete
  const isApproved = conv.status === 'approved'

  const hasSummary = summary && (
    summary.patient_name || summary.patient_age || summary.patient_gender ||
    summary.disease || summary.education || summary.emotional_state ||
    summary.additional_notes
  )

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate('/app')}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              {editingTitle && !isApproved ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') cancelEditTitle() }}
                    className="font-display font-bold text-lg text-white bg-white/8 border border-brand-500/50 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 w-64"
                  />
                  <button onClick={saveTitle} disabled={savingTitle} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                    {savingTitle ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  </button>
                  <button onClick={cancelEditTitle} className="text-slate-500 hover:text-slate-300">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="font-display font-bold text-lg text-white truncate">
                    {conv.title || 'Untitled session'}
                  </h1>
                  {isApproved
                    ? <Lock size={13} className="text-emerald-500 shrink-0" />
                    : (
                      <button
                        onClick={startEditTitle}
                        className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/8 opacity-0 group-hover:opacity-100 transition-all"
                        title="Edit title"
                      >
                        <Pencil size={13} />
                      </button>
                    )
                  }
                </div>
              )}
              <p className="text-xs text-slate-500 mt-0.5">
                {formatDate(conv.created_at)}
                {conv.approved_at && (
                  <span className="ml-2 text-emerald-500">
                    · Approved {formatDate(conv.approved_at)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={cfg.variant}>
              <span className="flex items-center gap-1.5">
                {cfg.icon}
                {conv.status}
              </span>
            </Badge>

            {/* Approve button — only shown on complete sessions */}
            {conv.status === 'complete' && (
              <Button
                size="sm"
                onClick={handleApprove}
                loading={approvingSession}
                glow
              >
                <ShieldCheck size={13} />
                Approve & Lock
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download size={13} />
              Export
            </Button>
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Approved banner */}
          {isApproved && (
            <div className="max-w-6xl mx-auto mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
              <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
              <span>
                This record has been approved and is <strong>locked for editing</strong>.
                {conv.approved_at && <> Approved on {formatDate(conv.approved_at)}.</>}
              </span>
            </div>
          )}

          <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">

            {/* ── Left: transcript ────────────────────────── */}
            <div className="lg:col-span-2 flex flex-col gap-4">

              {/* Meta pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { icon: Clock, text: formatDuration(conv.duration) },
                  { icon: Globe, text: conv.language || 'Unknown language' },
                ].map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/4 border border-white/8 rounded-full px-3 py-1.5"
                  >
                    <Icon size={11} className="text-slate-500" />
                    {text}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/4 border border-white/8 rounded-full px-3 py-1.5">
                  <Calendar size={11} className="text-slate-500" />
                  {new Date(conv.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Transcript card */}
              <Card variant="elevated" className="flex-1">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                  <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                    <FileText size={14} className="text-brand-400" />
                    Transcript
                  </h2>
                  <span className="text-xs text-slate-500">{lines.length} segments</span>
                </div>

                <div className="px-5 py-4">
                  {lines.length > 0 ? (
                    <div className="space-y-3">
                      {lines.map(line => (
                        <SpeakerBubble
                          key={line.id}
                          speaker={line.speaker || 'Speaker'}
                          text={line.text}
                          timestamp={formatTimestamp(line.start_time)}
                        />
                      ))}
                    </div>
                  ) : conv.transcript?.raw_text ? (
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {conv.transcript.raw_text}
                    </p>
                  ) : (
                    <div className="py-12 text-center">
                      <FileText size={28} className="mx-auto mb-3 text-slate-600" />
                      <p className="text-sm text-slate-500">No transcript available for this session.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* ── Right: summary panel ────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* Summary text */}
              {summary?.summary_text && (
                <Card variant="elevated" className="p-5">
                  <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                    <Brain size={14} className="text-brand-400" />
                    Summary
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">{summary.summary_text}</p>
                </Card>
              )}

              {/* Extracted medical fields — view or edit */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Brain size={14} className="text-brand-400" />
                    Medical Extraction
                  </h2>
                  {isApproved ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                      <Lock size={11} /> Locked
                    </div>
                  ) : editingSummary ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveSummary}
                        disabled={savingSummary}
                        className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 transition-colors"
                      >
                        {savingSummary ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Save
                      </button>
                      <button
                        onClick={cancelEditSummary}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-white/4 border border-white/10 rounded-lg px-2.5 py-1 transition-colors"
                      >
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startEditSummary}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-300 hover:bg-brand-500/10 border border-transparent hover:border-brand-500/20 rounded-lg px-2.5 py-1 transition-all"
                    >
                      {hasSummary ? <><Pencil size={11} /> Edit</> : <><Plus size={11} /> Add data</>}
                    </button>
                  )}
                </div>

                {editingSummary ? (
                  /* ── Edit mode ── */
                  <div className="space-y-3">
                    {([
                      { key: 'patient_name',    label: 'Patient Name',    icon: User,       multiline: false },
                      { key: 'patient_age',     label: 'Age',             icon: Calendar,   multiline: false },
                      { key: 'patient_gender',  label: 'Gender',          icon: User,       multiline: false },
                      { key: 'disease',         label: 'Condition / Disease', icon: HeartPulse, multiline: false },
                      { key: 'education',       label: 'Education',       icon: BookOpen,   multiline: false },
                      { key: 'emotional_state', label: 'Emotional State', icon: Smile,      multiline: false },
                    ] as const).map(({ key, label, icon: Icon }) => (
                      <div key={key}>
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          <Icon size={10} />
                          {label}
                        </label>
                        <input
                          type="text"
                          value={summaryDraft[key] ?? ''}
                          onChange={e => setSummaryDraft(d => ({ ...d, [key]: e.target.value }))}
                          placeholder={`Enter ${label.toLowerCase()}…`}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        <StickyNote size={10} />
                        Additional Notes
                      </label>
                      <textarea
                        value={summaryDraft.additional_notes ?? ''}
                        onChange={e => setSummaryDraft(d => ({ ...d, additional_notes: e.target.value }))}
                        placeholder="Medicines, allergies, follow-up instructions…"
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                      />
                    </div>
                  </div>
                ) : hasSummary ? (
                  /* ── View mode ── */
                  <div className="space-y-3">
                    {[
                      { icon: User,       label: 'Patient',   value: summary!.patient_name    },
                      { icon: Calendar,   label: 'Age',       value: summary!.patient_age     },
                      { icon: User,       label: 'Gender',    value: summary!.patient_gender  },
                      { icon: HeartPulse, label: 'Condition', value: summary!.disease         },
                      { icon: BookOpen,   label: 'Education', value: summary!.education       },
                      { icon: Smile,      label: 'Emotional', value: summary!.emotional_state },
                    ]
                      .filter(f => f.value)
                      .map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-3">
                          <div className="h-6 w-6 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon size={11} className="text-brand-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                            <p className="text-sm text-white">{value}</p>
                          </div>
                        </div>
                      ))}
                    {summary!.additional_notes && (
                      <div className="pt-3 border-t border-white/8">
                        <div className="flex items-center gap-2 mb-2">
                          <StickyNote size={11} className="text-slate-500" />
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Notes</p>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {summary!.additional_notes}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Empty state ── */
                  <div className="py-6 text-center">
                    <Brain size={24} className="mx-auto mb-3 text-slate-600" />
                    <p className="text-sm text-slate-500">No extraction data yet.</p>
                    <p className="text-xs text-slate-600 mt-1">Click "Add data" to enter fields manually.</p>
                  </div>
                )}
              </Card>

              {/* Clinical Insights card */}
              {(conv.status === 'complete' || conv.status === 'approved') && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                      <Sparkles size={14} className="text-brand-400" />
                      Clinical Insights
                    </h2>
                    <button
                      onClick={generateRecommendations}
                      disabled={loadingRecommend}
                      className="flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 rounded-lg px-2.5 py-1 transition-all disabled:opacity-50"
                    >
                      {loadingRecommend
                        ? <><Loader2 size={11} className="animate-spin" /> Generating…</>
                        : recommendations
                          ? <><RefreshCw size={11} /> Regenerate</>
                          : <><Sparkles size={11} /> Generate</>
                      }
                    </button>
                  </div>

                  {recommendError && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">
                      <AlertCircle size={12} className="shrink-0" />
                      {recommendError}
                    </div>
                  )}

                  {!recommendations && !loadingRecommend && !recommendError && (
                    <div className="py-6 text-center">
                      <Sparkles size={22} className="mx-auto mb-2 text-slate-600" />
                      <p className="text-xs text-slate-500">Click Generate to get AI clinical insights for this session.</p>
                    </div>
                  )}

                  {loadingRecommend && (
                    <div className="py-6 text-center">
                      <Loader2 size={22} className="mx-auto mb-2 text-brand-400 animate-spin" />
                      <p className="text-xs text-slate-500">Analysing transcript with AI…</p>
                    </div>
                  )}

                  {recommendations && !loadingRecommend && (() => {
                    const sections = [
                      {
                        icon: Stethoscope,
                        label: 'Differential Diagnosis',
                        items: recommendations.differential_diagnosis,
                        color: 'text-purple-400',
                        bg:    'bg-purple-500/8 border-purple-500/20',
                      },
                      {
                        icon: FlaskConical,
                        label: 'Suggested Tests',
                        items: recommendations.suggested_tests,
                        color: 'text-sky-400',
                        bg:    'bg-sky-500/8 border-sky-500/20',
                      },
                      {
                        icon: HeartPulse,
                        label: 'Treatment Suggestions',
                        items: recommendations.treatment_suggestions,
                        color: 'text-emerald-400',
                        bg:    'bg-emerald-500/8 border-emerald-500/20',
                      },
                    ]
                    return (
                      <div className="space-y-4">
                        {sections.map(({ icon: Icon, label, items, color, bg }) =>
                          items.length > 0 && (
                            <div key={label}>
                              <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide mb-2 ${color}`}>
                                <Icon size={10} />
                                {label}
                              </div>
                              <ul className="space-y-1">
                                {items.map((item, i) => (
                                  <li
                                    key={i}
                                    className={`flex items-start gap-2 text-xs text-slate-300 rounded-lg border px-3 py-2 ${bg}`}
                                  >
                                    <span className="mt-0.5 shrink-0 opacity-50">·</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}

                        {recommendations.followup_notes && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-2">
                              <Calendar size={10} />
                              Follow-up
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                              {recommendations.followup_notes}
                            </p>
                          </div>
                        )}

                        {recommendations.risk_flags.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-2">
                              <TriangleAlert size={10} />
                              Risk Flags
                            </div>
                            <ul className="space-y-1">
                              {recommendations.risk_flags.map((flag, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2 text-xs text-red-300 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2"
                                >
                                  <TriangleAlert size={10} className="shrink-0 mt-0.5" />
                                  {flag}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-600 pt-1 border-t border-white/5">
                          AI suggestions only — requires professional clinical judgment.
                        </p>
                      </div>
                    )
                  })()}
                </Card>
              )}

              {/* Field Alerts card */}
              {(() => {
                const reminders = (summary?.field_reminders ?? []).filter(r => !r.is_resolved)
                if (!reminders.length) return null
                const severityStyle: Record<string, string> = {
                  critical:  'border-red-500/30 bg-red-500/8 text-red-300',
                  important: 'border-amber-500/30 bg-amber-500/8 text-amber-300',
                  optional:  'border-sky-500/30 bg-sky-500/8 text-sky-300',
                }
                const severityDot: Record<string, string> = {
                  critical:  'bg-red-500',
                  important: 'bg-amber-400',
                  optional:  'bg-sky-400',
                }
                const fieldLabel: Record<string, string> = {
                  patient_name:    'Patient Name',
                  disease:         'Condition / Disease',
                  patient_age:     'Age',
                  patient_gender:  'Gender',
                  emotional_state: 'Emotional State',
                  education:       'Education',
                  additional_notes:'Additional Notes',
                }
                return (
                  <Card variant="elevated" className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Bell size={14} className="text-amber-400" />
                      <h2 className="font-semibold text-white text-sm">Field Alerts</h2>
                      <span className="ml-auto text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded-full px-2 py-0.5 font-medium">
                        {reminders.length} missing
                      </span>
                    </div>
                    <div className="space-y-2">
                      {reminders.map(r => (
                        <div
                          key={r.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${severityStyle[r.severity]}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${severityDot[r.severity]}`} />
                            <span className="text-xs truncate">{fieldLabel[r.field_name] ?? r.field_name}</span>
                            <span className="text-[10px] opacity-60 shrink-0 capitalize">{r.severity}</span>
                          </div>
                          {!isApproved && (
                            <button
                              onClick={() => resolveReminder(r.id)}
                              className="shrink-0 text-[10px] opacity-70 hover:opacity-100 hover:text-white transition-opacity"
                              title="Dismiss alert"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isApproved && (
                      <p className="text-[10px] text-slate-600 mt-3">
                        Fill missing fields via Edit, then alerts will clear automatically.
                      </p>
                    )}
                  </Card>
                )
              })()}

              {/* Patient card */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                    <User size={14} className="text-brand-400" />
                    Patient
                  </h2>
                  {conv.patient && !isApproved && (
                    <button
                      onClick={() => linkPatient(null)}
                      disabled={linkingPatient}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      title="Unlink patient"
                    >
                      <Unlink size={10} /> Unlink
                    </button>
                  )}
                </div>

                {conv.patient ? (
                  /* Linked patient view */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-brand-400">
                          {conv.patient.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{conv.patient.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {[conv.patient.age, conv.patient.gender].filter(Boolean).join(' · ') || 'No details'}
                        </p>
                      </div>
                    </div>
                    {conv.patient.contact && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Phone size={10} className="text-slate-600" />
                        {conv.patient.contact}
                      </div>
                    )}
                    {conv.patient.medical_history && (
                      <p className="text-xs text-slate-400 bg-white/4 rounded-lg px-3 py-2 leading-relaxed line-clamp-3">
                        {conv.patient.medical_history}
                      </p>
                    )}
                  </div>
                ) : isApproved ? (
                  <p className="text-xs text-slate-500 py-2">No patient linked.</p>
                ) : (
                  /* Search / link UI */
                  <div className="space-y-2">
                    {!showNewPatient ? (
                      <>
                        <div className="relative">
                          <UserSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          <input
                            type="text"
                            value={patientSearch}
                            onChange={e => handlePatientSearchChange(e.target.value)}
                            onFocus={() => patientSearch && setShowPatientDropdown(true)}
                            onBlur={() => setTimeout(() => setShowPatientDropdown(false), 150)}
                            placeholder="Search patients…"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          {searchingPatient && (
                            <Loader2 size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
                          )}

                          {/* Dropdown */}
                          {showPatientDropdown && (patientResults.length > 0 || patientSearch) && (
                            <div className="absolute z-20 top-full mt-1 w-full bg-surface-300 border border-white/10 rounded-xl shadow-xl overflow-hidden">
                              {patientResults.map(p => (
                                <button
                                  key={p.id}
                                  onMouseDown={() => linkPatient(p.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/8 text-left transition-colors"
                                >
                                  <div className="h-6 w-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-bold text-brand-400">{p.name.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-white truncate">{p.name}</p>
                                    <p className="text-[10px] text-slate-500">{[p.age, p.gender].filter(Boolean).join(' · ') || '—'}</p>
                                  </div>
                                  <Link2 size={10} className="ml-auto text-slate-600 shrink-0" />
                                </button>
                              ))}
                              {patientResults.length === 0 && patientSearch && !searchingPatient && (
                                <div className="px-3 py-2 text-xs text-slate-500">No patients found</div>
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setShowNewPatient(true)}
                          className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          <UserPlus size={11} /> Create new patient
                        </button>
                      </>
                    ) : (
                      /* New patient inline form */
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newPatientName}
                          onChange={e => setNewPatientName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createAndLinkPatient() }}
                          placeholder="Patient full name…"
                          autoFocus
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={createAndLinkPatient}
                            disabled={!newPatientName.trim() || linkingPatient}
                            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                          >
                            {linkingPatient ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                            Create & Link
                          </button>
                          <button
                            onClick={() => { setShowNewPatient(false); setNewPatientName('') }}
                            className="text-xs text-slate-500 hover:text-slate-300 bg-white/4 border border-white/8 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Session metadata card */}
              <Card variant="flat" className="p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Session Info</h3>
                <div className="space-y-2">
                  {[
                    { label: 'ID',       value: conv.id.split('-')[0] + '…' },
                    { label: 'Duration', value: formatDuration(conv.duration) },
                    { label: 'Language', value: conv.language || 'Unknown' },
                    { label: 'Segments', value: lines.length.toString() },
                    { label: 'Mode',     value: 'Offline' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-xs font-medium text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
