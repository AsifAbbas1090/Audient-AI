import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Clock, Globe, CheckCircle2,
  AlertCircle, Loader2, FileText, Brain, User,
  Calendar, HeartPulse, BookOpen, Smile, StickyNote,
  Pencil, X, Check, Plus, Lock, ShieldCheck, Bell,
  Sparkles, FlaskConical, Stethoscope, TriangleAlert, RefreshCw,
  UserSearch, UserPlus, Phone, Link2, Unlink, LayoutTemplate,
  MessageSquare, Shield, Send, ChevronDown, Trash2,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Button }        from '../components/ui/Button'
import { Badge }         from '../components/ui/Badge'
import { Card }          from '../components/ui/Card'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { useToast }      from '../components/ui/Toaster'
import ConsultModal      from '../components/ConsultModal'
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
  patient_facing_summary?: string | null
}

interface Summary extends SummaryFields {
  field_reminders:      FieldReminder[]
  follow_up_questions?: string[]
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
  patient_code:    string | null
  name:            string
  age:             string | null
  gender:          string | null
  contact:         string | null
  medical_history: string | null
  session_count?:  number
}

interface TemplateVersionInfo {
  id:              string
  template_id:     string
  template_name:   string | null
  purpose?:        string
  version_number:  number
  created_at:      string | null
  id_short?:       string | null
}

interface AccessGrant {
  id:            string
  grantee_id?:   string
  grantee_name?: string
  grantee_email?: string
  grantee?:      { id: string; name: string; email?: string; specialty?: string; doctor_title?: string } | null
  permission:    'read' | 'comment' | 'write'
  expires_at:    string | null
  revoked_at:    string | null
  is_active:     boolean
  created_at:    string
}

interface Comment {
  id:           string
  author_id:    string
  author_name?: string
  body:         string
  created_at:   string
}

interface ColleagueUser {
  id:            string
  name:          string
  email:         string
  specialty?:    string
  doctor_title?: string
}

interface Conversation {
  id:          string
  title:       string | null
  status:      'complete' | 'processing' | 'failed' | 'approved'
  language:    string | null
  duration:    number | null
  created_at:  string
  approved_at: string | null
  patient_id:   string | null
  patient_code?: string | null
  patient_name?: string | null
  parent_id?:   string | null
  my_permission?: string | null
  template_version_id?: string | null
  patient_template_version_id?: string | null
  template_version?: TemplateVersionInfo | null
  patient_template_version?: TemplateVersionInfo | null
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function templateVersionShort(tv: TemplateVersionInfo | null | undefined): string {
  if (!tv?.id) return '—'
  return (tv.id_short ?? tv.id.slice(0, 8)) || '—'
}

const statusConfig = {
  complete:   { variant: 'success'  as const, icon: <CheckCircle2 size={13} /> },
  processing: { variant: 'warning'  as const, icon: <Loader2 size={13} className="animate-spin" /> },
  failed:     { variant: 'error'    as const, icon: <AlertCircle size={13} /> },
  approved:   { variant: 'success'  as const, icon: <ShieldCheck size={13} /> },
}

const PERMISSION_LABELS: Record<string, { label: string; color: string }> = {
  read:    { label: 'Read',    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  comment: { label: 'Comment', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  write:   { label: 'Write',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
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

  // Phase 2/3 — consult modal
  const [showConsultModal, setShowConsultModal] = useState(false)

  // Phase 2 — access grants (owner only)
  const [grants,            setGrants]            = useState<AccessGrant[]>([])
  const [loadingGrants,     setLoadingGrants]     = useState(false)
  const [revokingGrant,     setRevokingGrant]     = useState<string | null>(null)
  const [colleagueSearch,   setColleagueSearch]   = useState('')
  const [colleagueResults,  setColleagueResults]  = useState<ColleagueUser[]>([])
  const [searchingColleague,setSearchingColleague] = useState(false)
  const [showColleagueDD,   setShowColleagueDD]   = useState(false)
  const [selectedColleague, setSelectedColleague] = useState<ColleagueUser | null>(null)
  const [grantPermission,   setGrantPermission]   = useState<'read' | 'comment' | 'write'>('read')
  const [grantExpiry,       setGrantExpiry]       = useState('')
  const [grantingAccess,    setGrantingAccess]    = useState(false)
  const colleagueSearchRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phase 2 — comments
  const [comments,       setComments]       = useState<Comment[]>([])
  const [loadingComments,setLoadingComments] = useState(false)
  const [commentDraft,   setCommentDraft]   = useState('')
  const [postingComment, setPostingComment] = useState(false)

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

  // Load grants + comments once conv is available
  const loadGrants = useCallback(async () => {
    if (!id) return
    setLoadingGrants(true)
    try {
      const res = await api.get<{ access: AccessGrant[] }>(`/api/sessions/${id}/access`)
      setGrants(res.data.access ?? [])
    } catch { /* silent */ }
    finally { setLoadingGrants(false) }
  }, [id])

  const loadComments = useCallback(async () => {
    if (!id) return
    setLoadingComments(true)
    try {
      const res = await api.get<{ comments: Comment[] }>(`/api/sessions/${id}/comments`)
      setComments(res.data.comments)
    } catch { /* silent */ }
    finally { setLoadingComments(false) }
  }, [id])

  useEffect(() => {
    if (!conv) return
    const isOwner = !conv.my_permission
    if (isOwner) loadGrants()
    loadComments()
  }, [conv, loadGrants, loadComments])

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

  // ── Access grant management ──────────────────────────────
  function handleColleagueSearch(val: string) {
    setColleagueSearch(val)
    setShowColleagueDD(true)
    setSelectedColleague(null)
    if (colleagueSearchRef.current) clearTimeout(colleagueSearchRef.current)
    if (!val.trim()) { setColleagueResults([]); return }
    colleagueSearchRef.current = setTimeout(async () => {
      setSearchingColleague(true)
      try {
        const res = await api.get<{ users: ColleagueUser[] }>(`/api/users/search?q=${encodeURIComponent(val)}&limit=10`)
        setColleagueResults(res.data.users)
      } catch { /* silent */ }
      finally { setSearchingColleague(false) }
    }, 300)
  }

  function selectColleague(u: ColleagueUser) {
    setSelectedColleague(u)
    setColleagueSearch(u.name)
    setShowColleagueDD(false)
    setColleagueResults([])
  }

  async function grantAccess() {
    if (!conv || !selectedColleague) return
    setGrantingAccess(true)
    try {
      await api.post(`/api/sessions/${conv.id}/access`, {
        grantee_id:  selectedColleague.id,
        permission:  grantPermission,
        expires_at:  grantExpiry || null,
      })
      toast(`Access granted to ${selectedColleague.name}`, 'success')
      setSelectedColleague(null)
      setColleagueSearch('')
      setGrantExpiry('')
      setGrantPermission('read')
      loadGrants()
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Could not grant access', 'error')
    } finally {
      setGrantingAccess(false)
    }
  }

  async function revokeGrant(grantId: string) {
    if (!conv) return
    setRevokingGrant(grantId)
    try {
      await api.delete(`/api/sessions/${conv.id}/access/${grantId}`)
      toast('Access revoked', 'success')
      loadGrants()
    } catch {
      toast('Could not revoke access', 'error')
    } finally {
      setRevokingGrant(null)
    }
  }

  // ── Comments ─────────────────────────────────────────────
  async function postComment() {
    if (!conv || !commentDraft.trim()) return
    setPostingComment(true)
    try {
      const res = await api.post<{ comment: Comment }>(`/api/sessions/${conv.id}/comments`, {
        body: commentDraft.trim(),
      })
      setComments(prev => [...prev, res.data.comment])
      setCommentDraft('')
      toast('Message sent', 'success')
    } catch {
      toast('Could not send message', 'error')
    } finally {
      setPostingComment(false)
    }
  }

  // ── PDF export (clinical vs patient-facing layout) ─────────
  const [pdfAudience, setPdfAudience] = useState<null | 'clinical' | 'patient'>(null)

  const handleExportPdf = async (audience: 'clinical' | 'patient') => {
    if (!conv || pdfAudience) return
    setPdfAudience(audience)
    try {
      const res = await api.get(`/api/conversations/${conv.id}/export/pdf`, {
        responseType: 'blob',
        params: { audience },
      })
      const url  = URL.createObjectURL(res.data as Blob)
      const a    = document.createElement('a')
      a.href     = url
      const prefix = audience === 'patient' ? 'patient_visit' : 'clinical_note'
      a.download = `${prefix}_${id?.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast(audience === 'patient' ? 'Patient PDF exported' : 'Clinical PDF exported', 'success')
    } catch {
      toast('Could not generate PDF', 'error')
    } finally {
      setPdfAudience(null)
    }
  }

  // ── Continue session ─────────────────────────────────────
  const [continuingSession, setContinuingSession] = useState(false)

  const handleContinueSession = async () => {
    if (!conv || continuingSession) return
    setContinuingSession(true)
    try {
      const res = await api.post<{ session_id: string }>(`/api/conversations/${conv.id}/continue`)
      navigate(`/live?continue=${res.data.session_id}&parent=${conv.id}`)
    } catch {
      toast('Could not start continuation session', 'error')
    } finally {
      setContinuingSession(false)
    }
  }

  // ── Loading — shell only; global overlay handles spinner (axios GET /conversations/:id)
  if (loading) {
    return (
      <div className="min-h-screen flex bg-surface-400">
        <Sidebar />
        <main className="flex-1 bg-surface-400" aria-busy />
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
  const isOwner    = !conv.my_permission
  // Non-owners always see chat (they have explicit access = a consult is happening).
  // Owners only see it once they've shared the session with at least one colleague.
  const canUseSessionChat = !isOwner || grants.length > 0

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
              {editingTitle && !isApproved && isOwner ? (
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
                    : isOwner && (
                      <button
                        onClick={startEditTitle}
                        className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/8 opacity-0 group-hover:opacity-100 transition-all"
                        title="Edit title"
                      >
                        <Pencil size={13} />
                      </button>
                    )
                  }
                  {!isOwner && conv.my_permission && (
                    <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${PERMISSION_LABELS[conv.my_permission]?.color ?? ''}`}>
                      {PERMISSION_LABELS[conv.my_permission]?.label ?? conv.my_permission} access
                    </span>
                  )}
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

            {/* Consult button — owner only, session must be complete/approved */}
            {isOwner && (conv.status === 'complete' || conv.status === 'approved') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConsultModal(true)}
              >
                <MessageSquare size={13} />
                Consult
              </Button>
            )}

            {/* Approve button — only shown on complete sessions by owner */}
            {isOwner && conv.status === 'complete' && (
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

            {isOwner && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleExportPdf('clinical')}
                  disabled={pdfAudience !== null}
                  title="Clinician-oriented PDF (clinical template snapshot)"
                >
                  {pdfAudience === 'clinical'
                    ? <Loader2 size={13} className="animate-spin" />
                    : <FileText size={13} />}
                  PDF (clinical)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleExportPdf('patient')}
                  disabled={pdfAudience !== null}
                  title="Plain-language patient PDF (patient-facing template snapshot)"
                >
                  {pdfAudience === 'patient'
                    ? <Loader2 size={13} className="animate-spin" />
                    : <User size={13} />}
                  PDF (patient)
                </Button>
              </>
            )}

            {(conv.status === 'complete' || conv.status === 'approved') && isOwner ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleContinueSession}
                disabled={continuingSession}
              >
                {continuingSession
                  ? <Loader2 size={13} className="animate-spin" />
                  : <RefreshCw size={13} />}
                Continue Session
              </Button>
            ) : null}
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

          {/* Shared access banner */}
          {!isOwner && conv.my_permission && (
            <div className="max-w-6xl mx-auto mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300">
              <Shield size={16} className="text-violet-400 shrink-0" />
              <span>
                You have <strong>{PERMISSION_LABELS[conv.my_permission]?.label ?? conv.my_permission}</strong> access to this session — shared by the session owner.
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

              {/* ── Colleague discussion (threaded messages; not live chat) ───────── */}
              {canUseSessionChat && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={14} className="text-brand-400" />
                    <h2 className="font-semibold text-white text-sm">Colleague chat</h2>
                    {comments.length > 0 && (
                      <span className="ml-auto text-[10px] bg-brand-500/15 text-brand-300 border border-brand-500/25 rounded-full px-2 py-0.5 font-medium">
                        {comments.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                    Message thread for you and anyone with access — works on read-only access too. Stays on this session when you come back.
                  </p>

                  {loadingComments ? (
                    <div className="py-4 flex justify-center">
                      <Loader2 size={16} className="text-slate-500 animate-spin" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-slate-500 mb-4">No messages yet — say hi or leave a clinical note.</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {comments.map(c => (
                        <div key={c.id} className="flex gap-2.5">
                          <div className="h-6 w-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold text-brand-400">
                              {(c.author_name ?? 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-medium text-white">{c.author_name ?? 'Unknown'}</span>
                              <span className="text-[10px] text-slate-500">{formatRelative(c.created_at)}</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
                      placeholder="Write a message…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      onClick={postComment}
                      disabled={!commentDraft.trim() || postingComment}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2 hover:bg-brand-500/20 disabled:opacity-50 transition-colors"
                    >
                      {postingComment ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    </button>
                  </div>
                </Card>
              )}
            </div>

            {/* ── Right: summary panel ────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* PDF template versions locked at session time (audit) */}
              {isOwner && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutTemplate size={16} className="text-brand-400 shrink-0" />
                    <h2 className="font-semibold text-white text-sm">PDF template snapshot</h2>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-xl bg-white/4 border border-white/10 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Clinical note PDF
                        </span>
                        <Link to="/templates" className="text-[11px] text-brand-400 hover:text-brand-300 shrink-0">
                          Templates →
                        </Link>
                      </div>
                      {conv.template_version ? (
                        <>
                          <p className="text-slate-200">
                            <span className="font-mono text-xs text-slate-400" title={conv.template_version.id}>
                              {templateVersionShort(conv.template_version)}
                            </span>
                            {' · '}
                            {conv.template_version.template_name ?? 'Clinical template'} · v{conv.template_version.version_number}
                          </p>
                          {conv.template_version.created_at && (
                            <p className="text-[11px] text-slate-600 mt-1">
                              Version timestamp {formatDate(conv.template_version.created_at)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-slate-500 text-xs">Not captured for this session.</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-white/4 border border-white/10 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Patient-facing PDF
                        </span>
                        <Link
                          to="/templates?purpose=patient_facing"
                          className="text-[11px] text-brand-400 hover:text-brand-300 shrink-0"
                        >
                          Patient template →
                        </Link>
                      </div>
                      {conv.patient_template_version ? (
                        <>
                          <p className="text-slate-200">
                            <span className="font-mono text-xs text-slate-400" title={conv.patient_template_version.id}>
                              {templateVersionShort(conv.patient_template_version)}
                            </span>
                            {' · '}
                            {conv.patient_template_version.template_name ?? 'Patient-facing template'} · v
                            {conv.patient_template_version.version_number}
                          </p>
                          {conv.patient_template_version.created_at && (
                            <p className="text-[11px] text-slate-600 mt-1">
                              Version timestamp {formatDate(conv.patient_template_version.created_at)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-slate-500 text-xs">Not captured for this session (older visit or before patient layout).</p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

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

              {summary?.patient_facing_summary && (
                <Card variant="elevated" className="p-5">
                  <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                    <User size={14} className="text-brand-400" />
                    Patient-friendly summary
                  </h2>
                  <p className="text-xs text-slate-500 mb-2">
                    Plain-language narrative used for the patient-facing PDF export.
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {summary.patient_facing_summary}
                  </p>
                </Card>
              )}

              {/* Extracted medical fields — view or edit */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Brain size={14} className="text-brand-400" />
                    Medical Extraction
                  </h2>
                  {isApproved || !isOwner ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock size={11} /> {isApproved ? 'Locked' : 'Read only'}
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
                    {isOwner && <p className="text-xs text-slate-600 mt-1">Click "Add data" to enter fields manually.</p>}
                  </div>
                )}
              </Card>

              {/* Clinical Insights card */}
              {isOwner && (conv.status === 'complete' || conv.status === 'approved') && (
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
              {isOwner && (() => {
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

              {/* Follow-up questions card */}
              {isOwner && (() => {
                const questions = summary?.follow_up_questions ?? []
                if (!questions.length) return null
                return (
                  <Card variant="elevated" className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-violet-400" />
                      <h2 className="font-semibold text-white text-sm">Follow-up Questions</h2>
                      <span className="ml-auto text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/25 rounded-full px-2 py-0.5 font-medium">
                        {questions.length} suggested
                      </span>
                    </div>
                    <ol className="space-y-2">
                      {questions.map((q, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-300">
                          <span className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[9px] font-bold text-violet-400">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{q}</span>
                        </li>
                      ))}
                    </ol>
                    {conv.status === 'complete' || conv.status === 'approved' ? (
                      <button
                        onClick={handleContinueSession}
                        disabled={continuingSession}
                        className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-medium text-violet-300 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-xl py-2 transition-colors disabled:opacity-50"
                      >
                        {continuingSession
                          ? <Loader2 size={12} className="animate-spin" />
                          : <RefreshCw size={12} />}
                        Start follow-up session
                      </button>
                    ) : null}
                  </Card>
                )
              })()}

              {/* Patient card */}
              {isOwner && (
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
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{conv.patient.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {[conv.patient.age, conv.patient.gender].filter(Boolean).join(' · ') || 'No details'}
                          </p>
                        </div>
                        {conv.patient.patient_code && (
                          <span className="shrink-0 text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-2 py-0.5">
                            {conv.patient.patient_code}
                          </span>
                        )}
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
                      <Link
                        to={`/patients/${conv.patient.id}`}
                        className="flex items-center gap-1.5 text-[11px] text-brand-400 hover:text-brand-300 font-medium mt-1 transition-colors"
                      >
                        <Link2 size={11} />
                        View full patient thread
                      </Link>
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
              )}

              {/* ── Access management card (owner only) ──── */}
              {isOwner && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={14} className="text-brand-400" />
                    <h2 className="font-semibold text-white text-sm">Access</h2>
                    {grants.filter(g => g.is_active).length > 0 && (
                      <span className="ml-auto text-[10px] bg-brand-500/15 text-brand-300 border border-brand-500/25 rounded-full px-2 py-0.5 font-medium">
                        {grants.filter(g => g.is_active).length} active
                      </span>
                    )}
                  </div>

                  {/* Active grants list */}
                  {loadingGrants ? (
                    <div className="py-2 flex justify-center mb-3">
                      <Loader2 size={14} className="text-slate-500 animate-spin" />
                    </div>
                  ) : grants.length === 0 ? (
                    <p className="text-xs text-slate-500 mb-4">No shared access yet.</p>
                  ) : (
                    <div className="space-y-2 mb-4">
                      {grants.map(g => {
                        const displayName = g.grantee_name ?? g.grantee?.name
                        const granteeKey  = g.grantee_id ?? g.grantee?.id
                        return (
                        <div
                          key={g.id}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${g.is_active ? 'border-white/10 bg-white/4' : 'border-white/5 bg-white/2 opacity-50'}`}
                        >
                          <div className="h-6 w-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold text-brand-400">
                              {(displayName ?? 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {displayName ?? (granteeKey ? `${granteeKey.slice(0, 8)}…` : 'Unknown')}
                            </p>
                            {g.expires_at && (
                              <p className="text-[10px] text-slate-500">
                                Expires {new Date(g.expires_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${PERMISSION_LABELS[g.permission]?.color ?? ''}`}>
                            {PERMISSION_LABELS[g.permission]?.label ?? g.permission}
                          </span>
                          {g.is_active && (
                            <button
                              onClick={() => revokeGrant(g.id)}
                              disabled={revokingGrant === g.id}
                              className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                              title="Revoke access"
                            >
                              {revokingGrant === g.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Trash2 size={11} />}
                            </button>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Grant new access */}
                  <div className="space-y-2 pt-3 border-t border-white/8">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Grant access</p>

                    {/* Colleague search */}
                    <div className="relative">
                      <UserSearch size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        value={colleagueSearch}
                        onChange={e => handleColleagueSearch(e.target.value)}
                        onFocus={() => colleagueSearch && setShowColleagueDD(true)}
                        onBlur={() => setTimeout(() => setShowColleagueDD(false), 150)}
                        placeholder="Search colleague by name…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {searchingColleague && (
                        <Loader2 size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
                      )}
                      {showColleagueDD && colleagueResults.length > 0 && (
                        <div className="absolute z-20 top-full mt-1 w-full bg-surface-300 border border-white/10 rounded-xl shadow-xl overflow-hidden">
                          {colleagueResults.map(u => (
                            <button
                              key={u.id}
                              onMouseDown={() => selectColleague(u)}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/8 text-left transition-colors"
                            >
                              <div className="h-6 w-6 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-violet-400">{u.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-white truncate">{u.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Permission + expiry row */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <select
                          value={grantPermission}
                          onChange={e => setGrantPermission(e.target.value as 'read' | 'comment' | 'write')}
                          className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500 pr-7"
                        >
                          <option value="read">Read</option>
                          <option value="comment">Comment</option>
                          <option value="write">Write</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                      <input
                        type="date"
                        value={grantExpiry}
                        onChange={e => setGrantExpiry(e.target.value)}
                        placeholder="Expiry (opt.)"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        title="Expiry date (optional)"
                      />
                    </div>

                    <button
                      onClick={grantAccess}
                      disabled={!selectedColleague || grantingAccess}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-xl py-2 hover:bg-brand-500/20 disabled:opacity-50 transition-colors"
                    >
                      {grantingAccess ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      {selectedColleague ? `Grant to ${selectedColleague.name}` : 'Grant access'}
                    </button>
                  </div>
                </Card>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* ── Consult modal ───────────────────────────────────── */}
      {showConsultModal && conv && (
        <ConsultModal
          session={conv}
          onClose={() => setShowConsultModal(false)}
          onSent={() => toast('Consult request sent', 'success')}
        />
      )}
    </div>
  )
}
