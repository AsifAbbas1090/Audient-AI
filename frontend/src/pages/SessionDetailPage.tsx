import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Clock, Globe, CheckCircle2,
  AlertCircle, Loader2, FileText, Brain, User,
  Calendar, HeartPulse, BookOpen, Smile, StickyNote,
  Pencil, X, Check, Plus, Lock, ShieldCheck,
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

interface Summary {
  patient_name:    string | null
  patient_age:     string | null
  patient_gender:  string | null
  disease:         string | null
  education:       string | null
  emotional_state: string | null
  additional_notes:string | null
  summary_text:    string | null
}

interface Conversation {
  id:          string
  title:       string | null
  status:      'complete' | 'processing' | 'failed' | 'approved'
  language:    string | null
  duration:    number | null
  created_at:  string
  approved_at: string | null
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

  // Summary editing
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryDraft,   setSummaryDraft]   = useState<Summary>({
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
