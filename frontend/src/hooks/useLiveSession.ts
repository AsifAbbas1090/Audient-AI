/**
 * useLiveSession — WebSocket-based live recording hook (v4).
 *
 * Audio strategy (timeslice + sliding window):
 *   MediaRecorder runs continuously with timeslice=500 ms, accumulating sub-chunks
 *   in a rolling ref buffer.  Every CHUNK_MS a window blob is assembled from the
 *   last 8 sub-chunks (= 4 s of audio) and sent to Groq Whisper.  The recorder
 *   never stops between sends — no dead gaps, no stop/restart overhead.
 *   Each window blob is [EBML header + last 8 sub-chunks], which is a complete
 *   valid WebM that ffmpeg/Groq can parse without timestamp issues.
 *
 * Dual-channel mic:
 *   If patientDeviceId is supplied, a second MediaRecorder runs on the patient
 *   mic.  Patient chunks are tagged forced_speaker="Patient" so the server
 *   assigns the label without running diarization on them.
 *
 * Incremental extraction:
 *   Every EXTRACT_MS a POST /api/extract call is made with the current
 *   transcript.  The result is merged into liveFields state for a live preview
 *   panel in the UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket }        from 'socket.io-client'
import { useMediaRecorder }  from './useMediaRecorder'

/** WS audio_chunk: only ISO-style hints — never UI strings like "English (translated)". */
function languageHintForSocket(label: string): string | undefined {
  const t = label.trim()
  if (!t || t === 'Unknown') return undefined
  if (/translat/i.test(t) || /[→]/.test(t) || /->/.test(t)) return undefined
  if (/^[a-zA-Z]{2,3}$/.test(t)) return t.toLowerCase()
  return undefined
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type Segment = {
  id:          number
  speaker:     string
  text:        string
  start?:      number
  end?:        number
  provisional?: boolean  // true while diarization model is still learning the voices (first 30s)
}

export type LiveFields = {
  Name?:            string | null
  Age?:             string | null
  Gender?:          string | null
  Disease?:         string | null
  Education?:       string | null
  EmotionalState?:  string | null
  AdditionalNotes?: string | null
  [key: string]:    unknown
}

/** Correction emitted by the LLM speaker-correction checkpoint (HTTP or WS bootstrap). */
export type LlmCorrection = {
  id:             number
  speaker:        'Doctor' | 'Patient'
  text_proofread?: string
}

/** Which raw diarization label maps to which clinical role (built up over successive passes). */
type SpeakerContext = { doctor_label: string | null; patient_label: string | null }

type RawSegment = {
  speaker?: string
  text?:    string
  start?:   number
  end?:     number
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CHUNK_MS         = 4_000   // send interval: assemble + ship a window blob every 4s
const WINDOW_SUBS      = 10      // 10 × 500ms = 5s audio per Whisper request (1s overlap with prior send)
const EXTRACT_MS       = 60_000  // incremental extraction interval
const LLM_CORRECT_MS   = 25_000  // LLM speaker-correction interval
const LLM_CORRECT_WINDOW = 30    // sliding window: max segments sent per LLM call

// Socket.IO must hit the same origin as the SPA in dev (e.g. :3000) so Vite can
// proxy /socket.io → Flask. Connecting straight to :5000 bypasses the proxy and
// often breaks the WS handshake ("Invalid frame header") behind mixed setups.
// In production, VITE_API_URL points at the real API host.
function SOCKET_ORIGIN(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }
  return (import.meta.env.VITE_API_URL as string | undefined) ?? (typeof window !== 'undefined' ? window.location.origin : '')
}

/** HTTP API base — empty string = same origin (Vite `/api` proxy in dev). */
function API_ROOT(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? ''
}

// Module-level segment ID counter (never resets mid-tab)
let _idCounter = 0

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useLiveSession(opts: {
  onTranscriptUpdate:  (newSegs: Segment[]) => void
  onDiarizeUpdate:     (allSegs: RawSegment[]) => void
  onLlmCorrectUpdate?: (corrections: LlmCorrection[]) => void
  onLanguage?:         (lang: string) => void
  onError?:            (msg: string) => void
  onChunkSent?:        () => void   // fires the moment audio is sent — use to show typing indicator
  doctorDeviceId?:     string   // optional: specific doctor microphone
  patientDeviceId?:    string   // optional: enables dual-channel patient mic
  contextSeed?:        string   // optional: last ~500 chars of parent transcript for continuation sessions
}) {
  // Read doctor specialty from cached auth profile.
  // Populated by usePreferencesUser (Sidebar) via GET /api/users/me/preferences.
  // Falls back to 'general_mbbs' if not set.
  const _authRaw = localStorage.getItem('auth')
  const _authUser = _authRaw ? (() => { try { return JSON.parse(_authRaw) as { specialty?: string } } catch { return null } })() : null
  const specialtyRef = useRef<string>(_authUser?.specialty ?? 'general_mbbs')

  const [connected,  setConnected]  = useState(false)
  const [sessionId,  setSessionId]  = useState<string | null>(null)
  const [active,     setActive]     = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [liveFields, setLiveFields] = useState<LiveFields>({})

  const socketRef          = useRef<Socket | null>(null)
  const sessionIdRef       = useRef<string | null>(null)
  const timeOffsetRef      = useRef(0)
  const detectedLangRef    = useRef<string>('Unknown')

  const chunkIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const patientIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const extractIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const llmCorrectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentsRef           = useRef<Segment[]>([])
  const speakerContextRef     = useRef<SpeakerContext | null>(null)

  // Two recorders: doctor (always) + patient (dual-mic only).
  // timeslice=500ms → continuous recording; getWindowBlob(WINDOW_SUBS) assembles each send.
  // Opus at 32kbps is optimal for speech: small chunks, high intelligibility.
  const doctorRec  = useMediaRecorder({ mimeType: 'audio/webm;codecs=opus', timeslice: 500, audioBitsPerSecond: 32_000 })
  const patientRec = useMediaRecorder({ mimeType: 'audio/webm;codecs=opus', timeslice: 500, audioBitsPerSecond: 32_000 })

  // ── Socket connection ────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    const token  = localStorage.getItem('jwt_token')
    const socket = io(SOCKET_ORIGIN(), {
      auth:  { token },
      // Vite proxies /socket.io with ws:true so WebSocket works in dev too.
      // Start with polling for the handshake then upgrade — same behaviour in dev and prod.
      transports:           ['polling', 'websocket'],
      reconnection:         true,
      reconnectionAttempts: 5,
      reconnectionDelay:    1_000,
      timeout:              10_000,
    })

    socket.on('connect', () => {
      setConnected(true)
      console.log('[WS] connected', socket.id)
    })
    socket.on('disconnect', (reason) => {
      setConnected(false)
      console.log('[WS] disconnected:', reason)
    })
    socket.on('connect_error', (err) => {
      console.warn('[WS] connect error:', err.message)
      opts.onError?.(`WebSocket: ${err.message}`)
    })

    socket.on('transcript_update', (data: { segments: RawSegment[]; language: string }) => {
      const raw     = data.segments ?? []
      const newSegs = raw
        .filter(s => (s.text ?? '').trim())
        .map(s => ({
          id:      ++_idCounter,
          speaker: s.speaker ?? 'Speaker 1',
          text:    (s.text ?? '').trim(),
          start:   (s.start ?? 0) + timeOffsetRef.current,
          end:     (s.end   ?? 0) + timeOffsetRef.current,
        }))

      // Remove segments whose text already exists in recent state.
      // Whisper re-transcribes the ~1s overlap between consecutive audio
      // windows, producing identical or near-identical trailing segments.
      // We drop any incoming segment whose normalized text matches the
      // last 5 segments or overlaps (suffix/prefix) with them.
      const recentTexts = segmentsRef.current
        .slice(-5)   // check last 5, not 3
        .map(s => s.text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' '))

      const deduped = newSegs.filter(s => {
        const norm = s.text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
        if (norm.length < 6) return false   // drop very short segments entirely
        return !recentTexts.some(r => {
          if (!r || r.length < 6) return false
          if (r === norm) return true                          // exact match
          if (r.includes(norm) || norm.includes(r)) return true  // substring
          // Overlap: tail of recent matches head of new (Whisper overlap artifact)
          const overlapLen = Math.min(20, Math.floor(norm.length * 0.6))
          const tail = r.slice(-overlapLen)
          const head = norm.slice(0, overlapLen)
          return tail.length > 8 && head.startsWith(tail.slice(-8))
        })
      })

      if (deduped.length) {
        const maxEnd = deduped.reduce((m, s) => Math.max(m, s.end ?? 0), 0)
        timeOffsetRef.current = Math.max(timeOffsetRef.current, maxEnd)
        opts.onTranscriptUpdate(deduped)
      }

      if (data.language && data.language !== 'Unknown' && detectedLangRef.current === 'Unknown') {
        detectedLangRef.current = data.language
        opts.onLanguage?.(data.language)
      }
    })

    socket.on(
      'transcript_role_confirmed',
      (data: {
        corrections: LlmCorrection[]
        context:     SpeakerContext
        bootstrap:   boolean
      }) => {
        if (data.context) speakerContextRef.current = data.context
        if (data.corrections?.length) {
          opts.onLlmCorrectUpdate?.(data.corrections)
        }
      },
    )

    socket.on('diarize_update', (data: { segments: RawSegment[] }) => {
      if (data.segments?.length) opts.onDiarizeUpdate(data.segments)
    })

    socket.on('session_error', (data: { error: string }) => {
      opts.onError?.(data.error ?? 'Session error')
    })

    socketRef.current = socket
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { socketRef.current?.disconnect() }
  }, [])

  // ── Send one audio blob (with optional speaker override for patient mic) ──────
  const sendChunk = useCallback(async (
    blob: Blob,
    isFinal = false,
    forcedSpeaker?: string,
  ) => {
    if (!socketRef.current?.connected || blob.size < 500) return
    const buffer = await blob.arrayBuffer()
    socketRef.current.emit('audio_chunk', {
      session_id:     sessionIdRef.current,
      audio:          buffer,
      language:       languageHintForSocket(detectedLangRef.current),
      is_final:       isFinal,
      forced_speaker: forcedSpeaker,
    })
    opts.onChunkSent?.()  // signal immediately — backend is now processing this chunk
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Diarization request ────────────────────────────────────────────────────────
  const requestDiarize = useCallback((segs: Segment[]) => {
    if (!socketRef.current?.connected || !sessionIdRef.current) return
    const withTime = segs
      .filter(s => s.start != null && s.end != null)
      .map(s => ({ start: s.start!, end: s.end!, text: s.text, speaker: s.speaker }))
    if (withTime.length < 2) return
    socketRef.current.emit('request_diarize', {
      session_id: sessionIdRef.current,
      segments:   withTime,
    })
  }, [])

  // ── Incremental extraction ─────────────────────────────────────────────────────
  const runExtract = useCallback(async () => {
    if (segmentsRef.current.length < 3) return
    const text = segmentsRef.current.map(s => `[${s.speaker}] ${s.text}`).join('\n')
    try {
      const token   = localStorage.getItem('jwt_token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_ROOT()}/api/extract`, {
        method: 'POST',
        headers,
        body:   JSON.stringify({
          text,
          specialty: specialtyRef.current,
          ...(sessionIdRef.current ? { session_id: sessionIdRef.current } : {}),
        }),
      })
      if (!res.ok) return
      const data = await res.json() as Record<string, unknown>
      if (data && !data.error && !data.skipped) {
        setLiveFields(prev => ({ ...prev, ...data }))
      }
    } catch {
      // Non-critical — never disrupt the live session for a failed extraction
    }
  }, [])

  // ── LLM speaker-correction checkpoint ─────────────────────────────────────────
  const requestLlmCorrect = useCallback(async () => {
    const segs = segmentsRef.current
    if (!sessionIdRef.current || segs.length < 4) return   // need enough context

    // Sliding window — only the most recent segments, not the full growing list
    const window = segs.slice(-LLM_CORRECT_WINDOW).map(s => ({
      id:      s.id,
      speaker: s.speaker,
      text:    s.text,
    }))

    try {
      const token   = localStorage.getItem('jwt_token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`${API_ROOT()}/api/session/llm_correct`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          segments:   window,
          context:    speakerContextRef.current,
          specialty:  specialtyRef.current,
          language:
            detectedLangRef.current !== 'Unknown'
              ? detectedLangRef.current
              : null,
        }),
      })
      if (!res.ok) return
      const data = await res.json() as {
        corrections?: LlmCorrection[]
        context?:     SpeakerContext
        skipped?:     boolean
        error?:       string
      }
      if (data.skipped || data.error || !data.corrections?.length) return

      // Persist updated context for the next call
      if (data.context) speakerContextRef.current = data.context

      opts.onLlmCorrectUpdate?.(data.corrections)
    } catch {
      // Non-critical — a failed correction pass is silently ignored
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helper: start all polling intervals ───────────────────────────────────────
  // Timeslice mode: getWindowBlob() is synchronous — no async, no busy guards needed.
  const _startIntervals = useCallback(() => {
    // Doctor chunks: assemble last WINDOW_SUBS sub-chunks (4s) and ship to Groq
    chunkIntervalRef.current = setInterval(() => {
      const blob = doctorRec.getWindowBlob(WINDOW_SUBS)
      if (blob && blob.size >= 500) sendChunk(blob)
    }, CHUNK_MS)

    // Patient chunks (dual-mic) — forced_speaker tag means server skips diarization
    if (opts.patientDeviceId) {
      patientIntervalRef.current = setInterval(() => {
        const blob = patientRec.getWindowBlob(WINDOW_SUBS)
        if (blob && blob.size >= 500) sendChunk(blob, false, 'Patient')
      }, CHUNK_MS)
    }

    // Incremental field extraction
    extractIntervalRef.current = setInterval(runExtract, EXTRACT_MS)

    // LLM speaker-correction checkpoint — short warm-up (5s) so the first
    // polling pass aligns with the 3-chunk WS bootstrap (~12s); later passes
    // every LLM_CORRECT_MS (25s) with rolling context.
    setTimeout(() => {
      if (llmCorrectIntervalRef.current !== null) return  // already cleared (session ended)
      requestLlmCorrect()  // immediate first run after warm-up
      llmCorrectIntervalRef.current = setInterval(requestLlmCorrect, LLM_CORRECT_MS)
    }, 5_000)
  }, [sendChunk, runExtract, requestLlmCorrect, opts.patientDeviceId, doctorRec, patientRec])

  // ── Helper: clear all polling intervals ───────────────────────────────────────
  const _clearIntervals = useCallback(() => {
    if (chunkIntervalRef.current)      clearInterval(chunkIntervalRef.current)
    if (patientIntervalRef.current)    clearInterval(patientIntervalRef.current)
    if (extractIntervalRef.current)    clearInterval(extractIntervalRef.current)
    if (llmCorrectIntervalRef.current) clearInterval(llmCorrectIntervalRef.current)
    chunkIntervalRef.current      = null
    patientIntervalRef.current    = null
    extractIntervalRef.current    = null
    llmCorrectIntervalRef.current = null
  }, [])

  // ── Start ─────────────────────────────────────────────────────────────────────
  const startSession = useCallback(async (overrideSessionId?: string): Promise<string | null> => {
    connect()

    // Register the session with the backend (creates DB row + audio accumulation slot).
    // For continuation sessions, pass the pre-created ID and context_seed so the
    // backend pre-loads the Whisper rolling prompt before the first chunk arrives.
    // Register the session with the backend (creates DB row + audio accumulation slot).
    // For continuation sessions, pass the pre-created ID and context_seed so the
    // backend pre-loads the Whisper rolling prompt before the first chunk arrives.
    let id: string | null = overrideSessionId ?? null
    try {
      const token   = localStorage.getItem('jwt_token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const body: Record<string, string> = {}
      if (id) body.session_id = id
      if (opts.contextSeed) body.context_seed = opts.contextSeed
      body.specialty = specialtyRef.current
      const res  = await fetch(`${API_ROOT()}/api/session/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const json = await res.json() as { session_id?: string }
      id = json.session_id ?? id
    } catch { /* session ID is optional — transcription works without it */ }

    setSessionId(id)
    sessionIdRef.current    = id
    detectedLangRef.current = 'Unknown'
    timeOffsetRef.current   = 0
    speakerContextRef.current = null   // fresh session — reset accumulated speaker context
    setLiveFields({})

    if (id) {
      setTimeout(() => {
        socketRef.current?.emit('join_session', { session_id: id })
      }, 200)
    }

    // Start doctor recorder (always)
    doctorRec.reset()
    await doctorRec.start(opts.doctorDeviceId)

    // Start patient recorder (dual-mic only)
    if (opts.patientDeviceId) {
      patientRec.reset()
      await patientRec.start(opts.patientDeviceId)
    }

    setActive(true)
    setPaused(false)
    _startIntervals()

    return id
  }, [connect, doctorRec, patientRec, opts.doctorDeviceId, opts.patientDeviceId, _startIntervals])

  // ── Pause ─────────────────────────────────────────────────────────────────────
  const pauseSession = useCallback(() => {
    _clearIntervals()
    doctorRec.stop()
    if (opts.patientDeviceId) patientRec.stop()
    setPaused(true)
  }, [_clearIntervals, doctorRec, patientRec, opts.patientDeviceId])

  // ── Resume ─────────────────────────────────────────────────────────────────────
  const resumeSession = useCallback(async () => {
    doctorRec.reset()
    await doctorRec.start(opts.doctorDeviceId)
    if (opts.patientDeviceId) {
      patientRec.reset()
      await patientRec.start(opts.patientDeviceId)
    }
    setPaused(false)
    _startIntervals()
  }, [doctorRec, patientRec, opts.doctorDeviceId, opts.patientDeviceId, _startIntervals])

  // ── Stop ──────────────────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    _clearIntervals()
    doctorRec.stop()
    if (opts.patientDeviceId) patientRec.stop()
    setActive(false)
    setPaused(false)
  }, [_clearIntervals, doctorRec, patientRec, opts.patientDeviceId])

  // ── Flush remaining audio when the doctor recorder stops ─────────────────────
  // Fires on pause AND on full stop. `active` distinguishes them:
  //   active=true  → pause: send remaining audio, no final extract
  //   active=false → stop:  send final audio, run extract
  useEffect(() => {
    if (doctorRec.recording || !doctorRec.chunks.length) return
    const isFinalStop = !active
    const finish = async () => {
      const blob = doctorRec.getWindowBlob(WINDOW_SUBS)
      if (blob && blob.size >= 500) await sendChunk(blob, isFinalStop)
      if (isFinalStop) {
        await runExtract()
      }
    }
    finish()
  }, [doctorRec.recording, doctorRec.chunks, active])  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep segmentsRef in sync for extract / llm_correct calls
  const setSegmentsRef = useCallback((segs: Segment[]) => {
    segmentsRef.current = segs
  }, [])

  return {
    // State
    connected,
    sessionId,
    active,
    paused,
    liveFields,
    recording:       doctorRec.recording,
    permissionError: doctorRec.permissionError,
    detectedLanguage: () => detectedLangRef.current,
    // Actions
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    setSegmentsRef,
    requestDiarize,
    // Audio (doctor recorder)
    getBlob: doctorRec.getBlob,
    chunks:  doctorRec.chunks,
    // Socket access — used by LiveSessionPage to subscribe to session_ready push
    socket:  socketRef,
  }
}
