import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate }       from 'react-router-dom'
import {
  Square, Clock, Download, Trash2, CheckCircle2,
  Mic, MicOff, Wifi, WifiOff, Loader2, AlertCircle,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Badge }         from '../components/ui/Badge'
import { Button }        from '../components/ui/Button'
import { Card }          from '../components/ui/Card'
import { Waveform }      from '../components/visual/Waveform'
import { RecordButton }  from '../components/visual/RecordButton'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { useVoiceCommands }  from '../hooks/useVoiceCommands'
import { useLiveSession, type Segment } from '../hooks/useLiveSession'
import { useToast }          from '../components/ui/Toaster'
import api from '../lib/api'

// ── Constants ────────────────────────────────────────────────────────────────
const POLL_MS = 2_000   // status poll interval after /complete

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Processing progress steps ─────────────────────────────────────────────────
const PROGRESS_STEPS = [
  { label: 'Saving transcript',            pct: 20 },
  { label: 'Labelling speakers…',          pct: 45 },
  { label: 'Extracting medical fields…',   pct: 70 },
  { label: 'Generating field alerts…',     pct: 90 },
  { label: 'Done',                         pct: 100 },
]

function ProcessingOverlay({ step }: { step: number }) {
  const current = PROGRESS_STEPS[Math.min(step, PROGRESS_STEPS.length - 1)]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-400/90 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-white/5 border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
        <Loader2 size={40} className="mx-auto text-brand-400 animate-spin mb-5" />
        <h2 className="text-white font-semibold text-lg mb-1">Processing Session</h2>
        <p className="text-slate-400 text-sm mb-6">{current.label}</p>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-700"
            style={{ width: `${current.pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-3">
          AI is diarizing speakers and extracting clinical fields…
        </p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function LiveSessionPage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [segments,      setSegments]      = useState<Segment[]>([])
  const [elapsed,       setElapsed]       = useState(0)
  const [processing,    setProcessing]    = useState(false)  // chunk being transcribed
  const [saving,        setSaving]        = useState(false)  // /complete called, polling
  const [progressStep,  setProgressStep]  = useState(0)      // 0-4 index into PROGRESS_STEPS
  const [savedId,       setSavedId]       = useState<string | null>(null)
  const [statusMsg,     setStatusMsg]     = useState<string | null>(null)

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedIdRef     = useRef<string | null>(null)  // for poll closure
  const elapsedRef     = useRef(0)
  const bottomRef      = useRef<HTMLDivElement>(null)
  const isSavingRef    = useRef(false)   // guard against double-save

  // Keep refs in sync
  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])

  // Auto-scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  // ── WebSocket session hook ─────────────────────────────────────────────────
  const session = useLiveSession({
    onTranscriptUpdate: useCallback((newSegs: Segment[]) => {
      setProcessing(false)
      setSegments(prev => {
        const next = [...prev, ...newSegs]
        session.setSegmentsRef(next)
        return next
      })
    }, []),  // eslint-disable-line react-hooks/exhaustive-deps

    onDiarizeUpdate: useCallback((rawSegs) => {
      // rawSegs is the full re-labeled list — map speaker labels back
      setSegments(prev => {
        let idx = 0
        return prev.map(seg => {
          if (seg.start == null || seg.end == null) return seg
          const labeled = rawSegs[idx]
          if (!labeled) return seg
          idx++
          return { ...seg, speaker: labeled.speaker || seg.speaker }
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
    permissionError, startSession, pauseSession, resumeSession, stopSession,
    getBlob, chunks,
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

  // ── Processing flag when chunks are in-flight ──────────────────────────────
  useEffect(() => {
    if (active && !paused) setProcessing(true)
  }, [segments.length])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save when recording ends ─────────────────────────────────────────
  useEffect(() => {
    if (
      !active        &&
      !recording     &&
      segments.length > 0 &&
      sessionId      &&
      !isSavingRef.current
    ) {
      isSavingRef.current = true
      saveSession(sessionId)
    }
  }, [active, recording, segments])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save session ───────────────────────────────────────────────────────────
  async function saveSession(convId: string) {
    setSaving(true)
    setProgressStep(0)

    try {
      // Step 1 visual — immediately show progress
      setProgressStep(1)

      const payload = {
        segments: segments.map(s => ({
          speaker: s.speaker,
          text:    s.text,
          start:   s.start,
          end:     s.end,
        })),
        duration: elapsedRef.current,
        language: session.detectedLanguage(),
      }

      // POST /complete — returns 202 immediately, task runs in background
      const res = await api.post(`/api/conversations/${convId}/complete`, payload)
      const convId2 = res.data.conversation_id ?? convId
      savedIdRef.current = convId2
      setSavedId(convId2)

      // Upload audio in background (non-blocking, non-critical)
      const blob = getBlob('audio/webm')
      if (blob && blob.size >= 500) {
        const form = new FormData()
        form.append('file', blob, 'session.webm')
        api.post(`/api/conversations/${convId2}/audio`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch(() => {})
      }

      // Poll /status until "complete" or "failed"
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
        const r = await api.get(`/api/conversations/${convId}/status`)
        const status = r.data?.status

        // Simulate progress steps while polling
        step = Math.min(step + 1, PROGRESS_STEPS.length - 2)
        setProgressStep(step)

        if (status === 'complete' || status === 'approved') {
          clearInterval(pollRef.current!)
          setProgressStep(PROGRESS_STEPS.length - 1)
          setSaving(false)
          toast('Session saved — opening record…', 'success')
          // Brief pause so user sees "Done" state
          setTimeout(() => navigate(`/session/${convId}`), 800)
        } else if (status === 'failed') {
          clearInterval(pollRef.current!)
          setSaving(false)
          isSavingRef.current = false
          toast('Processing failed — transcript is still visible above', 'error')
        }
      } catch {
        // Transient network error — keep polling
      }
    }, POLL_MS)
  }

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    isSavingRef.current = false
    setSavedId(null)
    setSegments([])
    setElapsed(0)
    setStatusMsg(null)
    await startSession()
    toast('Session started — recording', 'success')
  }, [startSession, toast])

  const handlePause = useCallback(() => {
    pauseSession()
    toast('Recording paused', 'info')
  }, [pauseSession, toast])

  const handleResume = useCallback(async () => {
    await resumeSession()
    toast('Recording resumed', 'info')
  }, [resumeSession, toast])

  const handleStop = useCallback(() => {
    stopSession()
    toast('Session ended — saving…', 'info')
  }, [stopSession, toast])

  const handleClear = useCallback(() => {
    setSegments([])
    setStatusMsg(null)
    setElapsed(0)
    setSavedId(null)
    isSavingRef.current = false
  }, [])

  const handleToggle = useCallback(async () => {
    if (!active) {
      await handleStart()
    } else if (!paused) {
      handlePause()
    } else {
      await handleResume()
    }
  }, [active, paused, handleStart, handlePause, handleResume])

  // ── Voice commands ─────────────────────────────────────────────────────────
  const { listening, lastCommand, supported: voiceSupported, startListening, stopListening } =
    useVoiceCommands({
      onStart:  () => { if (!active) handleStart() },
      onStop:   () => { if (active)  handleStop()  },
      onPause:  () => { if (active && !paused) handlePause() },
      onResume: () => { if (active && paused)  handleResume() },
      onClear:  handleClear,
    })

  function toggleVoice() {
    if (listening) {
      stopListening()
      toast('Voice commands off', 'info')
    } else {
      startListening()
      toast('Voice commands on — say "start", "stop", "pause", "resume", or "clear"', 'info')
    }
  }

  const handleExport = () => {
    const text = segments.map(s => `[${s.speaker}] ${s.text}`).join('\n')
    const blob  = new Blob([text], { type: 'text/plain' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href = url; a.download = `transcript-${Date.now()}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const recordState = saving
    ? 'processing'
    : active && !paused ? 'recording'
    : active &&  paused ? 'paused'
    : 'idle'

  const speakerSet = [...new Set(segments.map(s => s.speaker))]
  const wordCount  = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      {/* Processing overlay */}
      {saving && <ProcessingOverlay step={progressStep} />}

      <main className="flex-1 overflow-hidden flex flex-col">

        {/* ── Top bar ───────────────────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Live Session</h1>
            <p className="text-xs text-slate-500 mt-0.5">WebSocket · Any language → English · AI diarization</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Session state badges */}
            {active && !paused && <Badge variant="success"    dot>Recording</Badge>}
            {active &&  paused && <Badge variant="warning"    dot>Paused</Badge>}
            {saving            && <Badge variant="processing" dot>Processing…</Badge>}
            {savedId && !saving && (
              <Badge variant="success">
                <CheckCircle2 size={11} className="mr-1" /> Saved
              </Badge>
            )}
            {!active && !savedId && segments.length > 0 && (
              <Badge variant="default">Session ended</Badge>
            )}

            {/* Timer */}
            {active && (
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <Clock size={13} />
                {formatTime(elapsed)}
              </div>
            )}

            {/* WebSocket status indicator */}
            <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Live' : 'Connecting…'}
            </div>

            {/* Voice commands toggle */}
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                title={listening ? 'Voice commands ON — click to disable' : 'Enable voice commands'}
                className={`flex items-center gap-1.5 text-xs rounded-xl px-3 py-1.5 border transition-all ${
                  listening
                    ? 'text-brand-300 bg-brand-500/15 border-brand-500/30 animate-pulse'
                    : 'text-slate-500 bg-white/4 border-white/8 hover:text-slate-300'
                }`}
              >
                {listening ? <Mic size={12} /> : <MicOff size={12} />}
                {listening ? 'Voice ON' : 'Voice'}
              </button>
            )}
          </div>
        </header>

        {/* Voice command flash */}
        {lastCommand && (
          <div className="shrink-0 flex justify-center py-2 pointer-events-none">
            <div className="flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 text-brand-200 text-sm font-medium px-4 py-2 rounded-full shadow-lg">
              <Mic size={13} />
              Command: <span className="font-bold capitalize">{lastCommand}</span>
            </div>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex gap-6 p-6">

          {/* ── Left: controls + transcript ──────────────────────────── */}
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

                {/* Errors */}
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

                {/* WebSocket not connected warning */}
                {!connected && (
                  <p className="text-xs text-slate-500 text-center">
                    Connecting to server… transcription will begin once connected.
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
                        <div className={`h-2 w-2 rounded-full ${sp.includes('2') ? 'bg-emerald-400' : 'bg-brand-400'}`} />
                        <span className="text-xs text-slate-500">{sp}</span>
                      </div>
                    ))}
                  </div>
                )}

                {segments.length > 0 && !active && !saving && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExport}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                      title="Export transcript"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={handleClear}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Clear"
                    >
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
                        Chunks sent over WebSocket → Groq Whisper → pushed back live
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

          {/* ── Right: session info ────────────────────────────────────── */}
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
                  { label: 'Saved',      value: savedId ? 'Yes ✓' : saving ? 'Processing…' : '—' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-xs font-medium text-slate-300">{item.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="flat" className="p-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Tips</h3>
              <ul className="space-y-2 text-xs text-slate-500">
                <li>· Place the mic between both speakers</li>
                <li>· Speak clearly with short pauses</li>
                <li>· Transcript appears every 5 seconds</li>
                <li>· Speakers re-labelled every 15 seconds</li>
                <li>· Session auto-saves when you end</li>
                <li>· AI extraction runs in the background</li>
                {voiceSupported && (
                  <li className="pt-1 border-t border-white/6 text-brand-400">
                    · Say "start", "stop", "pause", "resume", or "clear"
                  </li>
                )}
              </ul>
            </Card>
          </div>

        </div>
      </main>
    </div>
  )
}
