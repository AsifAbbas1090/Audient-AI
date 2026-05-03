import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Square, Clock, Download, Trash2, CheckCircle2,
  Mic, Wifi, WifiOff, Loader2, AlertCircle,
  ChevronDown, Stethoscope, User, RefreshCw,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Badge }         from '../components/ui/Badge'
import { Button }        from '../components/ui/Button'
import { Card }          from '../components/ui/Card'
import { Waveform }      from '../components/visual/Waveform'
import { RecordButton }  from '../components/visual/RecordButton'
import { SpeakerBubble, isPatientSpeakerLabel, isThirdSpeakerLabel } from '../components/visual/SpeakerBubble'
import { VocalPromptsIndicator } from '../components/VocalPromptsIndicator'
import { useVocalPrompts } from '../hooks/useVocalPrompts'
import { speak, primeAudio } from '../lib/vocalAudio'
import { useLiveSession, type Segment, type LiveFields, type LlmCorrection } from '../hooks/useLiveSession'
import { useToast }      from '../components/ui/Toaster'
import api from '../lib/api'
import { inferDualMicDefaults, shouldAutoInferDualMic } from '../lib/audioDeviceHeuristics'
import { writeDraft, readDraft, clearDraft, type SessionDraft } from '../lib/sessionDraft'

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_MS = 2_000

type SessionTerminalWs = { conversation_id?: string; session_id?: string; status?: string }

function wsMatchesConv(data: SessionTerminalWs, convId: string): boolean {
  return data.conversation_id === convId || data.session_id === convId
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Typing bubble — shown inside each transcript column while a chunk is in-flight ──
function TypingBubble({ color = 'brand' }: { color?: 'brand' | 'emerald' }) {
  const base = color === 'emerald' ? 'bg-emerald-400' : 'bg-brand-400'
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-white/5 light:bg-slate-100 w-fit">
      <span className={`h-1.5 w-1.5 rounded-full ${base} animate-bounce [animation-delay:-0.3s]`} />
      <span className={`h-1.5 w-1.5 rounded-full ${base} animate-bounce [animation-delay:-0.15s]`} />
      <span className={`h-1.5 w-1.5 rounded-full ${base} animate-bounce`} />
    </div>
  )
}

// ── Processing overlay ────────────────────────────────────────────────────────
const PROGRESS_STEPS = [
  { label: 'Saving transcript',          pct: 20  },
  { label: 'Labelling speakers…',        pct: 45  },
  { label: 'Extracting medical fields…', pct: 70  },
  { label: 'Generating field alerts…',   pct: 90  },
  { label: 'Done',                       pct: 100 },
]

function ProcessingOverlay({ step }: { step: number }) {
  const current = PROGRESS_STEPS[Math.min(step, PROGRESS_STEPS.length - 1)]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-400/90 light:bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-white/5 border border-white/10 light:bg-white light:border-slate-200 rounded-2xl p-8 text-center shadow-2xl">
        <Loader2 size={40} className="mx-auto text-brand-400 animate-spin mb-5" />
        <h2 className="text-white light:text-slate-900 font-semibold text-lg mb-1">Processing Session</h2>
        <p className="text-slate-400 light:text-slate-600 text-sm mb-6">{current.label}</p>
        <div className="h-1.5 w-full bg-white/10 light:bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-700"
            style={{ width: `${current.pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 light:text-slate-500 mt-3">
          AI is diarizing speakers and extracting clinical fields…
        </p>
      </div>
    </div>
  )
}

// ── Device selector ───────────────────────────────────────────────────────────
type AudioDevice = { deviceId: string; label: string }

function DeviceSelect({
  icon, label, devices, value, onChange, placeholder,
}: {
  icon: React.ReactNode; label: string; devices: AudioDevice[]
  value: string; onChange: (id: string) => void; placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-slate-400 flex items-center gap-1.5">{icon}{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="device-select-native w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 pr-7 focus:outline-none focus:border-brand-500/50 light:bg-white light:border-slate-200 light:text-slate-900"
        >
          <option value="">{placeholder}</option>
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  )
}

// ── Live fields preview ────────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  Name:            'Patient',
  Age:             'Age',
  Gender:          'Gender',
  Disease:         'Condition',
  Education:       'Education',
  EmotionalState:  'Mood',
  AdditionalNotes: 'Notes',
}

function LiveFieldsPanel({ fields }: { fields: LiveFields }) {
  const entries = Object.entries(FIELD_LABELS)
    .map(([key, label]) => ({ key, label, value: fields[key] as string | null | undefined }))
    .filter(e => e.value && e.value !== 'null')

  if (entries.length === 0) return null

  return (
    <Card variant="elevated" className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope size={13} className="text-brand-400" />
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Live Extraction</h3>
        <Badge variant="processing" dot className="ml-auto text-[10px] px-1.5 py-0.5">Live</Badge>
      </div>
      <div className="space-y-2">
        {entries.map(({ key, label, value }) => (
          <div key={key} className="flex items-start gap-2">
            <span className="text-[10px] text-slate-500 w-16 shrink-0 pt-0.5">{label}</span>
            <span className="text-[11px] text-slate-200 leading-tight break-words min-w-0">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LiveSessionPage() {
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()
  const toast          = useToast()

  const continueSessionId = searchParams.get('continue')
  const parentSessionId   = searchParams.get('parent')

  // ── Continuation context (stashed by SessionDetailPage before navigating) ──
  type ContinueCtx = {
    contextSeed:       string
    parentSummary:     Record<string, string | null>
    followUpQuestions: string[]
    parentTitle:       string | null
  }
  const continueCtx = useMemo<ContinueCtx | null>(() => {
    if (!continueSessionId) return null
    try {
      const raw = sessionStorage.getItem(`continue_ctx_${continueSessionId}`)
      return raw ? (JSON.parse(raw) as ContinueCtx) : null
    } catch { return null }
  }, [continueSessionId])

  const [segments,     setSegments]     = useState<Segment[]>([])
  const [elapsed,      setElapsed]      = useState(0)
  const [processing,   setProcessing]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [finalizing,   setFinalizing]   = useState(false)  // waiting for last Groq chunk after stop
  const [progressStep, setProgressStep] = useState(0)
  const [savedId,      setSavedId]      = useState<string | null>(null)
  const [statusMsg,    setStatusMsg]    = useState<string | null>(null)
  const [parentTitle,  setParentTitle]  = useState<string | null>(null)
  // Tracks which follow-up questions have been addressed during the session
  const [checkedQuestions, setCheckedQuestions] = useState<Set<number>>(new Set())

  // ── Device selection ────────────────────────────────────────────────────────
  const [audioDevices,    setAudioDevices]    = useState<AudioDevice[]>([])
  const [doctorDeviceId,  setDoctorDeviceId]  = useState('')
  const [patientDeviceId, setPatientDeviceId] = useState('')

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devs => setAudioDevices(
        devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label }))
      ))
      .catch(() => {})
  }, [])

  const refreshDevices = useCallback(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devs => setAudioDevices(
        devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label }))
      ))
      .catch(() => {})
  }, [])

  // ── Scenario detection state ────────────────────────────────────────────────
  const [telehealthMode,       setTelehealthMode]       = useState(false)
  const [dualMicDismissed,     setDualMicDismissed]     = useState(false)
  /** Set when we auto-filled Doctor + Patient from device labels (show one-line hint). */
  const [dualMicSuggested,     setDualMicSuggested]     = useState(false)
  const [thirdSpeakerDetected, setThirdSpeakerDetected] = useState(false)
  const [thirdSpeakerLabel,    setThirdSpeakerLabel]    = useState('Other')
  const [showThirdColumn,      setShowThirdColumn]       = useState(false)
  const [noisyEnvironment,     setNoisyEnvironment]     = useState(false)

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedIdRef  = useRef<string | null>(null)
  const elapsedRef  = useRef(0)
  const clinBottomRef   = useRef<HTMLDivElement>(null)
  const patBottomRef    = useRef<HTMLDivElement>(null)
  const thirdBottomRef  = useRef<HTMLDivElement>(null)
  const prevClinLen     = useRef(0)
  const prevPatLen      = useRef(0)
  const prevThirdLen    = useRef(0)
  const isSavingRef        = useRef(false)
  const finalizeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref so callbacks can read fresh values without stale closures
  const patientDeviceIdRef = useRef(patientDeviceId)
  const noisyCountRef      = useRef(0)

  // Draft persistence state
  const [draftToRestore,    setDraftToRestore]    = useState<SessionDraft | null>(null)
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null)

  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])
  useEffect(() => { patientDeviceIdRef.current = patientDeviceId }, [patientDeviceId])

  // ── Session draft persistence ─────────────────────────────────────────────────
  // On mount: offer to restore an unsaved draft (e.g. after internet loss + reload)
  useEffect(() => {
    const draft = readDraft()
    if (draft && draft.segments.length > 0) setDraftToRestore(draft)
  }, [])

  // Populate parentTitle from stored context (fast, no extra API call) or fall back to a fetch
  useEffect(() => {
    if (continueCtx?.parentTitle) {
      setParentTitle(continueCtx.parentTitle)
    } else if (parentSessionId) {
      api.get<{ conversation: { title: string | null } }>(`/api/conversations/${parentSessionId}`)
        .then(r => setParentTitle(r.data.conversation.title))
        .catch(() => {})
    }
  }, [parentSessionId, continueCtx])

  // ── Live session hook ────────────────────────────────────────────────────────
  const session = useLiveSession({
    doctorDeviceId:  doctorDeviceId  || undefined,
    patientDeviceId: patientDeviceId || undefined,
    contextSeed:     continueCtx?.contextSeed || undefined,

    onChunkSent: useCallback(() => {
      setProcessing(true)  // show typing bubble the instant audio leaves the browser
    }, []),

    onTranscriptUpdate: useCallback((newSegs: Segment[]) => {
      setProcessing(false)
      // Dual-channel (separate mics) → labels are exact, never provisional
      const isDualChannel = !!patientDeviceIdRef.current
      const isProvisional = !isDualChannel && elapsedRef.current < 30
      setSegments(prev => {
        const next = [...prev, ...newSegs.map(s => ({ ...s, provisional: isProvisional }))]
        session.setSegmentsRef(next)
        return next
      })
      // Noisy environment: if every segment is very short, audio quality may be poor
      const totalWords = newSegs.reduce((n, s) => n + s.text.trim().split(/\s+/).filter(Boolean).length, 0)
      if (totalWords < 3) {
        noisyCountRef.current++
        if (noisyCountRef.current >= 3) setNoisyEnvironment(true)
      } else {
        noisyCountRef.current = 0
        setNoisyEnvironment(false)
      }
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps

    onDiarizeUpdate: useCallback((rawSegs) => {
      const stabilized = elapsedRef.current >= 30
      // Detect a third voice (family member, nurse, etc.)
      const hasThird = rawSegs.some(s => isThirdSpeakerLabel(s.speaker ?? ''))
      if (hasThird) setThirdSpeakerDetected(true)
      setSegments(prev => {
        let idx = 0
        return prev.map(seg => {
          if (seg.start == null || seg.end == null) return seg
          const labeled = rawSegs[idx]
          if (!labeled) return seg
          idx++
          return {
            ...seg,
            speaker: labeled.speaker ?? seg.speaker,
            ...(stabilized ? { provisional: false } : {}),
          }
        })
      })
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps

    // LLM speaker-correction: retroactively fix Doctor/Patient labels using
    // semantic understanding. Runs every 25 s after a 15 s warm-up.
    // "Doctor" → "Speaker 1", "Patient" → "Patient" to match display conventions.
    onLlmCorrectUpdate: useCallback((corrections: LlmCorrection[]) => {
      setSegments(prev => {
        const corrMap = new Map(corrections.map(c => [c.id, c.speaker]))
        return prev.map(seg => {
          const role = corrMap.get(seg.id)
          if (!role) return seg
          return {
            ...seg,
            speaker:     role === 'Doctor' ? 'Speaker 1' : 'Patient',
            provisional: false,   // semantically verified — no longer provisional
          }
        })
      })
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps

    onLanguage: useCallback((lang: string) => {
      console.log('[Live] detected language:', lang)
    }, []),

    onError: useCallback((msg: string) => {
      setStatusMsg(msg)
      setProcessing(false)
    }, []),
  })

  const {
    connected, sessionId, active, paused, recording,
    permissionError, liveFields,
    startSession, pauseSession, resumeSession, stopSession,
    getBlob,
  } = session

  /** When idle + two mics + both selects empty → headset→Doctor, built-in→Patient */
  useEffect(() => {
    if (active || saving) return
    if (doctorDeviceId || patientDeviceId) return
    if (audioDevices.length < 2) return
    if (!shouldAutoInferDualMic(audioDevices)) return
    const picked = inferDualMicDefaults(audioDevices)
    if (!picked) return
    setDoctorDeviceId(picked.doctorId)
    setPatientDeviceId(picked.patientId)
    setDualMicDismissed(true)
    setDualMicSuggested(true)
  }, [audioDevices, active, saving, doctorDeviceId, patientDeviceId])

  // Write to localStorage whenever segments accumulate during a live recording
  useEffect(() => {
    if (!sessionId || segments.length === 0) return
    writeDraft(sessionId, segments, elapsedRef.current)
  }, [segments, sessionId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (active && !paused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1_000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [active, paused])

  useEffect(() => {
    if (active && !paused) setProcessing(true)
  }, [segments.length])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active || recording || !sessionId || isSavingRef.current) return

    if (segments.length > 0) {
      // Normal path — transcript already available, save immediately
      if (finalizeTimerRef.current) { clearTimeout(finalizeTimerRef.current); finalizeTimerRef.current = null }
      setFinalizing(false)
      isSavingRef.current = true
      saveSession(sessionId)
      return
    }

    // No segments yet — session stopped before first Groq response came back.
    // Show "Finalizing…" UI and wait up to 15 s for the in-flight chunk to land.
    // If nothing arrives, save anyway so the session doesn't stay stuck in "Processing" in the DB.
    setFinalizing(true)
    if (!finalizeTimerRef.current) {
      const sid = sessionId  // capture for timeout closure
      finalizeTimerRef.current = setTimeout(() => {
        finalizeTimerRef.current = null
        setFinalizing(false)
        if (!isSavingRef.current) {
          isSavingRef.current = true
          saveSession(sid)
          toast('Short session saved — transcript may be limited', 'info')
        }
      }, 15_000)
    }
  }, [active, recording, segments])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save session ────────────────────────────────────────────────────────────
  async function saveSession(convId: string) {
    setSaving(true)
    setProgressStep(0)
    try {
      setProgressStep(1)
      const payload = {
        segments: segments.map(s => ({ speaker: s.speaker, text: s.text, start: s.start, end: s.end })),
        duration: elapsedRef.current,
        language: session.detectedLanguage(),
      }
      const res     = await api.post(`/api/conversations/${convId}/complete`, payload)
      const convId2 = res.data.conversation_id ?? convId
      savedIdRef.current = convId2
      setSavedId(convId2)

      const blob = getBlob('audio/webm')
      if (blob && blob.size >= 500) {
        const form = new FormData()
        form.append('file', blob, 'session.webm')
        api.post(`/api/conversations/${convId2}/audio`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch(() => {})
      }

      setProgressStep(2)
      await pollUntilDone(convId2)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Could not save session'
      toast(msg, 'error')
      setSaving(false)
      isSavingRef.current = false
    }
  }

  async function pollUntilDone(convId: string) {
    let step = 2
    let done = false

    const finish = (failed = false) => {
      if (done) return
      done = true
      clearInterval(pollRef.current!)
      session.socket.current?.off('session_ready')
      session.socket.current?.off('session_failed')
      if (failed) {
        setSaving(false)
        isSavingRef.current = false
        toast('Processing failed — transcript still visible above', 'error')
      } else {
        clearDraft()  // session fully saved — no need to keep the local copy
        setRestoredSessionId(null)
        setProgressStep(PROGRESS_STEPS.length - 1)
        setSaving(false)
        toast('Session saved — opening record…', 'success')
        setTimeout(() => navigate(`/session/${convId}`), 800)
      }
    }

    // Immediate HTTP check — avoids waiting a full poll interval after WS missed an event
    try {
      const r0 = await api.get(`/api/conversations/${convId}/status`)
      const s0 = r0.data?.status as string | undefined
      if (s0 === 'complete' || s0 === 'approved') {
        finish()
        return
      }
      if (s0 === 'failed') {
        finish(true)
        return
      }
    } catch { /* keep polling */ }

    // Primary: WebSocket push — arrives the moment the task completes
    session.socket.current?.on('session_ready', (data: SessionTerminalWs) => {
      if (wsMatchesConv(data, convId)) finish()
    })
    session.socket.current?.on('session_failed', (data: SessionTerminalWs) => {
      if (wsMatchesConv(data, convId)) finish(true)
    })

    // Fallback: HTTP poll — handles cases where WS is disconnected or events lack routing
    pollRef.current = setInterval(async () => {
      try {
        const r      = await api.get(`/api/conversations/${convId}/status`)
        const status = r.data?.status
        step = Math.min(step + 1, PROGRESS_STEPS.length - 2)
        setProgressStep(step)
        if (status === 'complete' || status === 'approved') finish()
        else if (status === 'failed') finish(true)
      } catch { /* transient — keep polling */ }
    }, POLL_MS)
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    primeAudio()  // unlock AudioContext during this user gesture
    // Discard any pending draft — new recording supersedes it
    clearDraft()
    setDraftToRestore(null)
    setRestoredSessionId(null)
    isSavingRef.current = false
    if (finalizeTimerRef.current) { clearTimeout(finalizeTimerRef.current); finalizeTimerRef.current = null }
    setFinalizing(false)
    setSavedId(null)
    setSegments([])
    setElapsed(0)
    setStatusMsg(null)
    setProcessing(true)
    setThirdSpeakerDetected(false)
    setShowThirdColumn(false)
    setNoisyEnvironment(false)
    noisyCountRef.current = 0
    await startSession(continueSessionId ?? undefined)
    // Clean up sessionStorage after the session is registered
    if (continueSessionId) sessionStorage.removeItem(`continue_ctx_${continueSessionId}`)
    // Clean up sessionStorage after the session is registered
    if (continueSessionId) sessionStorage.removeItem(`continue_ctx_${continueSessionId}`)
    refreshDevices()
    toast(continueSessionId ? 'Follow-up session started' : 'Session started — recording', 'success')
  }, [startSession, continueSessionId, toast, refreshDevices])

  const handlePause  = useCallback(() => { pauseSession();           toast('Recording paused',   'info') }, [pauseSession,  toast])
  const handleResume = useCallback(async () => { await resumeSession(); toast('Recording resumed', 'info') }, [resumeSession, toast])
  const handleStop   = useCallback(() => { stopSession();             toast('Session ended — saving…', 'info') }, [stopSession,   toast])

  const handleClear = useCallback(() => {
    setSegments([]); setStatusMsg(null); setElapsed(0); setSavedId(null); isSavingRef.current = false
  }, [])

  // ── Draft restore / discard / save ──────────────────────────────────────────
  function handleRestoreDraft() {
    if (!draftToRestore) return
    setSegments(draftToRestore.segments)
    setElapsed(draftToRestore.elapsed)
    elapsedRef.current = draftToRestore.elapsed
    session.setSegmentsRef(draftToRestore.segments)
    setRestoredSessionId(draftToRestore.sessionId)
    isSavingRef.current = false
    setDraftToRestore(null)
    clearDraft()
    toast('Session restored — review and save when ready', 'success')
  }

  function handleDiscardDraft() {
    clearDraft()
    setDraftToRestore(null)
  }

  async function handleSaveRestored() {
    if (!restoredSessionId || saving) return
    isSavingRef.current = true
    await saveSession(restoredSessionId)
  }

  // ── Scenario handlers ─────────────────────────────────────────────────────
  const handleAutoDualMic = useCallback(() => {
    const picked = inferDualMicDefaults(audioDevices)
    if (picked) {
      setDoctorDeviceId(picked.doctorId)
      setPatientDeviceId(picked.patientId)
      setDualMicSuggested(true)
    }
    setDualMicDismissed(true)
  }, [audioDevices])

  const handleTelehealthToggle = useCallback((enabled: boolean) => {
    setTelehealthMode(enabled)
    if (enabled) {
      const picked = inferDualMicDefaults(audioDevices)
      if (picked) {
        setDoctorDeviceId(picked.doctorId)
        setPatientDeviceId(picked.patientId)
        setDualMicSuggested(true)
      } else {
        const second = audioDevices.find(d => d.deviceId !== 'default' && d.deviceId !== doctorDeviceId)
        if (second) setPatientDeviceId(second.deviceId)
      }
    } else {
      setPatientDeviceId('')
    }
  }, [audioDevices, doctorDeviceId])

  const handleCorrection = useCallback((segId: number, action: 'doctor' | 'patient' | 'remove') => {
    setSegments(prev => {
      if (action === 'remove') return prev.filter(s => s.id !== segId)
      return prev.map(s => s.id !== segId ? s : {
        ...s,
        speaker:     action === 'doctor' ? 'Speaker 1' : 'Patient',
        provisional: false,
      })
    })
    // Fire-and-forget — logs correction for future model improvement
    if (savedIdRef.current || sessionId) {
      api.post('/api/session/correction', {
        session_id: savedIdRef.current ?? sessionId,
        action,
      }).catch(() => {})
    }
  }, [sessionId])

  const handleToggle = useCallback(async () => {
    if (!active)       await handleStart()
    else if (!paused)  handlePause()
    else               await handleResume()
  }, [active, paused, handleStart, handlePause, handleResume])

  const handleExport = () => {
    const text = segments.map(s => `[${s.speaker}] ${s.text}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `transcript-${Date.now()}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Vocal prompts — always-on "Audient" wake word ───────────────────────────
  const handleGenerateSummary = useCallback(() => {
    const entries = Object.entries(FIELD_LABELS)
      .map(([key, label]) => ({ label, value: (liveFields as any)[key] as string | null | undefined }))
      .filter(e => e.value && e.value !== 'null')

    if (entries.length === 0) {
      speak('No extraction data available yet. Session is still recording.')
    } else {
      const text = entries.map(e => `${e.label}: ${e.value}`).join('. ')
      speak(`Current extraction. ${text}.`)
    }
  }, [liveFields])

  const { phase: vocalPhase, supported: vocalSupported, lastCmd: vocalLastCmd, lastHeard: vocalLastHeard } = useVocalPrompts({
    sessionId:         sessionId,
    onStart:           () => { if (!active) handleStart() },
    onStop:            () => { if (active)  handleStop()  },
    onPause:           () => { if (active && !paused) handlePause() },
    onResume:          () => { if (active && paused)  handleResume() },
    onGenerateSummary: handleGenerateSummary,
  })

  // ── Derived state ────────────────────────────────────────────────────────────
  const recordState = saving
    ? 'processing'
    : active && !paused ? 'recording'
    : active &&  paused ? 'paused'
    : 'idle'

  const speakerSet    = [...new Set(segments.map(s => s.speaker))]
  const wordCount     = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0)
  const hasLiveFields = Object.values(liveFields).some(v => v && v !== 'null')
  const isDualChannel = !!patientDeviceId
  // Settling banner: first 30s, single mic only — dual-channel labels are always exact
  const isSettling       = active && !paused && elapsed < 30 && !isDualChannel
  const settlingSecsLeft = Math.max(0, 30 - elapsed)

  const clinicianSegments = useMemo(
    () => segments.filter(s => !isPatientSpeakerLabel(s.speaker) && !(showThirdColumn && isThirdSpeakerLabel(s.speaker))),
    [segments, showThirdColumn],
  )
  const patientSegments = useMemo(
    () => segments.filter(s => isPatientSpeakerLabel(s.speaker)),
    [segments],
  )
  const thirdSpeakerSegments = useMemo(
    () => showThirdColumn ? segments.filter(s => isThirdSpeakerLabel(s.speaker)) : [],
    [segments, showThirdColumn],
  )

  /** Scroll only the column that gained lines so new speech stays visible. */
  useEffect(() => {
    const cn = clinicianSegments.length
    const pn = patientSegments.length
    const tn = thirdSpeakerSegments.length
    if (cn > prevClinLen.current)  clinBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    if (pn > prevPatLen.current)   patBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    if (tn > prevThirdLen.current) thirdBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    prevClinLen.current  = cn
    prevPatLen.current   = pn
    prevThirdLen.current = tn
  }, [clinicianSegments.length, patientSegments.length, thirdSpeakerSegments.length])

  useEffect(() => {
    if (segments.length === 0) {
      prevClinLen.current = 0
      prevPatLen.current = 0
    }
  }, [segments.length])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app-page">
      <Sidebar />
      {saving && <ProcessingOverlay step={progressStep} />}

      {/* Finalizing overlay — shown for short sessions while waiting for last Groq chunk */}
      {finalizing && !saving && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 px-8 py-6 bg-surface-200 border border-white/10 rounded-2xl shadow-2xl">
            <Loader2 size={28} className="text-brand-400 animate-spin" />
            <p className="text-sm font-medium text-white">Finalizing recording…</p>
            <p className="text-xs text-slate-500">Waiting for last transcription chunk</p>
          </div>
        </div>
      )}

      {/* Always-on vocal prompts indicator (bottom-right dot) */}
      <VocalPromptsIndicator
        phase={vocalPhase}
        lastCmd={vocalLastCmd}
        lastHeard={vocalLastHeard}
        supported={vocalSupported}
      />

      <main className="flex-1 overflow-hidden flex flex-col light:bg-slate-100">

        {/* ── Unsaved draft restore banner ────────────────────────────────── */}
        {draftToRestore && !active && !saving && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <AlertCircle size={14} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-amber-200 font-medium">Unsaved session found</span>
              <span className="text-xs text-amber-500 ml-2">
                {formatTime(draftToRestore.elapsed)} · {draftToRestore.segments.length} segment{draftToRestore.segments.length !== 1 ? 's' : ''}
              </span>
              <p className="text-xs text-amber-500/80 mt-0.5">
                Connection lost before saving. Restore to review and save the transcript.
              </p>
            </div>
            <button
              onClick={handleDiscardDraft}
              className="shrink-0 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleRestoreDraft}
              className="shrink-0 flex items-center gap-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <RefreshCw size={11} />
              Restore Session
            </button>
          </div>
        )}

        {/* ── Restored-session action banner ──────────────────────────────── */}
        {restoredSessionId && !active && !saving && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-emerald-500/8 border-b border-emerald-500/15">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-300 flex-1">
              Session restored from local cache. Review the transcript below, then save.
            </span>
            <button
              onClick={handleSaveRestored}
              disabled={saving}
              className="shrink-0 flex items-center gap-1.5 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <CheckCircle2 size={11} />
              Save Session
            </button>
          </div>
        )}

        {/* ── Continuation banner ─────────────────────────────────────────── */}
        {continueSessionId && (
          <div className="shrink-0 flex items-center gap-2 px-6 py-2.5 bg-violet-500/10 border-b border-violet-500/20 text-xs text-violet-300">
            <RefreshCw size={12} className="shrink-0" />
            <span>
              Follow-up session
              {parentTitle ? <> — continuing <strong className="text-violet-200">"{parentTitle}"</strong></> : null}
            </span>
            {parentSessionId && (
              <button
                onClick={() => navigate(`/sessions/${parentSessionId}`)}
                className="ml-auto underline hover:text-violet-100 transition-colors"
              >
                View original
              </button>
            )}
          </div>
        )}

        {/* ── Parent context panel (continuation sessions only) ───────────── */}
        {continueCtx && (
          <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3 px-6 py-3 border-b border-white/8 bg-slate-900/40">

            {/* Patient summary card */}
            {continueCtx.parentSummary && Object.values(continueCtx.parentSummary).some(Boolean) && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Previous Visit — Patient</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {continueCtx.parentSummary.patient_name   && <><span className="text-slate-500">Name</span>   <span className="text-slate-200 truncate">{continueCtx.parentSummary.patient_name}</span></>}
                  {continueCtx.parentSummary.patient_age    && <><span className="text-slate-500">Age</span>    <span className="text-slate-200">{continueCtx.parentSummary.patient_age}</span></>}
                  {continueCtx.parentSummary.patient_gender && <><span className="text-slate-500">Gender</span> <span className="text-slate-200">{continueCtx.parentSummary.patient_gender}</span></>}
                  {continueCtx.parentSummary.disease        && <><span className="text-slate-500">Condition</span><span className="text-slate-200 truncate col-span-1">{continueCtx.parentSummary.disease}</span></>}
                  {continueCtx.parentSummary.additional_notes && (
                    <div className="col-span-2 mt-1 text-slate-400 leading-relaxed line-clamp-2">
                      {continueCtx.parentSummary.additional_notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up questions checklist */}
            {continueCtx.followUpQuestions.length > 0 && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  AI-Suggested Follow-up Questions
                </p>
                <ul className="space-y-1.5">
                  {continueCtx.followUpQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <button
                        onClick={() => setCheckedQuestions(prev => {
                          const next = new Set(prev)
                          next.has(i) ? next.delete(i) : next.add(i)
                          return next
                        })}
                        className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border transition-colors ${
                          checkedQuestions.has(i)
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-600 bg-transparent hover:border-slate-400'
                        }`}
                      >
                        {checkedQuestions.has(i) && (
                          <svg viewBox="0 0 10 10" fill="none" className="w-full h-full p-0.5">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <span className={`text-xs leading-relaxed transition-colors ${checkedQuestions.has(i) ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                        {q}
                      </span>
                    </li>
                  ))}
                </ul>
                {checkedQuestions.size > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-500">
                    {checkedQuestions.size}/{continueCtx.followUpQuestions.length} addressed
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Parent context panel (continuation sessions only) ───────────── */}
        {continueCtx && (
          <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3 px-6 py-3 border-b border-white/8 bg-slate-900/40">

            {/* Patient summary card */}
            {continueCtx.parentSummary && Object.values(continueCtx.parentSummary).some(Boolean) && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Previous Visit — Patient</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {continueCtx.parentSummary.patient_name   && <><span className="text-slate-500">Name</span>   <span className="text-slate-200 truncate">{continueCtx.parentSummary.patient_name}</span></>}
                  {continueCtx.parentSummary.patient_age    && <><span className="text-slate-500">Age</span>    <span className="text-slate-200">{continueCtx.parentSummary.patient_age}</span></>}
                  {continueCtx.parentSummary.patient_gender && <><span className="text-slate-500">Gender</span> <span className="text-slate-200">{continueCtx.parentSummary.patient_gender}</span></>}
                  {continueCtx.parentSummary.disease        && <><span className="text-slate-500">Condition</span><span className="text-slate-200 truncate col-span-1">{continueCtx.parentSummary.disease}</span></>}
                  {continueCtx.parentSummary.additional_notes && (
                    <div className="col-span-2 mt-1 text-slate-400 leading-relaxed line-clamp-2">
                      {continueCtx.parentSummary.additional_notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up questions checklist */}
            {continueCtx.followUpQuestions.length > 0 && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  AI-Suggested Follow-up Questions
                </p>
                <ul className="space-y-1.5">
                  {continueCtx.followUpQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <button
                        onClick={() => setCheckedQuestions(prev => {
                          const next = new Set(prev)
                          next.has(i) ? next.delete(i) : next.add(i)
                          return next
                        })}
                        className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded border transition-colors ${
                          checkedQuestions.has(i)
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-600 bg-transparent hover:border-slate-400'
                        }`}
                      >
                        {checkedQuestions.has(i) && (
                          <svg viewBox="0 0 10 10" fill="none" className="w-full h-full p-0.5">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <span className={`text-xs leading-relaxed transition-colors ${checkedQuestions.has(i) ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                        {q}
                      </span>
                    </li>
                  ))}
                </ul>
                {checkedQuestions.size > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-500">
                    {checkedQuestions.size}/{continueCtx.followUpQuestions.length} addressed
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-lg text-white">
              {continueSessionId ? 'Follow-up Session' : 'Live Session'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              WebSocket · Any language → English · AI diarization
              {vocalSupported && (
                <span className="ml-2 text-brand-400/80">· Say "Audient [command]"</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {active && !paused && <Badge variant="success"    dot>Recording</Badge>}
            {active &&  paused && <Badge variant="warning"    dot>Paused</Badge>}
            {saving            && <Badge variant="processing" dot>Processing…</Badge>}
            {savedId && !saving && (
              <Badge variant="success"><CheckCircle2 size={11} className="mr-1" /> Saved</Badge>
            )}
            {!active && !savedId && segments.length > 0 && !restoredSessionId && (
              <Badge variant="default">Session ended</Badge>
            )}
            {restoredSessionId && !saving && (
              <Badge variant="warning"><RefreshCw size={11} className="mr-1" /> Restored</Badge>
            )}

            {active && (
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <Clock size={13} />
                {formatTime(elapsed)}
              </div>
            )}

            <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Live' : 'Connecting…'}
            </div>

            {/* Vocal prompts state chip */}
            {vocalSupported && (
              <div className={`flex items-center gap-1.5 text-xs rounded-xl px-3 py-1.5 border transition-all ${
                vocalPhase === 'listening'
                  ? 'text-brand-300 bg-brand-500/15 border-brand-500/30 animate-pulse'
                  : 'text-slate-500 bg-white/4 border-white/8'
              }`}>
                <Mic size={12} className={vocalPhase === 'listening' ? 'text-brand-400' : 'text-slate-600'} />
                {vocalPhase === 'listening' ? 'Listening…' : 'Vocal on'}
              </div>
            )}
          </div>
        </header>

        {/* Last vocal command toast strip */}
        {vocalLastCmd && (
          <div className="shrink-0 flex justify-center py-2 pointer-events-none">
            <div className="flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 text-brand-200 text-sm font-medium px-4 py-2 rounded-full shadow-lg">
              <Mic size={13} />
              Vocal: <span className="font-bold capitalize">{vocalLastCmd.replace('_', ' ')}</span>
            </div>
          </div>
        )}

        {/* ── Body: controls + side-by-side transcript + sidebar ───────── */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 p-6 min-h-0">

          <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">

            {/* One live panel: mic + waveform, then transcript directly underneath */}
            <Card variant="elevated" className="flex flex-col flex-1 min-h-0 overflow-hidden p-0">
              <div className="shrink-0 p-4 lg:p-5 border-b border-white/8 light:border-slate-200/80">
                <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 lg:gap-6">
                  <div className="flex flex-col items-center justify-center gap-3 shrink-0 lg:w-52">
                    <RecordButton state={recordState} onClick={handleToggle} size="lg" />
                    {active && (
                      <Button variant="destructive" size="sm" onClick={handleStop} disabled={saving}>
                        <Square size={13} className="mr-1.5 fill-current" />
                        End Session
                      </Button>
                    )}
                    {restoredSessionId && !active && !saving && (
                      <Button variant="primary" size="sm" onClick={handleSaveRestored}>
                        <CheckCircle2 size={13} className="mr-1.5" />
                        Save Session
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-3 min-w-0">
                    <Waveform active={active && !paused} />
                    {!connected && (
                      <p className="text-xs text-slate-500 text-center lg:text-left">
                        Connecting to server… transcription starts once connected.
                      </p>
                    )}
                    {permissionError && (
                      <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-center">
                        {permissionError}
                      </p>
                    )}
                    {statusMsg && (
                      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 flex items-center gap-2 justify-center">
                        <AlertCircle size={13} />
                        {statusMsg}
                      </p>
                    )}
                  </div>
                </div>

                {!active && !saving && (
                  <div className="w-full flex flex-col gap-3 mt-4 pt-4 border-t border-white/6 light:border-slate-200/80">
                    {/* Auto dual-mic banner — shown when 2+ mics exist and patient mic not yet assigned */}
                    {audioDevices.length >= 2 && !patientDeviceId && !dualMicDismissed && (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-500/8 border border-brand-500/20 text-[11px]">
                        <Mic size={13} className="text-brand-400 shrink-0" />
                        <span className="text-slate-300 flex-1">2 mics detected — assign one as patient mic for instant accurate labels?</span>
                        <button
                          onClick={handleAutoDualMic}
                          className="text-brand-400 font-semibold hover:text-brand-300 transition-colors whitespace-nowrap"
                        >
                          Yes, auto-assign
                        </button>
                        <button
                          onClick={() => setDualMicDismissed(true)}
                          className="text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DeviceSelect
                        icon={<Mic size={10} className="text-brand-400" />}
                        label="Doctor mic"
                        devices={audioDevices}
                        value={doctorDeviceId}
                        onChange={id => { setDualMicSuggested(false); setDoctorDeviceId(id) }}
                        placeholder="Default microphone"
                      />
                      <DeviceSelect
                        icon={<User size={10} className="text-emerald-400" />}
                        label={telehealthMode ? 'Patient mic (telehealth)' : 'Patient mic (optional)'}
                        devices={audioDevices}
                        value={patientDeviceId}
                        onChange={id => { setDualMicSuggested(false); setPatientDeviceId(id) }}
                        placeholder="None (single mic)"
                      />
                    </div>
                    {dualMicSuggested && patientDeviceId && (
                      <p className="text-[10px] text-slate-500 light:text-slate-600 px-0.5">
                        Suggested pairing: headset/USB → Doctor, built-in/room → Patient. Adjust if yours differs.
                      </p>
                    )}
                    {/* Telehealth mode toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                      <div
                        onClick={() => handleTelehealthToggle(!telehealthMode)}
                        className={`relative w-8 h-4 rounded-full transition-colors ${telehealthMode ? 'bg-brand-500' : 'bg-white/10'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${telehealthMode ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[11px] text-slate-400 select-none">I'm in a telehealth call (uses separate audio tracks)</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Noisy environment banner */}
              {noisyEnvironment && active && (
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/8 border-b border-amber-500/20 text-[11px] text-amber-400">
                  <AlertCircle size={12} className="shrink-0" />
                  Noisy environment detected — speaker labels may need review
                  <button onClick={() => setNoisyEnvironment(false)} className="ml-auto text-amber-600 hover:text-amber-400">✕</button>
                </div>
              )}
              {/* Third speaker banner */}
              {thirdSpeakerDetected && !showThirdColumn && (
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/8 border-b border-amber-500/20 text-[11px] text-amber-300">
                  <User size={12} className="shrink-0" />
                  Third speaker detected
                  <input
                    value={thirdSpeakerLabel}
                    onChange={e => setThirdSpeakerLabel(e.target.value)}
                    className="mx-1 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-amber-200 text-[11px] w-24"
                    placeholder="label (e.g. Nurse)"
                  />
                  <button
                    onClick={() => setShowThirdColumn(true)}
                    className="font-semibold text-amber-300 hover:text-amber-100 transition-colors"
                  >
                    Show column
                  </button>
                  <button onClick={() => setThirdSpeakerDetected(false)} className="ml-auto text-amber-700 hover:text-amber-400">✕</button>
                </div>
              )}

              <div className={`flex-1 min-h-0 grid grid-cols-1 ${showThirdColumn ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} lg:divide-x divide-white/8 light:divide-slate-200/80`}>
                {/* Clinician column */}
                <div className="flex flex-col min-h-[min(42vh,22rem)] lg:min-h-[min(52vh,36rem)]">
                  <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/8 light:border-slate-200/80 bg-white/[0.02] light:bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-white light:text-slate-900 text-sm">Clinician</h2>
                      {processing && active && <Badge variant="default" dot className="text-[10px]">Live</Badge>}
                      {saving && <Badge variant="processing" dot className="text-[10px]">Saving</Badge>}
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">{clinicianSegments.length}</span>
                  </div>
                  {/* Settling banner — shown for the first 30s while diarization model learns voices */}
                  {isSettling && (
                    <div className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-slate-500/8 border-b border-slate-500/15 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse shrink-0" />
                      Labels settling — improves in {settlingSecsLeft}s · tap any line to correct
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                    {clinicianSegments.length === 0 && !(active && !paused && processing) ? (
                      <p className="text-slate-500 text-xs text-center py-6">
                        {active && !paused ? 'Listening…' : '—'}
                      </p>
                    ) : (
                      clinicianSegments.map(seg => (
                        <SpeakerBubble
                          key={seg.id}
                          speaker={seg.speaker}
                          text={seg.text}
                          timestamp={seg.start != null ? formatTime(seg.start) : undefined}
                          compact
                          provisional={seg.provisional}
                          editable={active}
                          onCorrect={action => handleCorrection(seg.id, action)}
                        />
                      ))
                    )}
                    {active && !paused && processing && <TypingBubble color="brand" />}
                    <div ref={clinBottomRef} className="h-px shrink-0" aria-hidden />
                  </div>
                </div>

                {/* Patient column */}
                <div className="flex flex-col min-h-[min(42vh,22rem)] lg:min-h-[min(52vh,36rem)] border-t lg:border-t-0 border-white/8 light:border-slate-200/80">
                  <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/8 light:border-slate-200/80 bg-white/[0.02] light:bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-white light:text-slate-900 text-sm">Patient</h2>
                      {patientDeviceId && (
                        <span className="text-[10px] text-emerald-400/90 font-medium">Dedicated mic</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">{patientSegments.length}</span>
                  </div>
                  {/* Mirror the settling banner so both columns stay in sync */}
                  {isSettling && (
                    <div className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-slate-500/8 border-b border-slate-500/15 text-[10px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse shrink-0" />
                      Labels settling — improves in {settlingSecsLeft}s · tap any line to correct
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                    {patientSegments.length === 0 && !(active && !paused && processing) ? (
                      <p className="text-slate-500 text-xs text-center py-6">
                        {active && !paused
                          ? 'Patient audio appears here (Speaker 2 / Patient label or second mic).'
                          : '—'}
                      </p>
                    ) : (
                      patientSegments.map(seg => (
                        <SpeakerBubble
                          key={seg.id}
                          speaker={seg.speaker}
                          text={seg.text}
                          timestamp={seg.start != null ? formatTime(seg.start) : undefined}
                          compact
                          provisional={seg.provisional}
                          editable={active}
                          onCorrect={action => handleCorrection(seg.id, action)}
                        />
                      ))
                    )}
                    {active && !paused && processing && <TypingBubble color="emerald" />}
                    <div ref={patBottomRef} className="h-px shrink-0" aria-hidden />
                  </div>
                </div>

                {/* ── Third speaker column ──────────────────────────────── */}
                {showThirdColumn && (
                  <div className="flex flex-col min-h-[min(42vh,22rem)] lg:min-h-[min(52vh,36rem)] border-t lg:border-t-0 border-white/8 light:border-slate-200/80">
                    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/8 light:border-slate-200/80 bg-amber-500/5">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-amber-300 text-sm">{thirdSpeakerLabel}</h2>
                        <span className="text-[10px] text-amber-600 font-medium">3rd speaker</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 tabular-nums">{thirdSpeakerSegments.length}</span>
                        <button
                          onClick={() => setShowThirdColumn(false)}
                          className="text-slate-600 hover:text-slate-400 text-[10px] transition-colors"
                        >
                          hide
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                      {thirdSpeakerSegments.length === 0 ? (
                        <p className="text-slate-500 text-xs text-center py-6">
                          {active && !paused ? `Waiting for ${thirdSpeakerLabel} speech…` : '—'}
                        </p>
                      ) : (
                        thirdSpeakerSegments.map(seg => (
                          <SpeakerBubble
                            key={seg.id}
                            speaker={thirdSpeakerLabel}
                            text={seg.text}
                            timestamp={seg.start != null ? formatTime(seg.start) : undefined}
                            compact
                            editable={active}
                            onCorrect={action => handleCorrection(seg.id, action)}
                          />
                        ))
                      )}
                      <div ref={thirdBottomRef} className="h-px shrink-0" aria-hidden />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {segments.length > 0 && !active && !saving && (
              <div className="flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-400 px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-colors"
                >
                  <Download size={14} />
                  Export transcript
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Clear
                </button>
              </div>
            )}

          </div>

          {/* ── Right sidebar ───────────────────────────────────────────── */}
          <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0">

            <Card variant="elevated" className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Session Info</h3>
              <div className="space-y-3">
                {[
                  { label: 'Duration',   value: formatTime(elapsed) },
                  { label: 'Segments',   value: segments.length.toString() },
                  { label: 'Speakers',   value: speakerSet.length ? speakerSet.length.toString() : '—' },
                  { label: 'Words',      value: wordCount.toString() },
                  { label: 'Transport',  value: connected ? 'WebSocket' : 'Connecting…' },
                  { label: 'Dual mic',   value: patientDeviceId ? 'Yes' : 'No' },
                  { label: 'Saved',      value: savedId ? 'Yes' : saving ? 'Processing…' : '—' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-xs font-medium text-slate-300">{item.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {hasLiveFields && <LiveFieldsPanel fields={liveFields} />}

            {/* Vocal prompts command reference */}
            {vocalSupported && (
              <Card variant="elevated" className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mic size={13} className="text-brand-400" />
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Vocal Prompts</h3>
                  <span className={`ml-auto h-2 w-2 rounded-full ${
                    vocalPhase === 'listening' ? 'bg-brand-400 animate-pulse' :
                    vocalPhase === 'success'   ? 'bg-emerald-400' :
                    vocalPhase === 'error'     ? 'bg-red-400' :
                                                 'bg-slate-500/70'
                  }`} />
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-500">
                  <li className="text-slate-400 font-medium pb-1 border-b border-white/6">Say "Audient" then…</li>
                  {[
                    ['start',            'Begin recording'],
                    ['stop',             'End & process'],
                    ['pause',            'Pause recording'],
                    ['resume',           'Resume recording'],
                    ['generate summary', 'Read live fields'],
                  ].map(([cmd, desc]) => (
                    <li key={cmd} className="flex justify-between gap-2">
                      <span className="font-mono text-brand-400/80">{cmd}</span>
                      <span className="text-right">{desc}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

          </div>

        </div>
      </main>
    </div>
  )
}
