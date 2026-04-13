/**
 * useLiveSession — WebSocket-based live recording hook.
 *
 * Replaces the HTTP-polling chunk loop in LiveSessionPage.
 *
 * What changed vs the old approach:
 *   OLD: POST /api/transcribe every 3s  →  wait for HTTP response  →  append text
 *   NEW: emit 'audio_chunk' over socket →  server pushes 'transcript_update' back
 *
 * Why this is faster:
 *   - No TCP handshake overhead per chunk (persistent connection)
 *   - Server pushes the result the moment Groq responds — no polling delay
 *   - Diarization updates also pushed as server events ('diarize_update')
 *   - Reconnection is automatic via socket.io-client's built-in retry logic
 *
 * Fallback:
 *   If the WebSocket connection fails (e.g. a corporate proxy blocks upgrade),
 *   socket.io-client falls back to long-polling automatically — the API calls
 *   still succeed, just with slightly higher latency.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket }         from 'socket.io-client'
import { useMediaRecorder }   from './useMediaRecorder'

// ── Types ────────────────────────────────────────────────────────────────────
export type Segment = {
  id:       number
  speaker:  string
  text:     string
  start?:   number
  end?:     number
}

type RawSegment = {
  speaker?: string
  text?:    string
  start?:   number
  end?:     number
}

// ── Constants ────────────────────────────────────────────────────────────────
// 5 s chunks give Whisper more audio context → better word boundary detection
// and fewer split-word errors than the previous 3 s interval.
const CHUNK_MS      = 5_000
// Re-run diarization every 15 s (Groq LLM call — not free to run constantly)
const DIARIZE_MS    = 15_000

const API_BASE = () =>
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5000'

// ── Segment ID counter (module-level, never resets mid-session) ──────────────
let _idCounter = 0

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useLiveSession(opts: {
  onTranscriptUpdate: (newSegs: Segment[]) => void
  onDiarizeUpdate:    (allSegs: RawSegment[]) => void
  onLanguage?:        (lang: string) => void
  onError?:           (msg: string) => void
}) {
  const [connected,  setConnected]  = useState(false)
  const [sessionId,  setSessionId]  = useState<string | null>(null)
  const [active,     setActive]     = useState(false)
  const [paused,     setPaused]     = useState(false)

  const socketRef         = useRef<Socket | null>(null)
  const sessionIdRef      = useRef<string | null>(null)
  const timeOffsetRef     = useRef(0)
  const detectedLangRef   = useRef<string>('Unknown')
  const chunkIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const diarizeIntervalRef= useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentsRef       = useRef<Segment[]>([])   // mirror of state — for diarize call

  const {
    recording, start, stop, reset, getBlob, chunks, permissionError, takeChunk,
  } = useMediaRecorder({ mimeType: 'audio/webm' })

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    const token = localStorage.getItem('token')
    const socket = io(API_BASE(), {
      auth:         { token },
      transports:   ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1_000,
      timeout:      10_000,
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
      const raw = data.segments || []
      const newSegs: Segment[] = raw
        .filter(s => (s.text || '').trim())
        .map(s => ({
          id:      ++_idCounter,
          speaker: s.speaker || 'Speaker 1',
          text:    (s.text || '').trim(),
          start:   (s.start ?? 0) + timeOffsetRef.current,
          end:     (s.end   ?? 0) + timeOffsetRef.current,
        }))

      if (newSegs.length) {
        // Advance the time offset by the furthest end timestamp
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
      if (data.segments?.length) {
        opts.onDiarizeUpdate(data.segments)
      }
    })

    socket.on('session_error', (data: { error: string }) => {
      opts.onError?.(data.error || 'Session error')
    })

    socketRef.current = socket
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Disconnect on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  // ── Send a single audio blob as binary over the socket ────────────────────
  const sendChunk = useCallback(async (blob: Blob, isFinal = false) => {
    if (!socketRef.current?.connected || blob.size < 500) return
    const buffer = await blob.arrayBuffer()
    socketRef.current.emit('audio_chunk', {
      session_id: sessionIdRef.current,
      audio:      buffer,
      language:   detectedLangRef.current !== 'Unknown' ? detectedLangRef.current : undefined,
      is_final:   isFinal,
    })
  }, [])

  // ── Request diarization (called on interval + on stop) ────────────────────
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

  // ── Start ──────────────────────────────────────────────────────────────────
  const startSession = useCallback(async (): Promise<string | null> => {
    connect()

    // Create server-side session (DB row + audio accumulation slot)
    let id: string | null = null
    try {
      const token   = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res  = await fetch(`${API_BASE()}/api/session/start`, { method: 'POST', headers })
      const json = await res.json()
      id = json.session_id ?? null
    } catch {
      // Session ID is optional — transcription still works without DB
    }

    setSessionId(id)
    sessionIdRef.current    = id
    detectedLangRef.current = 'Unknown'
    timeOffsetRef.current   = 0

    // Join the session room so the server can target pushes at us
    if (id) {
      // Small delay to ensure connection is ready
      setTimeout(() => {
        socketRef.current?.emit('join_session', { session_id: id })
      }, 200)
    }

    reset()
    await start()
    setActive(true)
    setPaused(false)

    // ── Chunk loop ───────────────────────────────────────────────────────────
    chunkIntervalRef.current = setInterval(async () => {
      const blob = await takeChunk()
      if (blob) sendChunk(blob)
    }, CHUNK_MS)

    // ── Diarization loop ─────────────────────────────────────────────────────
    diarizeIntervalRef.current = setInterval(() => {
      requestDiarize(segmentsRef.current)
    }, DIARIZE_MS)

    return id
  }, [connect, reset, start, takeChunk, sendChunk, requestDiarize])

  // ── Pause ──────────────────────────────────────────────────────────────────
  const pauseSession = useCallback(() => {
    if (chunkIntervalRef.current)  clearInterval(chunkIntervalRef.current)
    if (diarizeIntervalRef.current) clearInterval(diarizeIntervalRef.current)
    stop()
    setPaused(true)
  }, [stop])

  // ── Resume ─────────────────────────────────────────────────────────────────
  const resumeSession = useCallback(async () => {
    reset()
    await start()
    setPaused(false)

    chunkIntervalRef.current = setInterval(async () => {
      const blob = await takeChunk()
      if (blob) sendChunk(blob)
    }, CHUNK_MS)

    diarizeIntervalRef.current = setInterval(() => {
      requestDiarize(segmentsRef.current)
    }, DIARIZE_MS)
  }, [reset, start, takeChunk, sendChunk, requestDiarize])

  // ── Stop ───────────────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    if (chunkIntervalRef.current)  clearInterval(chunkIntervalRef.current)
    if (diarizeIntervalRef.current) clearInterval(diarizeIntervalRef.current)
    chunkIntervalRef.current   = null
    diarizeIntervalRef.current = null
    stop()
    setActive(false)
    setPaused(false)
  }, [stop])

  // ── Final chunk when recording stops ─────────────────────────────────────
  useEffect(() => {
    if (recording || !chunks.length) return
    const sendFinalAndDiarize = async () => {
      const blob = getBlob('audio/webm')
      if (blob && blob.size >= 500) {
        await sendChunk(blob, true)
      }
      // One final diarization pass over all segments
      requestDiarize(segmentsRef.current)
    }
    sendFinalAndDiarize()
  }, [recording, chunks, getBlob, sendChunk, requestDiarize])

  // Keep segmentsRef in sync from outside via setSegmentsRef
  const setSegmentsRef = useCallback((segs: Segment[]) => {
    segmentsRef.current = segs
  }, [])

  return {
    // state
    connected,
    sessionId,
    active,
    paused,
    recording,
    permissionError,
    detectedLanguage: () => detectedLangRef.current,
    // actions
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    setSegmentsRef,
    requestDiarize,
    // for audio upload after save
    getBlob,
    chunks,
  }
}
