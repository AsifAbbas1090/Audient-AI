import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, Clock, Users, Globe, Tag,
  CheckCircle2, AlertCircle, Loader2, FileText,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Button }        from '../components/ui/Button'
import { Badge }         from '../components/ui/Badge'
import { Card }          from '../components/ui/Card'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { sessions, transcript, mockSummary } from '../data/mock'

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const statusVariant = {
  complete:   'success',
  processing: 'warning',
  failed:     'danger',
} as const

const statusIcon = {
  complete:   <CheckCircle2 size={13} />,
  processing: <Loader2 size={13} className="animate-spin" />,
  failed:     <AlertCircle size={13} />,
}

export default function SessionDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const session  = sessions.find(s => s.id === id) ?? sessions[0]

  const handleExport = () => {
    const text = [
      `Session: ${session.title}`,
      `Date: ${formatDate(session.date)}`,
      '',
      '--- TRANSCRIPT ---',
      ...transcript.map(l => `[${l.time}] ${l.speaker}: ${l.text}`),
      '',
      '--- SUMMARY ---',
      mockSummary.essence,
      '',
      'Action Items:',
      ...mockSummary.actionItems.map(a => `• ${a}`),
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `session-${session.id}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

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
              <h1 className="font-display font-bold text-lg text-white truncate">{session.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{formatDate(session.date)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={statusVariant[session.status]}>
              <span className="flex items-center gap-1.5">
                {statusIcon[session.status]}
                {session.status}
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
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { icon: Clock,  text: formatDuration(session.duration) },
                  { icon: Users,  text: `${session.speakerCount} Speakers` },
                  { icon: Globe,  text: session.language },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/4 border border-white/8 rounded-full px-3 py-1.5">
                    <Icon size={12} className="text-slate-500" />
                    {text}
                  </div>
                ))}
                {session.tags.map(tag => (
                  <div key={tag} className="flex items-center gap-1.5 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 py-1.5">
                    <Tag size={11} />
                    {tag}
                  </div>
                ))}
              </div>

              {/* Transcript card */}
              <Card variant="elevated" className="flex-1">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                  <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                    <FileText size={14} className="text-brand-400" />
                    Transcript
                  </h2>
                  <span className="text-xs text-slate-500">{transcript.length} segments</span>
                </div>

                <div className="px-5 py-4 space-y-3">
                  {transcript.map(line => (
                    <SpeakerBubble
                      key={line.id}
                      speaker={line.speaker}
                      text={line.text}
                      timestamp={line.time}
                    />
                  ))}
                </div>
              </Card>
            </div>

            {/* ── Right: summary ──────────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* Essence */}
              <Card variant="elevated" className="p-5">
                <h2 className="font-semibold text-white text-sm mb-3">Summary</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{mockSummary.essence}</p>
              </Card>

              {/* Disease tag */}
              {session.disease && (
                <Card variant="flat" className="p-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Condition</p>
                  <p className="text-base font-semibold text-brand-300">{session.disease}</p>
                </Card>
              )}

              {/* Action items */}
              <Card variant="elevated" className="p-5">
                <h3 className="font-semibold text-white text-sm mb-3">Action Items</h3>
                <ul className="space-y-2">
                  {mockSummary.actionItems.map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Decisions */}
              <Card variant="elevated" className="p-5">
                <h3 className="font-semibold text-white text-sm mb-3">Decisions</h3>
                <ul className="space-y-2">
                  {mockSummary.decisions.map(d => (
                    <li key={d} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0 mt-2" />
                      {d}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Entities */}
              <Card variant="flat" className="p-4">
                <h3 className="font-semibold text-slate-400 text-xs uppercase tracking-wide mb-3">Key Entities</h3>
                <div className="flex flex-wrap gap-2">
                  {mockSummary.entities.map(e => (
                    <span
                      key={e}
                      className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300"
                    >
                      {e}
                    </span>
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
