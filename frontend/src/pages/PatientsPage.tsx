import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, User, Tag, FileText, Clock,
  AlertCircle, Plus, ChevronRight,
} from 'lucide-react'
import { Sidebar }  from '../components/ui/Sidebar'
import { cn }       from '../utils/cn'
import api          from '../lib/api'

interface PatientRow {
  id:              string
  patient_code:    string | null
  name:            string
  age:             string | null
  gender:          string | null
  session_count:   number
  last_session_at: string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d < 1) return 'Today'
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [query,    setQuery]    = useState('')

  const load = useCallback((q: string) => {
    setLoading(true)
    setError(null)
    api.get<{ patients: PatientRow[] }>(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then(r => setPatients(r.data.patients))
      .catch(() => setError('Could not load patients — is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load('') }, [load])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(query), 300)
    return () => clearTimeout(t)
  }, [query, load])

  return (
    <div className={cn('app-page')}>
      <Sidebar />

      <main className="flex-1 overflow-y-auto light:bg-slate-100">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* ── Header ───────────────────────────────────── */}
          <div className="mb-8">
            <h1 className="font-display font-bold text-2xl text-white light:text-slate-900">Patients</h1>
            <p className="text-sm text-slate-400 light:text-slate-600 mt-1">
              {loading ? 'Loading…' : `${patients.length} patient thread${patients.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* ── Search ───────────────────────────────────── */}
          <div className="relative mb-6 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by patient name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={cn(
                'h-10 w-full rounded-xl pl-9 pr-4 text-sm app-input-native',
              )}
            />
          </div>

          {/* ── Error ────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 light:bg-red-50 light:border-red-200 light:text-red-700">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {/* ── List ─────────────────────────────────────── */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-white/4 light:bg-slate-200/60 animate-pulse" />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/4 border border-white/8 light:bg-slate-100 light:border-slate-200 flex items-center justify-center mb-4">
                {query ? <Search size={24} className="text-slate-500" /> : <User size={24} className="text-slate-500" />}
              </div>
              <h3 className="font-semibold text-white light:text-slate-900 mb-1">
                {query ? 'No patients found' : 'No patient threads yet'}
              </h3>
              <p className="text-sm text-slate-500 light:text-slate-600 max-w-xs">
                {query ? `No results for "${query}".` : 'Threads you create will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {patients.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                >
                  <Link to={`/patients/${p.id}`} className="group block">
                    <div className={cn(
                      'flex items-center gap-4 rounded-2xl border px-5 py-4',
                      'bg-white/3 border-white/8',
                      'hover:bg-white/6 hover:border-brand-500/25 hover:shadow-glow',
                      'light:bg-white light:border-slate-200 light:shadow-soft',
                      'light:hover:bg-slate-50 light:hover:border-brand-400/35',
                      'transition-all duration-200',
                    )}>
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-brand-400">{p.name.charAt(0).toUpperCase()}</span>
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white light:text-slate-900 group-hover:text-brand-300 light:group-hover:text-brand-700 transition-colors truncate">
                            {p.name}
                          </span>
                          {p.patient_code && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-2 py-0.5 shrink-0">
                              <Tag size={8} />
                              {p.patient_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 light:text-slate-600">
                          {p.age && <span>{p.age}</span>}
                          {p.gender && <span>{p.gender}</span>}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-5 shrink-0 text-xs text-slate-400 light:text-slate-600">
                        <div className="flex items-center gap-1.5 text-right">
                          <FileText size={11} className="text-slate-600" />
                          <span>{p.session_count} session{p.session_count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-right hidden sm:flex">
                          <Clock size={11} className="text-slate-600" />
                          <span>{timeAgo(p.last_session_at)}</span>
                        </div>
                      </div>

                      <ChevronRight size={14} className="text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
