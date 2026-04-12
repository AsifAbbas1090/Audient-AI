import { BarChart3, Clock, Mic2, Users, TrendingUp, CheckCircle2, Globe, Calendar } from 'lucide-react'
import { Sidebar }     from '../components/ui/Sidebar'
import { Card }        from '../components/ui/Card'
import { Badge }       from '../components/ui/Badge'
import { StatCard }    from '../components/visual/StatCard'
import { sessions }    from '../data/mock'

// ── Derived stats from mock data ──────────────────────────────
const completed   = sessions.filter(s => s.status === 'complete')
const totalWords  = 1840   // estimated
const avgDuration = Math.round(
  completed.reduce((sum, s) => sum + s.duration, 0) / (completed.length || 1)
)

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

// Session-per-day for last 7 days (mock)
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const barData = [3, 5, 2, 7, 4, 6, 2]
const barMax  = Math.max(...barData)

// Language breakdown from sessions
const langCounts = sessions.reduce<Record<string, number>>((acc, s) => {
  acc[s.language] = (acc[s.language] ?? 0) + 1
  return acc
}, {})

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ──────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Analytics</h1>
            <p className="text-xs text-slate-500 mt-0.5">Session activity and transcription metrics</p>
          </div>
          <Badge variant="default">
            <Calendar size={11} className="mr-1" />
            Last 30 days
          </Badge>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">

          {/* ── Stat cards row ───────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Sessions"
              value={sessions.length.toString()}
              icon={Mic2}
              trend={{ value: '+3 this week', up: true }}
            />
            <StatCard
              label="Completed"
              value={completed.length.toString()}
              icon={CheckCircle2}
              trend={{ value: `${Math.round((completed.length / sessions.length) * 100)}% success rate`, up: true }}
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(avgDuration)}
              icon={Clock}
            />
            <StatCard
              label="Words Transcribed"
              value={totalWords.toLocaleString()}
              icon={TrendingUp}
              trend={{ value: '+21% vs last week', up: true }}
            />
          </div>

          {/* ── Activity chart ───────────────────────────── */}
          <Card variant="elevated" className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <BarChart3 size={15} className="text-brand-400" />
                Sessions per Day (This Week)
              </h2>
              <span className="text-xs text-slate-500">29 sessions total</span>
            </div>

            <div className="flex items-end justify-between gap-2 h-32">
              {days.map((day, i) => {
                const pct = (barData[i] / barMax) * 100
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">{barData[i]}</span>
                    <div className="relative w-full rounded-t-lg overflow-hidden bg-white/4" style={{ height: '80px' }}>
                      <div
                        className="absolute bottom-0 w-full rounded-t-lg bg-brand-500/60 hover:bg-brand-500/80 transition-colors"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{day}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">

            {/* ── Status breakdown ────────────────────────── */}
            <Card variant="elevated" className="p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-5">
                <CheckCircle2 size={15} className="text-brand-400" />
                Session Status
              </h2>

              {[
                { label: 'Completed',  count: sessions.filter(s => s.status === 'complete').length,   color: 'bg-emerald-500', variant: 'success'  as const },
                { label: 'Processing', count: sessions.filter(s => s.status === 'processing').length, color: 'bg-amber-500',   variant: 'warning'  as const },
                { label: 'Failed',     count: sessions.filter(s => s.status === 'failed').length,     color: 'bg-red-500',     variant: 'error'    as const },
              ].map(item => {
                const pct = Math.round((item.count / sessions.length) * 100)
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
                        className={`h-full rounded-full ${item.color} opacity-70`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </Card>

            {/* ── Language breakdown ───────────────────────── */}
            <Card variant="elevated" className="p-5">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-5">
                <Globe size={15} className="text-brand-400" />
                Languages Used
              </h2>

              <div className="space-y-3">
                {Object.entries(langCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => {
                    const pct = Math.round((count / sessions.length) * 100)
                    return (
                      <div key={lang}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300 truncate">{lang}</span>
                          <span className="text-xs text-slate-500 shrink-0 ml-2">{count} session{count > 1 ? 's' : ''}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </Card>
          </div>

          {/* ── Recent sessions table ────────────────────── */}
          <Card variant="elevated">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <Users size={15} className="text-brand-400" />
                Recent Sessions
              </h2>
            </div>
            <div className="divide-y divide-white/6">
              {sessions.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.language} · {formatDuration(s.duration)}</p>
                  </div>
                  <Badge
                    variant={
                      s.status === 'complete' ? 'success' :
                      s.status === 'processing' ? 'warning' : 'error'
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
