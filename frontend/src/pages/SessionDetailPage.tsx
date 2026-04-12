import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Clock, Globe, CheckCircle2,
  AlertCircle, Loader2, FileText, Brain, User,
  Calendar, HeartPulse, BookOpen, Smile, StickyNote,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Button }        from '../components/ui/Button'
import { Badge }         from '../components/ui/Badge'
import { Card }          from '../components/ui/Card'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
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
  id:         string
  title:      string | null
  status:     'complete' | 'processing' | 'failed'
  language:   string | null
  duration:   number | null
  created_at: string
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
}

// ── Page ─────────────────────────────────────────────────────
export default function SessionDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [conv,    setConv]    = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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

  const lines   = conv.transcript?.lines ?? []
  const summary = conv.summary
  const cfg     = statusConfig[conv.status]

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
              <h1 className="font-display font-bold text-lg text-white truncate">
                {conv.title || 'Untitled session'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">{formatDate(conv.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={cfg.variant}>
              <span className="flex items-center gap-1.5">
                {cfg.icon}
                {conv.status}
              </span>
            </Badge>
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download size={13} />
              Export
            </Button>
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
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

              {/* Extracted medical fields */}
              {hasSummary && (
                <Card variant="elevated" className="p-5">
                  <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                    <Brain size={14} className="text-brand-400" />
                    Medical Extraction
                  </h2>

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
                            <p className="text-sm text-white truncate">{value}</p>
                          </div>
                        </div>
                      ))
                    }

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
                </Card>
              )}

              {/* No extraction available */}
              {!hasSummary && (
                <Card variant="flat" className="p-5 text-center">
                  <Brain size={24} className="mx-auto mb-3 text-slate-600" />
                  <p className="text-sm text-slate-500">No medical extraction data.</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Use Record & Extract to get AI-extracted fields.
                  </p>
                </Card>
              )}

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
