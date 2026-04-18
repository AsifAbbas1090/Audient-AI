/**
 * useLiveSession — WebSocket-based live recording hook (v3).
 *
 * Audio strategy (stop-restart cycle):
 *   Every CHUNK_MS the doctor (and optional patient) MediaRecorder is stopped,
 *   the accumulated blob is sent to the server as a complete valid WebM, and
 *   the recorder is immediately restarted on the same stream.  This avoids the
 *   "invalid media file" error that the sliding-window/timeslice approach caused:
 *   prepending an EBML header to mid-recording clusters produces timestamps that
 *   don't start at 0, so ffmpeg (Groq's backend) rejects the file.
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

// ── Types ─────────────────────────────────────────────────────────────────────
export type Segment = {
  id:      number
  speaker: string
  text:    string
  start?:  number
  end?:    number
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

type RawSegment = {
  speaker?: string
  text?:    string
  start?:   number
  end?:     number
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CHUNK_MS     = 5_000   // stop-restart cycle interval
const DIARIZE_MS   = 15_000  // diarize interval
const EXTRACT_MS   = 60_000  // incremental extraction interval

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
  onTranscriptUpdate: (newSegs: Segment[]) => void
  onDiarizeUpdate:    (allSegs: RawSegment[]) => void
  onLanguage?:        (lang: string) => void
  onError?:           (msg: string) => void
  doctorDeviceId?:    string   // optional: specific doctor microphone
  patientDeviceId?:   string   // optional: enables dual-channel patient mic
}) {
  const [connected,  setConnected]  = useState(false)
  const [sessionId,  setSessionId]  = useState<string | null>(null)
  const [active,     setActive]     = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [liveFields, setLiveFields] = useState<LiveFields>({})

  const socketRef          = useRef<Socket | null>(null)
  const sessionIdRef       = useRef<string | null>(null)
  const timeOffsetRef      = useRef(0)
  const detectedLangRef    = useRef<string>('Unknown')

  const chunkIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const patientIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const diarizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const extractIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentsRef        = useRef<Segment[]>([])

  // Guards: prevent two overlapping takeChunk() calls on the same recorder
  const drChunkBusyRef = useRef(false)
  const ptChunkBusyRef = useRef(false)

  // Two recorders: doctor (always) + patient (dual-mic only).
  // No timeslice — legacy stop-restart mode produces valid complete WebM blobs.
  const doctorRec  = useMediaRecorder({ mimeType: 'audio/webm' })
  const patientRec = useMediaRecorder({ mimeType: 'audio/webm' })

  // ── Socket connection ────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    const token  = localStorage.getItem('jwt_token')
    const socket = io(SOCKET_ORIGIN(), {
      auth:                 { token },
      // Prefer polling first so dev proxies reliably upgrade; then websocket.
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

      if (newSegs.length) {
        const maxEnd = newSegs.reduce((m, s) => Math.max(m, s.end ?? 0), 0)
        timeOffsetRef.current = Math.max(timeOffsetRef.current, maxEnd)
        opts.onTranscriptUpdate(newSegs)
      }

      if (data.language && data.language !== 'Unknown' && detectedLangRef.current === 'Unknown') {
        detectedLangRef.current = data.language
        opts.onLanguage?.(data.language)
      }
    })

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
      language:       detectedLangRef.current !== 'Unknown' ? detectedLangRef.current : undefined,
      is_final:       isFinal,
      forced_speaker: forcedSpeaker,
    })
  }, [])

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
        body:   JSON.stringify({ text }),
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

  // ── Helper: start all polling intervals ───────────────────────────────────────
  // Uses stop-restart cycle (takeChunk) — each call produces a self-contained
  // valid WebM blob that Groq Whisper can parse without timestamp issues.
  const _startIntervals = useCallback(() => {
    // Doctor chunks: stop recorder → collect blob → restart → send to Groq
    chunkIntervalRef.current = setInterval(async () => {
      if (drChunkBusyRef.current) return   // previous cycle still in progress
      drChunkBusyRef.current = true
      try {
        const blob = await doctorRec.takeChunk()
        if (blob && blob.size >= 500) sendChunk(blob)
      } finally {
        drChunkBusyRef.current = false
      }
    }, CHUNK_MS)

    // Patient chunks (dual-mic) — tagged so server skips diarization
    if (opts.patientDeviceId) {
      patientIntervalRef.current = setInterval(async () => {
        if (ptChunkBusyRef.current) return
        ptChunkBusyRef.current = true
        try {
          const blob = await patientRec.takeChunk()
          if (blob && blob.size >= 500) sendChunk(blob, false, 'Patient')
        } finally {
          ptChunkBusyRef.current = false
        }
      }, CHUNK_MS)
    }

    // Diarization (doctor audio only)
    diarizeIntervalRef.current = setInterval(() => {
      requestDiarize(segmentsRef.current)
    }, DIARIZE_MS)

    // Incremental field extraction
    extractIntervalRef.current = setInterval(runExtract, EXTRACT_MS)
  }, [sendChunk, requestDiarize, runExtract, opts.patientDeviceId, doctorRec, patientRec])

  // ── Helper: clear all polling intervals ───────────────────────────────────────
  const _clearIntervals = useCallback(() => {
    if (chunkIntervalRef.current)   clearInterval(chunkIntervalRef.current)
    if (patientIntervalRef.current) clearInterval(patientIntervalRef.current)
    if (diarizeIntervalRef.current) clearInterval(diarizeIntervalRef.current)
    if (extractIntervalRef.current) clearInterval(extractIntervalRef.current)
    chunkIntervalRef.current   = null
    patientIntervalRef.current = null
    diarizeIntervalRef.current = null
    extractIntervalRef.current = null
  }, [])

  // ── Start ─────────────────────────────────────────────────────────────────────
  const startSession = useCallback(async (overrideSessionId?: string): Promise<string | null> => {
    connect()

    // Create server-side session (DB row + audio accumulation slot),
    // unless a pre-created session ID is provided (continuation mode).
    let id: string | null = overrideSessionId ?? null
    if (!id) {
      try {
        const token   = localStorage.getItem('jwt_token')
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res  = await fetch(`${API_ROOT()}/api/session/start`, { method: 'POST', headers })
        const json = await res.json() as { session_id?: string }
        id = json.session_id ?? null
      } catch { /* session ID is optional — transcription works without it */ }
    }

    setSessionId(id)
    sessionIdRef.current    = id
    detectedLangRef.current = 'Unknown'
    timeOffsetRef.current   = 0
    setLiveFields({})
    drChunkBusyRef.current  = false
    ptChunkBusyRef.current  = false

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
    drChunkBusyRef.current = false
    ptChunkBusyRef.current = false
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

  // ── Final chunk + extract when doctor recording stops ─────────────────────────
  // Sends whatever was recorded since the last takeChunk() cycle as the final blob.
  useEffect(() => {
    if (doctorRec.recording || !doctorRec.chunks.length) return
    const finish = async () => {
      const blob = doctorRec.getBlob()
      if (blob && blob.size >= 500) await sendChunk(blob, true)
      requestDiarize(segmentsRef.current)
      await runExtract()   // final extraction pass
    }
    finish()
  }, [doctorRec.recording, doctorRec.chunks])  // eslint-disable-line react-hooks/exhaustive-deps

  // Keep segmentsRef in sync for diarize / extract calls
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
  }
}
