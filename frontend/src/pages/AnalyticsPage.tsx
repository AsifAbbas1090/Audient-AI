import { useEffect, useState } from 'react'
import {
  BarChart3, Clock, Mic2, CheckCircle2, Globe,
  Calendar, TrendingUp, RefreshCw, AlertCircle,
} from 'lucide-react'
import { Sidebar }  from '../components/ui/Sidebar'
import { Card }     from '../components/ui/Card'
import { Badge }    from '../components/ui/Badge'
import { Button }   from '../components/ui/Button'
import { StatCard } from '../components/visual/StatCard'
import { isAdmin }  from '../hooks/useAuth'
import api          from '../lib/api'

// ── Types ────────────────────────────────────────────────────
interface Conv {
  id:         string
  title:      string | null
  status:     'complete' | 'processing' | 'failed' | 'approved'
  language:   string | null
  duration:   number | null
  created_at: string
}

interface AdminStats {
  users: { total: number; healthcare: number; admin: number }
  conversations: { total: number; processing: number; done: number; failed: number }
}

// ── Helpers ──────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

/** Returns last N day labels e.g. ['Mon','Tue',...] ending today */
function lastNDayLabels(n: number): string[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return days[d.getDay()]
  })
}

/** Bucket conversations by day offset from today (0 = today, 1 = yesterday …) */
function bucketByDay(convs: Conv[], days: number): number[] {
  const buckets = Array(days).fill(0)
  const now     = Date.now()
  convs.forEach(c => {
    const msAgo  = now - new Date(c.created_at).getTime()
    const dayIdx = Math.floor(msAgo / 86_400_000)
    const bucket = days - 1 - dayIdx
    if (bucket >= 0 && bucket < days) buckets[bucket]++
  })
  return buckets
}

// ── Component ────────────────────────────────────────────────
export default function AnalyticsPage() {
  const admin = isAdmin()

  const [convs,       setConvs]       = useState<Conv[]>([])
  const [adminStats,  setAdminStats]  = useState<AdminStats | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [refreshKey,  setRefreshKey]  = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const requests: Promise<void>[] = [
      api.get<{ conversations: Conv[] }>('/api/conversations')
        .then(r => setConvs(r.data.conversations))
        .catch(() => setError('Could not load your sessions.')),
    ]

    if (admin) {
      requests.push(
        api.get<AdminStats>('/api/admin/stats')
          .then(r => setAdminStats(r.data))
          .catch(() => { /* non-fatal for admin stats */ })
      )
    }

    Promise.all(requests).finally(() => setLoading(false))
  }, [refreshKey])

  // ── Derived stats ────────────────────────────────────────
  const completed   = convs.filter(c => c.status === 'complete' || c.status === 'approved')
  const approved    = convs.filter(c => c.status === 'approved')
  const processing  = convs.filter(c => c.status === 'processing')
  const failed      = convs.filter(c => c.status === 'failed')
  const totalDur    = completed.reduce((s, c) => s + (c.duration ?? 0), 0)
  const avgDur      = completed.length ? Math.round(totalDur / completed.length) : 0
  const successRate = convs.length ? Math.round((completed.length / convs.length) * 100) : 0

  // Chart — last 7 days
  const DAYS       = 7
  const dayLabels  = lastNDayLabels(DAYS)
  const barData    = bucketByDay(convs, DAYS)
  const barMax     = Math.max(...barData, 1)

  // Language breakdown
  const langCounts = convs.reduce<Record<string, number>>((acc, c) => {
    const lang = c.language || 'Unknown'
    acc[lang] = (acc[lang] ?? 0) + 1
    return acc
  }, {})
  const langEntries = Object.entries(langCounts).sort(([, a], [, b]) => b - a)

  // This week vs last week
  const now       = Date.now()
  const thisWeek  = convs.filter(c => now - new Date(c.created_at).getTime() < 7 * 86_400_000).length
  const lastWeek  = convs.filter(c => {
    const ms = now - new Date(c.created_at).getTime()
    return ms >= 7 * 86_400_000 && ms < 14 * 86_400_000
  }).length
  const weekDelta = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Analytics</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {admin ? 'System-wide' : 'Your'} session activity and transcription metrics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="default">
              <Calendar size={11} className="mr-1" />
              All time
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRefreshKey(k => k + 1)}
              loading={loading}
            >
              <RefreshCw size={13} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">

          {/* ── Error ───────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {/* ── Stat cards ──────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-white/4 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Sessions"
                value={(admin && adminStats ? adminStats.conversations.total : convs.length).toString()}
                icon={Mic2}
                trend={weekDelta !== null ? {
                  value: `${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs last week`,
                  up: weekDelta >= 0,
                } : undefined}
              />
              <StatCard
                label="Completed"
                value={(admin && adminStats ? adminStats.conversations.done : completed.length).toString()}
                icon={CheckCircle2}
                trend={{ value: `${successRate}% success rate`, up: successRate >= 80 }}
              />
              <StatCard
                label="Avg Duration"
                value={avgDur ? formatDuration(avgDur) : '—'}
                icon={Clock}
              />
              <StatCard
                label="This Week"
                value={thisWeek.toString()}
                icon={TrendingUp}
                trend={weekDelta !== null ? {
                  value: lastWeek ? `${Math.abs(weekDelta)}% vs last week` : 'First week',
                  up: weekDelta >= 0,
                } : undefined}
              />
            </div>
          )}

          {/* ── Admin system stats banner ────────────────── */}
          {admin && adminStats && (
            <Card variant="flat" className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System-wide (Admin view)</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
                {[
                  { label: 'Total Users',    value: adminStats.users.total },
                  { label: 'Healthcare',     value: adminStats.users.healthcare },
                  { label: 'Admins',         value: adminStats.users.admin },
                  { label: 'All Sessions',   value: adminStats.conversations.total },
                  { label: 'Processing',     value: adminStats.conversations.processing },
                  { label: 'Failed',         value: adminStats.conversations.failed },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-lg font-bold text-white">{item.value}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Activity chart ───────────────────────────── */}
          <Card variant="elevated" className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <BarChart3 size={15} className="text-brand-400" />
                Sessions — Last 7 Days
              </h2>
              <span className="text-xs text-slate-500">{thisWeek} this week</span>
            </div>

            {loading ? (
              <div className="h-32 rounded-xl bg-white/4 animate-pulse" />
            ) : (
              <div className="flex items-end justify-between gap-2 h-32">
                {dayLabels.map((day, i) => {
                  const pct = (barData[i] / barMax) * 100
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-2 group">
                      <span className="text-xs font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {barData[i] || ''}
                      </span>
                      <div className="relative w-full rounded-t-lg overflow-hidden bg-white/4" style={{ height: '80px' }}>
                        <div
                          className="absolute bottom-0 w-full rounded-t-lg bg-brand-500/60 hover:bg-brand-500/80 transition-all"
                          style={{ height: `${pct || 2}%` }}
                          title={`${barData[i]} sessions`}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{day}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="grid md:grid-cols-2 gap-6">

            {/* ── Status breakdown ────────────────────────── */}
            <Card variant="elevated" className="p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-5">
                <CheckCircle2 size={15} className="text-brand-400" />
                Session Status
              </h2>

              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-white/4 animate-pulse" />)}
                </div>
              ) : convs.length === 0 ? (
                <p className="text-sm text-slate-500">No sessions yet.</p>
              ) : (
                [
                  { label: 'Completed',  count: completed.length,  color: 'bg-emerald-500', variant: 'success'  as const },
                  { label: 'Approved',   count: approved.length,   color: 'bg-sky-500',     variant: 'success'  as const },
                  { label: 'Processing', count: processing.length, color: 'bg-amber-500',   variant: 'warning'  as const },
                  { label: 'Failed',     count: failed.length,     color: 'bg-red-500',     variant: 'error'    as const },
                ].map(item => {
                  const pct = convs.length ? Math.round((item.count / convs.length) * 100) : 0
                  return (
                    <div key={item.label} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${item.color}`} />
                          <span className="text-sm text-slate-300">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{item.count}</span>
                          <Badge variant={item.variant}>{pct}%</Badge>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color} opacity-70 transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </Card>

            {/* ── Language breakdown ───────────────────────── */}
            <Card variant="elevated" className="p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-5">
                <Globe size={15} className="text-brand-400" />
                Languages Detected
              </h2>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-7 rounded bg-white/4 animate-pulse" />)}
                </div>
              ) : langEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No sessions yet.</p>
              ) : (
                <div className="space-y-3">
                  {langEntries.map(([lang, count]) => {
                    const pct = Math.round((count / convs.length) * 100)
                    return (
                      <div key={lang}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300 truncate">{lang}</span>
                          <span className="text-xs text-slate-500 shrink-0 ml-2">
                            {count} session{count > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500/60 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Recent sessions table ────────────────────── */}
          <Card variant="elevated">
            <div className="px-5 py-4 border-b border-white/8">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <Mic2 size={15} className="text-brand-400" />
                Recent Sessions
                <span className="ml-1 text-xs text-slate-500 font-normal">({convs.length})</span>
              </h2>
            </div>

            {loading ? (
              <div className="divide-y divide-white/6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 h-4 rounded bg-white/4 animate-pulse" />
                    <div className="w-16 h-4 rounded bg-white/4 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : convs.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Mic2 size={32} className="mx-auto mb-3 text-slate-600" />
                <p className="text-sm text-slate-500">No sessions recorded yet.</p>
                <p className="text-xs text-slate-600 mt-1">Go to Live Session or Record & Extract to start.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/6">
                {convs.slice(0, 8).map(c => (
                  <div key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {c.title || 'Untitled session'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c.language || 'Unknown language'}
                        {c.duration ? ` · ${formatDuration(c.duration)}` : ''}
                        {' · '}{new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        c.status === 'complete'   ? 'success' :
                        c.status === 'processing' ? 'warning' : 'error'
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>
      </main>
    </div>
  )
}
