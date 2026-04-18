import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Clock, Mic,
  FileText, TrendingUp, ChevronRight,
  CheckCircle2, Loader2, AlertCircle,
  RefreshCw, ShieldCheck, Sparkles, Tag,
} from 'lucide-react'
import { Sidebar }    from '../components/ui/Sidebar'
import { Badge }      from '../components/ui/Badge'
import { StatCard }   from '../components/visual/StatCard'
import { SkeletonCard } from '../components/ui/Skeleton'
import { usePreferencesUser } from '../hooks/usePreferencesUser'
import { getSpecialtyUi } from '../lib/specialtyUi'
import { cn }         from '../utils/cn'
import api            from '../lib/api'

// ── Types ────────────────────────────────────────────────────
interface Conv {
  id:           string
  title:        string | null
  status:       'complete' | 'processing' | 'failed' | 'approved'
  language:     string | null
  duration:     number | null
  created_at:   string
  patient_id?:  string | null
  patient_code?: string | null
  patient_name?: string | null
}

type StatusFilter = 'all' | 'complete' | 'processing' | 'failed' | 'approved'

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const statusConfig = {
  complete:   { badge: <Badge variant="success"    dot>Complete</Badge>,   icon: <CheckCircle2 size={12} className="text-emerald-400" /> },
  processing: { badge: <Badge variant="processing" dot>Processing</Badge>, icon: <Loader2     size={12} className="text-amber-400 animate-spin" /> },
  failed:     { badge: <Badge variant="error"      dot>Failed</Badge>,     icon: <AlertCircle size={12} className="text-red-400" /> },
  approved:   { badge: <Badge variant="success"    dot>Approved</Badge>,   icon: <ShieldCheck size={12} className="text-emerald-400" /> },
}

// ── Session Card ─────────────────────────────────────────────
function SessionCard({ conv, index }: { conv: Conv; index: number }) {
  const cfg = statusConfig[conv.status]
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
    >
      <Link to={`/session/${conv.id}`} className="block group">
        <div className={cn(
          'rounded-2xl border p-5 h-full',
          'bg-white/3 border-white/8',
          'hover:bg-white/6 hover:border-brand-500/25 hover:shadow-glow',
          'light:bg-white light:border-slate-200 light:shadow-soft',
          'light:hover:bg-slate-50 light:hover:border-brand-400/35',
          'transition-all duration-200',
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white light:text-slate-900 text-sm truncate group-hover:text-brand-300 light:group-hover:text-brand-700 transition-colors">
                {conv.title || 'Untitled session'}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-slate-500">{timeAgo(conv.created_at)}</p>
                {conv.patient_code && (
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/patients/${conv.patient_id}`) }}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-2 py-0.5 hover:bg-brand-500/20 transition-colors"
                    title={conv.patient_name ?? undefined}
                  >
                    <Tag size={9} />
                    {conv.patient_code}
                  </button>
                )}
              </div>
            </div>
            <div className="shrink-0">{cfg.badge}</div>
          </div>

          <p className="text-sm text-slate-400 light:text-slate-600 mt-3 leading-relaxed line-clamp-2 min-h-[40px]">
            {conv.status === 'failed'
              ? 'Transcription failed. Please re-record the session.'
              : conv.language
              ? `Recorded in ${conv.language}${conv.duration ? ` · ${formatDuration(conv.duration)}` : ''}`
              : 'Session details available in the transcript view.'}
          </p>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3 text-xs text-slate-500 light:text-slate-600">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatDuration(conv.duration)}
              </span>
              {conv.language && (
                <span className="flex items-center gap-1">
                  <Mic size={11} />
                  {conv.language}
                </span>
              )}
            </div>
            <ChevronRight
              size={14}
              className="text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all"
            />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ query, specialtyHint }: { query: string; specialtyHint: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="col-span-2 flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="h-16 w-16 rounded-2xl bg-white/4 border border-white/8 light:bg-slate-100 light:border-slate-200 flex items-center justify-center mb-4">
        {query
          ? <Search size={24} className="text-slate-500" />
          : <FileText size={24} className="text-slate-500" />}
      </div>
      <h3 className="font-semibold text-white light:text-slate-900 mb-1">
        {query ? 'No sessions found' : 'No sessions yet'}
      </h3>
      <p className="text-sm text-slate-500 light:text-slate-600 max-w-xs">
        {query
          ? `No results for "${query}". Try a different keyword.`
          : specialtyHint}
      </p>
      {!query && (
        <Link
          to="/live"
          className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow transition-colors"
        >
          <Mic size={14} /> Start Recording
        </Link>
      )}
    </motion.div>
  )
}

// ── Specialty AI Focus Panel ──────────────────────────────────
function SpecialtyFocusPanel({ specUi }: { specUi: ReturnType<typeof getSpecialtyUi> }) {
  const { accent, label, focusAreas } = specUi
  return (
    <motion.div
      key={label}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-2xl border p-5 mb-8',
        accent.bg, accent.border,
        'light:bg-white/90 light:border-slate-200',
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className={accent.text} />
        <span className={cn('text-xs font-semibold uppercase tracking-wider', accent.text)}>
          AI extraction focus — {label}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {focusAreas.map(area => (
          <div key={area} className="flex items-start gap-2">
            <CheckCircle2 size={12} className={cn('mt-0.5 shrink-0', accent.text)} />
            <span className="text-xs text-slate-300 light:text-slate-700 leading-relaxed">{area}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = usePreferencesUser()
  const specUi = getSpecialtyUi(user?.specialty)

  const [convs,        setConvs]        = useState<Conv[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [query,        setQuery]        = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [refreshKey,   setRefreshKey]   = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.get<{ conversations: Conv[] }>('/api/conversations')
      .then(r => setConvs(r.data.conversations))
      .catch(() => setError('Could not load sessions — is the backend running?'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const completed  = convs.filter(c => c.status === 'complete')
  const avgDur     = completed.length
    ? Math.round(completed.reduce((s, c) => s + (c.duration ?? 0), 0) / completed.length)
    : 0
  const thisWeek   = convs.filter(c =>
    Date.now() - new Date(c.created_at).getTime() < 7 * 86_400_000
  ).length

  const filtered = useMemo(() => {
    return convs.filter(c => {
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      const q = query.toLowerCase()
      const matchQuery  = !q
        || (c.title    ?? '').toLowerCase().includes(q)
        || (c.language ?? '').toLowerCase().includes(q)
      return matchStatus && matchQuery
    })
  }, [convs, query, statusFilter])

  // Specialty-specific stat label
  const sessionLabel = {
    cardiology:       'Cardiac Consultations',
    psychiatry:       'Psychiatric Sessions',
    paediatrics:      'Paediatric Visits',
    general_practice: 'GP Consultations',
    general_mbbs:     'Total Sessions',
  }[specUi.code] ?? 'Total Sessions'

  return (
    <div className="app-page">
      <Sidebar />

      <main className="flex-1 overflow-y-auto light:bg-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* ── Page header ──────────────────────────────── */}
          <div className="flex items-start justify-between mb-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h1 className="font-display font-bold text-2xl text-white light:text-slate-900">
                  {user ? `Welcome, ${user.name.split(' ')[0]}` : 'Sessions'}
                </h1>
                {user && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border',
                    specUi.accent.bg, specUi.accent.text, specUi.accent.border,
                  )}>
                    {specUi.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 light:text-slate-600 mt-1">
                {loading
                  ? 'Loading your sessions…'
                  : `${completed.length} of ${convs.length} sessions completed`}
              </p>
              {user && (
                <p className="text-xs text-slate-500 light:text-slate-600 mt-2 max-w-xl leading-relaxed">
                  {specUi.tagline}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 light:hover:bg-slate-200/80 light:text-slate-600 light:hover:text-slate-900 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <Link
                to="/live"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow transition-colors"
              >
                <Plus size={15} />
                New Session
              </Link>
            </div>
          </div>

          {/* ── Stats row ────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard
              label={sessionLabel}
              value={convs.length}
              icon={FileText}
              trend={thisWeek > 0 ? { value: `+${thisWeek} this week`, up: true } : undefined}
            />
            <StatCard
              label="Completed"
              value={completed.length}
              icon={CheckCircle2}
              iconColor="text-emerald-400"
              trend={convs.length ? {
                value: `${Math.round((completed.length / convs.length) * 100)}% success rate`,
                up: true,
              } : undefined}
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(avgDur)}
              icon={Clock}
              iconColor="text-violet-400"
            />
            <StatCard
              label="This Week"
              value={thisWeek}
              icon={TrendingUp}
              iconColor="text-amber-400"
            />
          </div>

          {/* ── Specialty AI focus panel ──────────────────── */}
          {user && <SpecialtyFocusPanel specUi={specUi} />}

          {/* ── Error ────────────────────────────────────── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0  }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 light:bg-red-50 light:border-red-200 light:text-red-700"
              >
                <AlertCircle size={15} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Search + filter ───────────────────────────── */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by title or language…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className={cn(
                  'h-10 w-full rounded-xl pl-9 pr-4 text-sm app-input-native',
                  'transition-all duration-200',
                )}
              />
            </div>

            <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-xl p-1 light:bg-slate-100 light:border-slate-200">
              {(['all', 'complete', 'approved', 'processing', 'failed'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    'h-8 px-3 rounded-lg text-xs font-medium capitalize transition-all duration-150',
                    statusFilter === f
                      ? 'bg-brand-600 text-white shadow-glow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 light:text-slate-600 light:hover:text-slate-900 light:hover:bg-slate-200/80',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* ── Results label ────────────────────────────── */}
          {(query || statusFilter !== 'all') && !loading && filtered.length > 0 && (
            <p className="text-xs text-slate-500 light:text-slate-600 mb-4">
              {filtered.length} session{filtered.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* ── Session grid ──────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : filtered.length === 0
              ? <EmptyState query={query} specialtyHint={specUi.emptyHint} />
              : filtered.map((c, i) => (
                  <SessionCard key={c.id} conv={c} index={i} />
                ))
            }
          </div>

        </div>
      </main>
    </div>
  )
}
