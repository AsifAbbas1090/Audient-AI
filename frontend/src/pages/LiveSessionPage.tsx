import { useState, useEffect, useRef } from 'react'
import { Square, Clock, WifiOff, Download, Trash2, Save, CheckCircle2 } from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Badge }         from '../components/ui/Badge'
import { Button }        from '../components/ui/Button'
import { Card }          from '../components/ui/Card'
import { Waveform }      from '../components/visual/Waveform'
import { RecordButton }  from '../components/visual/RecordButton'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { useToast }         from '../components/ui/Toaster'
import api from '../lib/api'

// ── Constants ────────────────────────────────────────────────
const CHUNK_INTERVAL_MS = 3000
const DIARIZE_POLL_MS   = 12000

// ── Types ────────────────────────────────────────────────────
type Segment = {
  id:       number
  speaker:  string
  text:     string
  start?:   number
  end?:     number
}

type APIData = {
  segments?: { speaker: string; text: string; start?: number; end?: number }[]
  text?:     string
  error?:    string
  diarization_skipped?: string
} | null

// ── Helpers ──────────────────────────────────────────────────
async function sendChunk(blob: Blob, sessionId?: string | null): Promise<APIData> {
  if (blob.size < 500) return null
  const form = new FormData()
  form.append('file', blob, 'speech.webm')
  form.append('translate', 'true')
  form.append('diarize',   'true')
  if (sessionId) form.append('session_id', sessionId)
  const res = await api.post('/api/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

function appendSegments(
  prev:       Segment[],
  data:       APIData,
  idBase:     number,
  timeOffset: number = 0,
): Segment[] {
  if (!data) return prev
  if (data.segments?.length) {
    const withText = data.segments.filter(s => (s.text || '').trim())
    if (!withText.length) return prev
    return [
      ...prev,
      ...withText.map((s, i) => ({
        id:      idBase + i + Math.random(),
        speaker: s.speaker,
        text:    (s.text || '').trim(),
        start:   (s.start ?? 0) + timeOffset,
        end:     (s.end   ?? 0) + timeOffset,
      })),
    ]
  }
  if (data.text?.trim()) {
    return [...prev, { id: idBase + Math.random(), speaker: 'Speaker 1', text: data.text, start: timeOffset, end: timeOffset }]
  }
  return prev
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Page ─────────────────────────────────────────────────────
export default function LiveSessionPage() {
  const [active,      setActive]      = useState(false)
  const [paused,      setPaused]      = useState(false)
  const [sessionId,   setSessionId]   = useState<string | null>(null)
  const [segments,    setSegments]    = useState<Segment[]>([])
  const [processing,  setProcessing]  = useState(false)
  const [statusMsg,   setStatusMsg]   = useState<string | null>(null)
  const [elapsed,     setElapsed]     = useState(0)
  const [isSaving,    setIsSaving]    = useState(false)
  const [savedId,     setSavedId]     = useState<string | null>(null)

  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const diarizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentsRef        = useRef<Segment[]>([])
  const timeOffsetRef      = useRef(0)
  const bottomRef          = useRef<HTMLDivElement>(null)
  // Keep session ID available after active is set to false (for save trigger)
  const pendingSessionIdRef = useRef<string | null>(null)
  const savedRef            = useRef(false)
  const elapsedRef          = useRef(0)

  segmentsRef.current = segments

  const toast = useToast()

  const { recording, start, stop, reset, getBlob, chunks, permissionError, takeChunk } =
    useMediaRecorder({ mimeType: 'audio/webm' })

  // Keep elapsedRef in sync for save
  useEffect(() => { elapsedRef.current = elapsed }, [elapsed])

  // Auto-scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  // Elapsed timer
  useEffect(() => {
    if (active && !paused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [active, paused])

  // Chunk → transcribe loop
  useEffect(() => {
    if (!active || paused || !recording) return

    const processChunk = async () => {
      const blob = await takeChunk()
      if (!blob) return
      setProcessing(true)
      setStatusMsg(null)
      try {
        const data = await sendChunk(blob, sessionId)
        if (data?.error) setStatusMsg(data.error)
        const offset = sessionId ? timeOffsetRef.current : 0
        setSegments(prev => {
          const next = appendSegments(prev, data, Date.now(), offset)
          if (sessionId && data?.segments?.length) {
            const added  = next.slice(prev.length)
            const maxEnd = added.reduce((m, s) => Math.max(m, s.end ?? 0), 0)
            timeOffsetRef.current = maxEnd
          }
          return next
        })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Transcription failed'
        setStatusMsg(msg)
      } finally {
        setProcessing(false)
      }
    }

    processChunk()
    intervalRef.current = setInterval(processChunk, CHUNK_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [active, paused, recording, sessionId])

  // Full-session diarization poll
  useEffect(() => {
    if (!active || !sessionId) return
    const pollDiarize = async () => {
      const current  = segmentsRef.current
      const withTime = current.filter(t => t.start != null && t.end != null)
        .map(t => ({ start: t.start!, end: t.end!, text: t.text }))
      if (!withTime.length) return
      try {
        const res     = await api.post('/api/session/diarize', { session_id: sessionId, segments: withTime })
        const labeled = res.data?.segments as { start: number; end: number; text: string; speaker: string }[] | undefined
        if (!labeled?.length) return
        setSegments(prev => {
          let idx = 0
          return prev.map(t => {
            if (t.start == null || t.end == null) return t
            const speaker = labeled[idx]?.speaker ?? t.speaker
            idx++
            return { ...t, speaker }
          })
        })
      } catch { /* silent */ }
    }
    diarizeIntervalRef.current = setInterval(pollDiarize, DIARIZE_POLL_MS)
    pollDiarize()
    return () => { if (diarizeIntervalRef.current) clearInterval(diarizeIntervalRef.current) }
  }, [active, sessionId])

  // Final chunk when recording stops
  useEffect(() => {
    if (recording || !chunks.length) return
    const processAudio = async () => {
      setProcessing(true)
      const blob = getBlob('audio/webm')
      if (blob && blob.size >= 500) {
        try {
          const data   = await sendChunk(blob, pendingSessionIdRef.current)
          const offset = pendingSessionIdRef.current ? timeOffsetRef.current : 0
          setSegments(prev => appendSegments(prev, data, Date.now(), offset))
        } catch { /* silent */ }
      }
      setProcessing(false)
    }
    processAudio()
  }, [recording, chunks])

  // ── Auto-save after session ends and final chunk is processed ────────────
  useEffect(() => {
    const pendingId = pendingSessionIdRef.current
    if (
      !active           &&   // session ended
      !recording        &&   // recorder stopped
      !processing       &&   // final chunk done
      segments.length > 0 && // have something to save
      pendingId         &&   // have a session to save to
      !savedRef.current      // not already saved
    ) {
      savedRef.current = true
      saveSession(pendingId)
    }
  }, [active, recording, processing, segments])

  async function saveSession(convId: string) {
    setIsSaving(true)
    try {
      const payload = {
        segments: segments.map(s => ({
          speaker: s.speaker,
          text:    s.text,
          start:   s.start,
          end:     s.end,
        })),
        extraction: null,          // live session has no extraction
        duration:   elapsedRef.current,
        language:   'Unknown',
      }
      const res = await api.post(`/api/conversations/${convId}/complete`, payload)
      setSavedId(res.data.conversation?.id ?? convId)
      toast('Session saved to your history', 'success')
    } catch {
      toast('Could not save session — transcript is still visible above', 'error')
    } finally {
      setIsSaving(false)
      pendingSessionIdRef.current = null
    }
  }

  // ── Actions ──────────────────────────────────────────────────
  const toggle = async () => {
    if (!active) {
      savedRef.current = false
      setSavedId(null)
      try {
        const res = await api.post('/api/session/start')
        const id  = res.data?.session_id ?? null
        setSessionId(id)
        pendingSessionIdRef.current = id
        timeOffsetRef.current = 0
        setElapsed(0)
      } catch { /* still works without session_id */ }
      setActive(true)
      setPaused(false)
      reset()
      start()
      toast('Session started — recording', 'success')
    } else if (!paused) {
      setPaused(true)
      stop()
      toast('Recording paused', 'info')
    } else {
      setPaused(false)
      reset()
      start()
      toast('Recording resumed', 'info')
    }
  }

  const handleStop = () => {
    setActive(false)
    setPaused(false)
    setSessionId(null)
    // pendingSessionIdRef keeps the ID for the save trigger
    stop()
    toast('Session ended — saving…', 'info')
  }

  const handleClear = () => {
    setSegments([])
    setStatusMsg(null)
    setElapsed(0)
    setSavedId(null)
    savedRef.current = false
    pendingSessionIdRef.current = null
  }

  const handleExport = () => {
    const text = segments.map(s => `[${s.speaker}] ${s.text}`).join('\n')
    const blob  = new Blob([text], { type: 'text/plain' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href      = url
    a.download  = `transcript-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived state ────────────────────────────────────────────
  const recordState = processing && !active
    ? 'processing'
    : active && !paused
    ? 'recording'
    : active && paused
    ? 'paused'
    : 'idle'

  const speakerSet = [...new Set(segments.map(s => s.speaker))]

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 overflow-hidden flex flex-col">

        {/* ── Top bar ──────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Live Session</h1>
            <p className="text-xs text-slate-500 mt-0.5">One mic · Any language → English · Fully offline</p>
          </div>

          <div className="flex items-center gap-3">
            {active && !paused && <Badge variant="success" dot>Recording</Badge>}
            {active && paused  && <Badge variant="warning" dot>Paused</Badge>}
            {isSaving          && <Badge variant="processing" dot>Saving…</Badge>}
            {savedId && !isSaving && (
              <Badge variant="success">
                <CheckCircle2 size={11} className="mr-1" /> Saved
              </Badge>
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

            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <WifiOff size={12} />
              Offline
            </div>
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex gap-0 lg:gap-6 p-6">

          {/* ── Left: controls + transcript ──────────────── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Controls */}
            <Card variant="elevated" className="p-6">
              <div className="flex flex-col items-center gap-6">
                <RecordButton state={recordState} onClick={toggle} size="lg" />
                <div className="w-full"><Waveform active={active && !paused} /></div>

                {active && (
                  <Button variant="destructive" size="sm" onClick={handleStop}>
                    <Square size={13} className="mr-1.5 fill-current" />
                    End Session
                  </Button>
                )}

                {permissionError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 w-full text-center">
                    {permissionError}
                  </p>
                )}
                {statusMsg && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 w-full text-center">
                    {statusMsg}
                  </p>
                )}
              </div>
            </Card>

            {/* Transcript */}
            <Card variant="elevated" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-white text-sm">Transcript</h2>
                  {processing && <Badge variant="default" dot>Processing</Badge>}
                  {isSaving   && <Badge variant="processing" dot>Saving…</Badge>}
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

                {segments.length > 0 && !active && (
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
                        ? 'Listening… transcription appears every few seconds'
                        : 'Start a session to begin transcribing'}
                    </p>
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

          {/* ── Right: session info ───────────────────────── */}
          <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0">
            <Card variant="elevated" className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Session Info</h3>
              <div className="space-y-3">
                {[
                  { label: 'Duration',  value: formatTime(elapsed) },
                  { label: 'Segments',  value: segments.length.toString() },
                  { label: 'Speakers',  value: speakerSet.length ? speakerSet.length.toString() : '—' },
                  { label: 'Saved',     value: savedId ? 'Yes ✓' : isSaving ? 'Saving…' : '—' },
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
                <li>· Transcription runs every 3 seconds</li>
                <li>· Session auto-saves when you end</li>
                <li>· Export available after session ends</li>
              </ul>
            </Card>

            {segments.length > 0 && (
              <Card variant="flat" className="p-4">
                <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Word Count</h3>
                <p className="text-2xl font-bold text-white">
                  {segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">words transcribed</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
