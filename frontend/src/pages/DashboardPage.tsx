import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, Plus, Clock, Users, Mic,
  FileText, TrendingUp, ChevronRight,
  AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react'
import { Sidebar } from '../components/ui/Sidebar'
import { Badge } from '../components/ui/Badge'
import { StatCard } from '../components/visual/StatCard'
import { SkeletonCard } from '../components/ui/Skeleton'
import { sessions, type Session } from '../data/mock'
import { cn } from '../utils/cn'

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  })
}

type StatusFilter = 'all' | 'complete' | 'processing' | 'failed'

const statusBadge: Record<Session['status'], React.ReactElement> = {
  complete:   <Badge variant="success"    dot>Complete</Badge>,
  processing: <Badge variant="processing" dot>Processing</Badge>,
  failed:     <Badge variant="error"      dot>Failed</Badge>,
}

// ── Stats derived from mock data ──────────────────────────────
const totalSessions   = sessions.length
const completedCount  = sessions.filter(s => s.status === 'complete').length
const avgDuration     = Math.round(
  sessions.filter(s => s.duration > 0).reduce((a, s) => a + s.duration, 0) /
  sessions.filter(s => s.duration > 0).length
)
const extractionCount = sessions.filter(s => s.disease).length

// ── Session Card ─────────────────────────────────────────────
function SessionCard({ session, index }: { session: Session; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <Link to={`/session/${session.id}`} className="block group">
        <div className={cn(
          'rounded-2xl border p-5 h-full',
          'bg-white/3 border-white/8',
          'hover:bg-white/6 hover:border-brand-500/25 hover:shadow-glow',
          'transition-all duration-200',
        )}>
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white text-sm truncate group-hover:text-brand-300 transition-colors">
                {session.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatDate(session.date)} · {formatTime(session.date)}
              </p>
            </div>
            <div className="shrink-0">{statusBadge[session.status]}</div>
          </div>

          {/* Summary */}
          <p className="text-sm text-slate-400 mt-3 leading-relaxed line-clamp-2">
            {session.status === 'failed'
              ? 'Transcription failed. Please re-record the session.'
              : session.summary}
          </p>

          {/* Footer row */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              {/* Duration */}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock size={11} />
                {formatDuration(session.duration)}
              </div>
              {/* Speakers */}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Users size={11} />
                {session.speakerCount} speakers
              </div>
              {/* Language */}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Mic size={11} />
                {session.language}
              </div>
            </div>

            <ChevronRight
              size={14}
              className="text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all"
            />
          </div>

          {/* Tags */}
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/6">
              {session.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="col-span-2 flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="h-16 w-16 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mb-4">
        {query ? <Search size={24} className="text-slate-500" /> : <FileText size={24} className="text-slate-500" />}
      </div>
      <h3 className="font-semibold text-white mb-1">
        {query ? 'No sessions found' : 'No sessions yet'}
      </h3>
      <p className="text-sm text-slate-500 max-w-xs">
        {query
          ? `No results for "${query}". Try a different keyword.`
          : 'Start your first live session or record and extract a consultation.'}
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

// ── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const [query,        setQuery]        = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      const matchStatus = statusFilter === 'all' || s.status === statusFilter
      const q = query.toLowerCase()
      const matchQuery = !q
        || s.title.toLowerCase().includes(q)
        || s.summary.toLowerCase().includes(q)
        || s.tags.some(t => t.toLowerCase().includes(q))
        || (s.disease ?? '').toLowerCase().includes(q)
      return matchStatus && matchQuery
    })
  }, [query, statusFilter])

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Page header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="font-display font-bold text-2xl text-white">Sessions</h1>
              <p className="text-sm text-slate-400 mt-1">
                {completedCount} of {totalSessions} sessions completed
              </p>
            </div>
            <Link
              to="/live"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow transition-colors"
            >
              <Plus size={15} />
              New Session
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Total Sessions"
              value={totalSessions}
              icon={FileText}
              trend={{ value: '+2 this week', up: true }}
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(avgDuration)}
              icon={Clock}
              iconColor="text-violet-400"
            />
            <StatCard
              label="Extractions Done"
              value={extractionCount}
              icon={TrendingUp}
              iconColor="text-emerald-400"
              trend={{ value: `${Math.round(extractionCount / totalSessions * 100)}% success`, up: true }}
            />
            <StatCard
              label="Speakers Captured"
              value={`${sessions.reduce((a, s) => a + s.speakerCount, 0)}`}
              icon={Users}
              iconColor="text-amber-400"
            />
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sessions, diseases, tags…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className={cn(
                  'h-10 w-full rounded-xl pl-9 pr-4 text-sm',
                  'bg-white/5 border border-white/10',
                  'text-slate-100 placeholder:text-slate-500',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
                  'transition-all duration-200',
                )}
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 bg-white/4 border border-white/8 rounded-xl p-1">
              {(['all', 'complete', 'processing', 'failed'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    'h-8 px-3 rounded-lg text-xs font-medium capitalize transition-all duration-150',
                    statusFilter === f
                      ? 'bg-brand-600 text-white shadow-glow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          {(query || statusFilter !== 'all') && filtered.length > 0 && (
            <p className="text-xs text-slate-500 mb-4">
              {filtered.length} session{filtered.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Session grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.length === 0
              ? <EmptyState query={query} />
              : filtered.map((s, i) => (
                  <SessionCard key={s.id} session={s} index={i} />
                ))
            }
          </div>
        </div>
      </main>
    </div>
  )
}
