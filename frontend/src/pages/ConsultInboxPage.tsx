import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Loader2, AlertCircle, Clock, CheckCircle2,
  XCircle, Inbox, Send, ChevronRight, User,
  FileText, ArrowUpRight, Shield, ChevronDown, ChevronUp, Pill,
} from 'lucide-react'
import { Sidebar }  from '../components/ui/Sidebar'
import { Badge }    from '../components/ui/Badge'
import { Card }     from '../components/ui/Card'
import { Button }   from '../components/ui/Button'
import { useToast } from '../components/ui/Toaster'
import api from '../lib/api'

// ── Types ──────────────────────────────────────────────────
interface ConsultRequest {
  id:               string
  session_id:       string
  requester_id:     string
  reviewer_id:      string
  mode:             'quick_opinion' | 'formal_consult' | 'urgent'
  status:           'pending' | 'accepted' | 'declined' | 'expired' | 'resolved'
  requester_note:   string | null
  respond_note?:    string | null
  created_at:       string
  responded_at:     string | null
  expires_at:       string
  requester_name?:  string
  reviewer_name?:   string
  session_title?:   string
  briefing_json?:   Record<string, any> | null
  expiring_soon?:   boolean
}

// ── Helpers ────────────────────────────────────────────────
const MODE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  quick_opinion:  { label: 'Quick Opinion',  color: 'text-sky-400 bg-sky-500/10 border-sky-500/25',       icon: <Clock size={10} /> },
  formal_consult: { label: 'Formal Consult', color: 'text-violet-400 bg-violet-500/10 border-violet-500/25', icon: <FileText size={10} /> },
  urgent:         { label: 'Urgent',         color: 'text-red-400 bg-red-500/10 border-red-500/25',       icon: <AlertCircle size={10} /> },
}

const STATUS_META: Record<string, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  pending:  { variant: 'warning', label: 'Pending'  },
  accepted: { variant: 'success', label: 'Accepted' },
  declined: { variant: 'error',   label: 'Declined' },
  expired:  { variant: 'default', label: 'Expired'  },
  resolved: { variant: 'success', label: 'Resolved' },
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function expiresIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return `${Math.floor(diff / 60000)}m left`
  if (hrs < 24) return `${hrs}h left`
  return `${Math.floor(hrs / 24)}d left`
}

// ── Row component ──────────────────────────────────────────
function ConsultRow({
  req,
  role,
  onRespond,
  onResolve,
  respondingId,
}: {
  req:          ConsultRequest
  role:         'received' | 'sent'
  onRespond:    (id: string, sessionId: string, action: 'accept' | 'decline') => void
  onResolve:    (id: string) => void
  respondingId: string | null
}) {
  const mode   = MODE_META[req.mode]   ?? MODE_META.quick_opinion
  const status = STATUS_META[req.status] ?? STATUS_META.pending
  const expired = new Date(req.expires_at) < new Date()
  const [briefOpen, setBriefOpen] = useState(false)
  const b = req.briefing_json

  return (
    <Card variant="elevated" className="p-4">
      <div className="flex items-start gap-3">
        {/* Mode icon */}
        <div className="h-9 w-9 rounded-xl bg-white/4 border border-white/8 light:bg-slate-100 light:border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
          <MessageSquare size={15} className="text-brand-400" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${mode.color}`}>
              {mode.icon}
              {mode.label}
            </span>
            <Badge variant={status.variant}>
              {status.label}
            </Badge>
            {req.status === 'pending' && !expired && (
              <span className={`text-[10px] ml-auto shrink-0 ${req.expiring_soon ? 'text-amber-300' : 'text-amber-400/90'}`}>
                <Clock size={9} className="inline mr-0.5" />
                {expiresIn(req.expires_at)}
                {req.expiring_soon && ' · expiring soon'}
              </span>
            )}
          </div>

          {req.status === 'pending' && req.expiring_soon && !expired && (
            <div className="text-[10px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 mb-2">
              This consult request expires within 6 hours — respond soon.
            </div>
          )}

          {/* Session + parties */}
          <div className="flex items-center gap-1.5 mb-1">
            <FileText size={11} className="text-slate-500 shrink-0" />
            <Link
              to={`/session/${req.session_id}`}
              className="text-xs font-medium text-brand-400 hover:text-brand-300 truncate transition-colors"
            >
              {req.session_title || `Session …${req.session_id.slice(-6)}`}
              <ArrowUpRight size={10} className="inline ml-0.5" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            <User size={10} className="text-slate-600 shrink-0" />
            {role === 'received'
              ? <span>From <span className="text-slate-300 font-medium">{req.requester_name ?? 'Unknown'}</span></span>
              : <span>To <span className="text-slate-300 font-medium">{req.reviewer_name ?? 'Unknown'}</span></span>
            }
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{formatRelative(req.created_at)}</span>
          </div>

          {/* Requester note */}
          {req.requester_note && (
            <p className="text-xs text-slate-400 bg-white/4 rounded-lg px-3 py-2 leading-relaxed mb-3 line-clamp-2">
              &ldquo;{req.requester_note}&rdquo;
            </p>
          )}

          {role === 'sent' && req.respond_note && (
            <p className="text-xs text-slate-500 bg-violet-500/8 rounded-lg px-3 py-2 leading-relaxed mb-3">
              <span className="text-slate-600">Reviewer: </span>
              {req.respond_note}
            </p>
          )}

          {/* Briefing snippet */}
          {b?.diagnosis && (
            <div className="flex items-start gap-1.5 text-xs text-slate-400 mb-2">
              <Shield size={10} className="text-slate-600 shrink-0 mt-0.5" />
              <span className="truncate">
                <span className="text-slate-500">Dx: </span>
                {b.diagnosis}
              </span>
            </div>
          )}

          {b && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setBriefOpen(o => !o)}
                className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
              >
                {briefOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {briefOpen ? 'Hide briefing' : 'Briefing card'}
              </button>
              {briefOpen && (
                <div className="mt-2 space-y-2 rounded-lg border border-white/8 bg-white/4 p-3 text-xs text-slate-400">
                  {(b.patient_code || b.patient_name) && (
                    <div>
                      <span className="text-slate-500">Patient: </span>
                      {[b.patient_code, b.patient_name].filter(Boolean).join(' — ')}
                    </div>
                  )}
                  {Array.isArray(b.medications) && b.medications.length > 0 && (
                    <div>
                      <span className="flex items-center gap-1 text-slate-500 mb-1"><Pill size={10} /> Medications</span>
                      <ul className="list-disc list-inside text-slate-300">
                        {b.medications.map((m: string, i: number) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(b.session_history) && b.session_history.length > 0 && (
                    <div>
                      <span className="text-slate-500 block mb-1">Session history</span>
                      <ul className="space-y-1 text-[10px] text-slate-400">
                        {b.session_history.map((h: { id?: string; title?: string; date?: string }) => (
                          <li key={h.id || h.date}>
                            {h.date ? `${new Date(h.date).toLocaleDateString()} — ` : ''}{h.title || 'Session'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(b.ai_flagged_concerns) && b.ai_flagged_concerns.length > 0 && (
                    <div className="text-amber-200/90">
                      <span className="text-slate-500 text-[10px] uppercase tracking-wide">AI-flagged</span>
                      <ul className="mt-1 space-y-0.5">
                        {b.ai_flagged_concerns.map((x: { field_name?: string; severity?: string }, i: number) => (
                          <li key={i}>{x.field_name}{x.severity ? ` (${x.severity})` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {role === 'received' && req.status === 'pending' && !expired && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onRespond(req.id, req.session_id, 'accept')}
                disabled={respondingId === req.id}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {respondingId === req.id
                  ? <Loader2 size={10} className="animate-spin" />
                  : <CheckCircle2 size={10} />}
                Accept
              </button>
              <button
                onClick={() => onRespond(req.id, req.session_id, 'decline')}
                disabled={respondingId === req.id}
                className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                <XCircle size={10} />
                Decline
              </button>
              <Link
                to={`/session/${req.session_id}`}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/5"
              >
                Open session
              </Link>
            </div>
          )}

          {role === 'sent' && req.status === 'accepted' && (
            <button
              onClick={() => onResolve(req.id)}
              disabled={respondingId === req.id}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-white/4 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/8 disabled:opacity-50 transition-colors"
            >
              {respondingId === req.id
                ? <Loader2 size={10} className="animate-spin" />
                : <CheckCircle2 size={10} />}
              Mark resolved
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────
export default function ConsultInboxPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [tab,          setTab]          = useState<'received' | 'sent'>('received')
  const [received,     setReceived]     = useState<ConsultRequest[]>([])
  const [sent,         setSent]         = useState<ConsultRequest[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [inboxRes, sentRes] = await Promise.all([
        api.get<{ consults: ConsultRequest[] }>('/api/consults/inbox'),
        api.get<{ consults: ConsultRequest[] }>('/api/consults/sent'),
      ])
      setReceived(inboxRes.data.consults)
      setSent(sentRes.data.consults)
    } catch {
      setError('Could not load consultations — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function handleRespond(id: string, sessionId: string, action: 'accept' | 'decline') {
    setRespondingId(id)
    try {
      await api.patch(`/api/consults/${id}/respond`, { action })
      toast(action === 'accept' ? 'Consultation accepted' : 'Consultation declined', action === 'accept' ? 'success' : 'error')
      await loadAll()
      if (action === 'accept') {
        navigate(`/session/${sessionId}`)
      }
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Could not respond', 'error')
    } finally {
      setRespondingId(null)
    }
  }

  async function handleResolve(id: string) {
    setRespondingId(id)
    try {
      await api.patch(`/api/consults/${id}/resolve`)
      toast('Marked as resolved', 'success')
      loadAll()
    } catch {
      toast('Could not mark as resolved', 'error')
    } finally {
      setRespondingId(null)
    }
  }

  const pendingCount = received.filter(r => r.status === 'pending').length
  const list = tab === 'received' ? received : sent

  return (
    <div className="app-page">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden light:bg-slate-100">
        {/* Header */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <MessageSquare size={16} className="text-brand-400" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-white light:text-slate-900 leading-none">Consultations</h1>
              <p className="text-xs text-slate-500 mt-0.5">Peer review requests</p>
            </div>
            {pendingCount > 0 && (
              <span className="h-5 min-w-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                {pendingCount}
              </span>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={loadAll} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : 'Refresh'}
          </Button>
        </header>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-white/8 px-6">
          {(['received', 'sent'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-brand-500 text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'received' ? <Inbox size={14} /> : <Send size={14} />}
              {t === 'received' ? 'Received' : 'Sent'}
              {t === 'received' && pendingCount > 0 && (
                <span className="h-4 min-w-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">

            {loading ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 size={24} className="text-brand-400 animate-spin" />
                <p className="text-sm text-slate-500">Loading consultations…</p>
              </div>
            ) : error ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <AlertCircle size={28} className="text-red-400" />
                <p className="text-sm text-slate-400">{error}</p>
              </div>
            ) : list.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <MessageSquare size={28} className="text-slate-600" />
                <p className="text-sm font-medium text-slate-400">
                  {tab === 'received' ? 'No consultation requests received.' : 'No consultation requests sent.'}
                </p>
                <p className="text-xs text-slate-600">
                  {tab === 'received'
                    ? 'When a colleague requests your opinion on a session, it will appear here.'
                    : 'Open a session and click "Consult" to request a peer review.'}
                </p>
                {tab === 'sent' && (
                  <Link to="/app">
                    <Button variant="secondary" size="sm" className="mt-2">
                      <ChevronRight size={13} /> Go to sessions
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {list.map(req => (
                  <ConsultRow
                    key={req.id}
                    req={req}
                    role={tab}
                    onRespond={handleRespond}
                    onResolve={handleResolve}
                    respondingId={respondingId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
