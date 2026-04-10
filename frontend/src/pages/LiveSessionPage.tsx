import { Sidebar } from '../components/ui/Sidebar'
import { Button } from '../components/ui/Button'
import { Waveform } from '../components/visual/Waveform'
import { Mic, Pause, Square, Languages, Flag, Star } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import axios from 'axios'

const CHUNK_INTERVAL_MS = 3000
const DIARIZE_POLL_MS = 12000
const apiBase = () => import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`

type TranscriptSegment = { id: number; speaker: string; text: string; start?: number; end?: number }

async function sendChunkForTranscribe(blob: Blob, sessionId?: string | null): Promise<{ segments?: { speaker: string; text: string; start?: number; end?: number }[]; text?: string; error?: string; diarization_skipped?: string } | null> {
  if (blob.size < 500) return null
  const form = new FormData()
  form.append('file', blob, 'speech.webm')
  form.append('translate', 'true')
  form.append('diarize', 'true')
  if (sessionId) form.append('session_id', sessionId)
  const res = await axios.post(`${apiBase()}/api/transcribe`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

function appendSegments(
  prev: TranscriptSegment[],
  data: { segments?: { speaker: string; text: string; start?: number; end?: number }[]; text?: string; error?: string } | null,
  idBase: number,
  timeOffset: number = 0
): TranscriptSegment[] {
  if (!data) return prev
  if (data.segments?.length) {
    const withText = data.segments.filter((s) => (s.text || '').trim())
    if (!withText.length && data.error) return prev
    return [
      ...prev,
      ...withText.map((s, i) => ({
        id: idBase + i + Math.random(),
        speaker: s.speaker,
        text: (s.text || '').trim(),
        start: (s.start ?? 0) + timeOffset,
        end: (s.end ?? 0) + timeOffset,
      })),
    ]
  }
  if (data.text?.trim()) {
    return [...prev, { id: idBase + Math.random(), speaker: 'Speaker 1', text: data.text, start: timeOffset, end: timeOffset }]
  }
  return prev
}

export default function LiveSessionPage() {
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([])
  const [processing, setProcessing] = useState(false)
  const [diarizeError, setDiarizeError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const diarizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptsRef = useRef<TranscriptSegment[]>([])
  transcriptsRef.current = transcripts
  // Session-relative time: each chunk's segments are 0..3s; we add this so diarize sees full-session timestamps
  const sessionTimeOffsetRef = useRef(0)

  const { recording, start, stop, reset, getBlob, chunks, permissionError, takeChunk } = useMediaRecorder({ mimeType: 'audio/webm' })

  // Runtime: take a chunk immediately, then every CHUNK_INTERVAL_MS, and transcribe (session_id sends to session for full-session diarization)
  useEffect(() => {
    if (!active || paused || !recording) return

    const processChunk = async () => {
      const blob = await takeChunk()
      if (!blob) return
      setProcessing(true)
      setDiarizeError(null)
      try {
        const data = await sendChunkForTranscribe(blob, sessionId)
        if (data?.error) setDiarizeError(data.error)
        else if (data?.diarization_skipped) setDiarizeError(data.diarization_skipped)
        const offset = sessionId ? sessionTimeOffsetRef.current : 0
        setTranscripts((prev) => {
          const next = appendSegments(prev, data, Date.now(), offset)
          if (sessionId && data?.segments?.length) {
            const added = next.slice(prev.length)
            const maxEnd = added.reduce((m, s) => Math.max(m, s.end ?? 0), 0)
            sessionTimeOffsetRef.current = maxEnd
          }
          return next
        })
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Transcription failed'
        setDiarizeError(msg)
        console.error('Transcription failed', err)
      } finally {
        setProcessing(false)
      }
    }

    processChunk()
    intervalRef.current = setInterval(processChunk, CHUNK_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [active, paused, recording, sessionId])

  // Session-level diarization: every DIARIZE_POLL_MS run pyannote on full session audio and update speaker labels
  useEffect(() => {
    if (!active || !sessionId) return
    const pollDiarize = async () => {
      const current = transcriptsRef.current
      const segmentsWithTime = current.filter((t) => t.start != null && t.end != null).map((t) => ({ start: t.start!, end: t.end!, text: t.text }))
      if (segmentsWithTime.length === 0) return
      try {
        const res = await axios.post(`${apiBase()}/api/session/diarize`, { session_id: sessionId, segments: segmentsWithTime })
        const labeled = res.data?.segments as { start: number; end: number; text: string; speaker: string }[] | undefined
        const debug = res.data?.debug as { session_duration_sec?: number; num_tracks?: number; speaker_counts?: Record<string, number> } | undefined
        if (debug) console.log('[session/diarize]', debug)
        if (!labeled?.length) return
        setTranscripts((prev) => {
          const withTime = prev.filter((t) => t.start != null && t.end != null)
          if (withTime.length === 0) return prev
          let idx = 0
          return prev.map((t) => {
            if (t.start == null || t.end == null) return t
            const speaker = labeled[idx]?.speaker ?? t.speaker
            idx++
            return { ...t, speaker }
          })
        })
      } catch (e) {
        console.error('Session diarize poll failed', e)
      }
    }
    diarizeIntervalRef.current = setInterval(pollDiarize, DIARIZE_POLL_MS)
    pollDiarize()
    return () => {
      if (diarizeIntervalRef.current) clearInterval(diarizeIntervalRef.current)
      diarizeIntervalRef.current = null
    }
  }, [active, sessionId])

  // Final chunk when user stops session
  useEffect(() => {
    if (!recording && chunks.length > 0) {
      const processAudio = async () => {
        setProcessing(true)
        const blob = getBlob('audio/webm')
        if (blob && blob.size >= 500) {
          try {
            const data = await sendChunkForTranscribe(blob, sessionId)
            if (data?.error) setDiarizeError(data.error)
            const offset = sessionId ? sessionTimeOffsetRef.current : 0
            setTranscripts((prev) => {
              const next = appendSegments(prev, data, Date.now(), offset)
              if (sessionId && data?.segments?.length) {
                const added = next.slice(prev.length)
                const maxEnd = added.reduce((m, s) => Math.max(m, s.end ?? 0), 0)
                sessionTimeOffsetRef.current = maxEnd
              }
              return next
            })
          } catch (err) {
            console.error('Final chunk transcription failed', err)
          }
        }
        setProcessing(false)
      }
      processAudio()
    }
  }, [recording, chunks, sessionId])

  const toggle = async () => {
    if (!active) {
      // Start Session: create server-side session for full-audio diarization
      try {
        const res = await axios.post(`${apiBase()}/api/session/start`)
        setSessionId(res.data?.session_id ?? null)
        sessionTimeOffsetRef.current = 0
      } catch (e) {
        console.error('Session start failed', e)
      }
      setActive(true)
      setPaused(false)
      reset()
      start()
    }
    else if (!paused) {
      // Pause Session (Stop recording to transcribe current chunk)
      setPaused(true)
      stop()
    }
    else {
      // Resume Session
      setPaused(false)
      reset()
      start()
    }
  }

  const handleStop = () => {
    setActive(false)
    setPaused(false)
    setSessionId(null)
    stop()
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">Two-Person Live Session</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">One mic · Any language → English · Offline</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary"><Languages size={16} className="mr-2" /> Translate</Button>
                  <Button variant="secondary"><Flag size={16} className="mr-2" /> Mark</Button>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center">
                <div className={`h-24 w-24 rounded-full flex items-center justify-center shadow-soft ${active && !paused ? 'bg-brand-600 text-white ring-4 ring-brand-400/40 animate-pulse' : 'bg-white dark:bg-slate-800'}`}>
                  {!active ? <Mic /> : paused ? <Pause /> : <Mic />}
                </div>
                <div className="mt-3 flex gap-3">
                  <Button onClick={toggle} glow>{!active ? 'Start' : paused ? 'Resume' : 'Pause'}</Button>
                  <Button variant="secondary" onClick={handleStop}><Square className="mr-2" size={14} /> Stop</Button>
                </div>
                {permissionError && <div className="text-red-500 text-xs mt-2">{permissionError}</div>}
                {diarizeError && <div className="text-amber-600 dark:text-amber-400 text-xs mt-2">{diarizeError}</div>}
              </div>

              <div className="mt-8">
                <Waveform active={active && !paused} />
              </div>

              <div className="mt-8 space-y-3 relative min-h-[200px]">
                {transcripts.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-10">
                    {active && !paused ? 'Listening… transcription every 15s (any language → English)' : 'Ready — start for two-person conversation'}
                  </div>
                )}
                <div className="space-y-2">
                  {transcripts.map((t) => (
                    <div
                      key={t.id}
                      className={`flex gap-2 items-start text-sm rounded-xl px-3 py-2 ${
                        t.speaker === 'Speaker 1'
                          ? 'bg-brand-50 dark:bg-brand-950/30 border-l-4 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800/50 border-l-4 border-slate-400 dark:border-slate-500'
                      }`}
                    >
                      <span className={`font-semibold shrink-0 ${t.speaker === 'Speaker 1' ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {t.speaker}:
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{t.text}</span>
                    </div>
                  ))}
                </div>
                {processing && (
                  <div className="text-sm text-slate-400 italic">Processing audio...</div>
                )}

              </div>
            </div>
          </section>
          <aside>
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Summary</h2>
                <Star size={16} className="text-brand-500" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Essence Summary: Real-time insights will appear here as the conversation unfolds.</p>
              <div className="mt-4">
                <div className="font-medium">Decisions</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  <li>—</li>
                </ul>
              </div>
              <div className="mt-4">
                <div className="font-medium">Action Items</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  <li>—</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}


