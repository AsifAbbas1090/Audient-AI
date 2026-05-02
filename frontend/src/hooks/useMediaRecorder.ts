/**
 * useMediaRecorder
 *
 * Two operating modes depending on whether `timeslice` is set:
 *
 * TIMESLICE MODE (timeslice > 0):
 *   MediaRecorder fires ondataavailable every `timeslice` ms without stopping.
 *   Chunks accumulate in a rolling buffer (max 240 entries ≈ 2 min at 500 ms).
 *   Use getWindowBlob(n) to assemble a valid WebM from [headerChunk + last n sub-chunks].
 *   useLiveSession uses timeslice=500ms and calls getWindowBlob(8) every 4 s —
 *   i.e. 8 × 500 ms = 4 s of audio per Whisper request, NO stop/restart gaps.
 *   setChunks is NOT updated on every 500 ms tick to avoid per-tick re-renders;
 *   it is set once in onstop to signal that recording has stopped and data is ready.
 *
 * LEGACY MODE (no timeslice):
 *   MediaRecorder stops/restarts on takeChunk() — each call produces a self-contained WebM.
 *   Kept for backward compatibility.
 *
 * deviceId:
 *   Optional default device; can be overridden per-call in start(overrideDeviceId).
 *   Used for dual-channel mic: doctor recorder and patient recorder each get their own deviceId.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type UseMediaRecorderOptions = {
  mimeType?:           string
  audioBitsPerSecond?: number
  /** Fire ondataavailable every N ms. Enables rolling-buffer / overlap mode. */
  timeslice?:          number
  /** Default audio device ID. Can be overridden in start(). */
  deviceId?:           string
}

const MAX_BUFFER = 240   // 240 × 500 ms = 2 min rolling window

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const { mimeType = 'audio/webm', timeslice, deviceId: defaultDeviceId } = options

  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const streamRef          = useRef<MediaStream | null>(null)

  // Timeslice mode state
  const rawBufferRef       = useRef<Blob[]>([])
  const headerBlobRef      = useRef<Blob | null>(null)
  const isFirstChunkRef    = useRef(true)

  // Legacy mode state
  const chunkResolverRef   = useRef<((blob: Blob | null) => void) | null>(null)
  const isChunkStopRef     = useRef(false)

  const [recording,        setRecording]       = useState(false)
  const [permissionError,  setPermissionError] = useState<string | null>(null)
  const [chunks,           setChunks]          = useState<Blob[]>([])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Timeslice mode: continuous recording with rolling buffer ──────────────
  function _startTimeslice(stream: MediaStream) {
    const recorder = new MediaRecorder(stream, { mimeType })
    rawBufferRef.current  = []
    headerBlobRef.current = null
    isFirstChunkRef.current = true

    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return
      if (isFirstChunkRef.current) {
        // First chunk contains the WebM EBML header + first cluster of audio.
        // Must be prepended to any window blob for the blob to be valid WebM.
        headerBlobRef.current   = e.data
        isFirstChunkRef.current = false
      }
      rawBufferRef.current.push(e.data)
      if (rawBufferRef.current.length > MAX_BUFFER) rawBufferRef.current.shift()
      // Do NOT call setChunks here — it would fire every 500 ms and cause
      // a re-render of the entire live session page on every tick.
      // setChunks is called once in onstop to signal data is ready.
    }

    recorder.onstop = () => {
      // Signal to useLiveSession's useEffect that recording stopped with data.
      if (rawBufferRef.current.length > 0) setChunks([new Blob()])
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    mediaRecorderRef.current = recorder
    recorder.start(timeslice)
  }

  // ── Legacy mode: stop/restart for takeChunk ────────────────────────────────
  function _startLegacy(stream: MediaStream) {
    const recorder    = new MediaRecorder(stream, { mimeType })
    const localChunks: Blob[] = []

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) localChunks.push(e.data)
    }

    recorder.onstop = () => {
      setChunks(localChunks.slice())
      if (isChunkStopRef.current && streamRef.current) {
        const blob = localChunks.length
          ? new Blob(localChunks, { type: mimeType })
          : null
        chunkResolverRef.current?.(blob)
        chunkResolverRef.current = null
        isChunkStopRef.current   = false
        _startLegacy(streamRef.current)   // restart on same stream
      } else {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const start = async (overrideDeviceId?: string): Promise<void> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access not supported (requires HTTPS or localhost).')
      }
      const did = overrideDeviceId ?? defaultDeviceId
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        ...(did ? { deviceId: { exact: did } } : {}),
      }
      const stream = streamRef.current
        ?? (await navigator.mediaDevices.getUserMedia({ audio: audioConstraints }))
      streamRef.current = stream

      if (timeslice) {
        _startTimeslice(stream)
      } else {
        _startLegacy(stream)
      }
      setRecording(true)
      setPermissionError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Microphone permission error'
      console.error('[MediaRecorder] start error:', msg)
      setPermissionError(msg)
    }
  }

  const stop = (): void => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
      setRecording(false)
    }
  }

  const reset = (): void => {
    rawBufferRef.current    = []
    headerBlobRef.current   = null
    isFirstChunkRef.current = true
    setChunks([])
  }

  /**
   * Assemble a valid WebM blob from the rolling buffer.
   * Returns Blob([headerChunk, ...last totalChunks sub-chunks]) or null.
   *
   * Example: getWindowBlob(12) with timeslice=500 ms
   *   = header + last 12 × 500 ms = up to 6 s of audio
   *   Used as WINDOW_SUBS(10) + OVERLAP_SUBS(2) in useLiveSession.
   *
   * Only meaningful in timeslice mode; returns null in legacy mode.
   */
  const getWindowBlob = useCallback((totalChunks: number): Blob | null => {
    if (!headerBlobRef.current || rawBufferRef.current.length === 0) return null
    const buf   = rawBufferRef.current
    const slice = buf.slice(Math.max(0, buf.length - totalChunks))
    return new Blob([headerBlobRef.current, ...slice], { type: mimeType })
  }, [mimeType])

  /**
   * Get a blob for the final/full recording.
   * Timeslice mode: entire rolling buffer (up to 2 min) — used for audio file upload.
   * Legacy mode: all chunks accumulated since last start().
   */
  const getBlob = (overrideMime?: string): Blob | null => {
    if (timeslice) {
      return getWindowBlob(rawBufferRef.current.length)
    }
    if (!chunks.length) return null
    return new Blob(chunks, { type: overrideMime ?? mimeType })
  }

  /**
   * Legacy: stop the recorder, get the chunk blob, restart.
   * In timeslice mode: immediately returns the current window blob (no stop).
   */
  const takeChunk = (): Promise<Blob | null> => {
    if (timeslice) {
      return Promise.resolve(getWindowBlob(10))
    }
    // Use the live MediaRecorder state (a ref), not the React `recording` state.
    // The React state is stale inside the setInterval closure — the recorder may
    // have already started even though the captured `recording` value is still false.
    if (mediaRecorderRef.current?.state !== 'recording') {
      return Promise.resolve(null)
    }
    return new Promise(resolve => {
      chunkResolverRef.current = resolve
      isChunkStopRef.current   = true
      mediaRecorderRef.current!.stop()
    })
  }

  return {
    recording,
    permissionError,
    start,
    stop,
    reset,
    getBlob,
    chunks,
    getWindowBlob,
    takeChunk,
  }
}
