import { useState, useEffect, useRef, useCallback } from 'react'
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
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { VocalPromptsIndicator } from '../components/VocalPromptsIndicator'
import { useVocalPrompts } from '../hooks/useVocalPrompts'
import { speak, primeAudio } from '../lib/vocalAudio'
import { useLiveSession, type Segment, type LiveFields } from '../hooks/useLiveSession'
import { useToast }      from '../components/ui/Toaster'
import api from '../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_MS = 2_000

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
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
          className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 pr-7 focus:outline-none focus:border-brand-500/50 light:bg-white light:border-slate-200 light:text-slate-900"
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

  const [segments,     setSegments]     = useState<Segment[]>([])
  const [elapsed,      setElapsed]      = useState(0)
  const [processing,   setProcessing]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [savedId,      setSavedId]      = useState<string | null>(null)
  const [statusMsg,    setStatusMsg]    = useState<string | null>(null)
  const [parentTitle,  setParentTitle]  = useState<string | null>(null)

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

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedIdRef  = useRef<string | null>(null)
  const elapsedRef  = useRef(0)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const isSavingRef = useRef(false)

  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [segments])

  useEffect(() => {
    if (!parentSessionId) return
    api.get<{ conversation: { title: string | null } }>(`/api/conversations/${parentSessionId}`)
      .then(r => setParentTitle(r.data.conversation.title))
      .catch(() => {})
  }, [parentSessionId])

  // ── Live session hook ────────────────────────────────────────────────────────
  const session = useLiveSession({
    doctorDeviceId:  doctorDeviceId  || undefined,
    patientDeviceId: patientDeviceId || undefined,

    onTranscriptUpdate: useCallback((newSegs: Segment[]) => {
      setProcessing(false)
      setSegments(prev => {
        const next = [...prev, ...newSegs]
        session.setSegmentsRef(next)
        return next
      })
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps

    onDiarizeUpdate: useCallback((rawSegs) => {
      setSegments(prev => {
        let idx = 0
        return prev.map(seg => {
          if (seg.start == null || seg.end == null) return seg
          const labeled = rawSegs[idx]
          if (!labeled) return seg
          idx++
          return { ...seg, speaker: labeled.speaker ?? seg.speaker }
        })
      })
    }, []),

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
    if (!active && !recording && segments.length > 0 && sessionId && !isSavingRef.current) {
      isSavingRef.current = true
      saveSession(sessionId)
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
    pollRef.current = setInterval(async () => {
      try {
        const r      = await api.get(`/api/conversations/${convId}/status`)
        const status = r.data?.status
        step = Math.min(step + 1, PROGRESS_STEPS.length - 2)
        setProgressStep(step)
        if (status === 'complete' || status === 'approved') {
          clearInterval(pollRef.current!)
          setProgressStep(PROGRESS_STEPS.length - 1)
          setSaving(false)
          toast('Session saved — opening record…', 'success')
          setTimeout(() => navigate(`/session/${convId}`), 800)
        } else if (status === 'failed') {
          clearInterval(pollRef.current!)
          setSaving(false)
          isSavingRef.current = false
          toast('Processing failed — transcript still visible above', 'error')
        }
      } catch { /* transient — keep polling */ }
    }, POLL_MS)
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    primeAudio()  // unlock AudioContext during this user gesture
    isSavingRef.current = false
    setSavedId(null)
    setSegments([])
    setElapsed(0)
    setStatusMsg(null)
    await startSession(continueSessionId ?? undefined)
    refreshDevices()
    toast(continueSessionId ? 'Follow-up session started' : 'Session started — recording', 'success')
  }, [startSession, continueSessionId, toast, refreshDevices])

  const handlePause  = useCallback(() => { pauseSession();           toast('Recording paused',   'info') }, [pauseSession,  toast])
  const handleResume = useCallback(async () => { await resumeSession(); toast('Recording resumed', 'info') }, [resumeSession, toast])
  const handleStop   = useCallback(() => { stopSession();             toast('Session ended — saving…', 'info') }, [stopSession,   toast])

  const handleClear = useCallback(() => {
    setSegments([]); setStatusMsg(null); setElapsed(0); setSavedId(null); isSavingRef.current = false
  }, [])

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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app-page">
      <Sidebar />
      {saving && <ProcessingOverlay step={progressStep} />}

      {/* Always-on vocal prompts indicator (bottom-right dot) */}
      <VocalPromptsIndicator
        phase={vocalPhase}
        lastCmd={vocalLastCmd}
        lastHeard={vocalLastHeard}
        supported={vocalSupported}
      />

      <main className="flex-1 overflow-hidden flex flex-col light:bg-slate-100">

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
            {!active && !savedId && segments.length > 0 && (
              <Badge variant="default">Session ended</Badge>
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

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex gap-6 p-6">

          {/* ── Left: controls + transcript ────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Controls */}
            <Card variant="elevated" className="p-6">
              <div className="flex flex-col items-center gap-5">
                <RecordButton state={recordState} onClick={handleToggle} size="lg" />
                <div className="w-full"><Waveform active={active && !paused} /></div>

                {active && (
                  <Button variant="destructive" size="sm" onClick={handleStop} disabled={saving}>
                    <Square size={13} className="mr-1.5 fill-current" />
                    End Session
                  </Button>
                )}

                {!active && !saving && (
                  <div className="w-full grid grid-cols-2 gap-3 pt-2 border-t border-white/6">
                    <DeviceSelect
                      icon={<Mic size={10} className="text-brand-400" />}
                      label="Doctor mic"
                      devices={audioDevices}
                      value={doctorDeviceId}
                      onChange={setDoctorDeviceId}
                      placeholder="Default microphone"
                    />
                    <DeviceSelect
                      icon={<User size={10} className="text-emerald-400" />}
                      label="Patient mic (optional)"
                      devices={audioDevices}
                      value={patientDeviceId}
                      onChange={setPatientDeviceId}
                      placeholder="None (single mic)"
                    />
                  </div>
                )}

                {permissionError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 w-full text-center">
                    {permissionError}
                  </p>
                )}
                {statusMsg && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 w-full text-center flex items-center gap-2 justify-center">
                    <AlertCircle size={13} />
                    {statusMsg}
                  </p>
                )}
                {!connected && (
                  <p className="text-xs text-slate-500 text-center">
                    Connecting to server… transcription begins once connected.
                  </p>
                )}
              </div>
            </Card>

            {/* Transcript */}
            <Card variant="elevated" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-white text-sm">Transcript</h2>
                  {processing && active && <Badge variant="default" dot>Live</Badge>}
                  {saving     && <Badge variant="processing" dot>Processing</Badge>}
                </div>

                {speakerSet.length > 0 && (
                  <div className="flex items-center gap-3">
                    {speakerSet.map(sp => (
                      <div key={sp} className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${sp === 'Patient' ? 'bg-emerald-400' : sp.includes('2') ? 'bg-emerald-400' : 'bg-brand-400'}`} />
                        <span className="text-xs text-slate-500">{sp}</span>
                      </div>
                    ))}
                  </div>
                )}

                {segments.length > 0 && !active && !saving && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleExport} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors" title="Export transcript">
                      <Download size={14} />
                    </button>
                    <button onClick={handleClear} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Clear">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {segments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <p className="text-slate-400 text-sm">
                      {active && !paused
                        ? 'Listening… transcript appears every 5 seconds'
                        : 'Start a session to begin transcribing'}
                    </p>
                    {active && !paused && (
                      <p className="text-xs text-slate-600 mt-2">
                        Overlapping 6s windows → Groq Whisper → pushed back live
                      </p>
                    )}
                  </div>
                ) : (
                  segments.map(seg => (
                    <SpeakerBubble
                      key={seg.id}
                      speaker={seg.speaker}
                      text={seg.text}
                      timestamp={seg.start != null ? formatTime(seg.start) : undefined}
                    />
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </Card>
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
