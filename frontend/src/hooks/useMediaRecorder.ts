import { useEffect, useRef, useState } from 'react'

export type UseMediaRecorderOptions = {
  mimeType?: string
  audioBitsPerSecond?: number
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const { mimeType = 'audio/webm' } = options
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkResolverRef = useRef<((blob: Blob | null) => void) | null>(null)
  const isChunkStopRef = useRef(false)
  const [recording, setRecording] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [chunks, setChunks] = useState<Blob[]>([])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startRecorderOnStream = (stream: MediaStream) => {
    const recorder = new MediaRecorder(stream, { mimeType })
    const localChunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) localChunks.push(e.data)
    }
    recorder.onstop = () => {
      setChunks(localChunks.slice())
      if (isChunkStopRef.current && streamRef.current) {
        const blob = localChunks.length ? new Blob(localChunks, { type: mimeType }) : null
        if (chunkResolverRef.current) {
          chunkResolverRef.current(blob)
          chunkResolverRef.current = null
        }
        isChunkStopRef.current = false
        const next = new MediaRecorder(streamRef.current, { mimeType })
        const nextChunks: Blob[] = []
        next.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) nextChunks.push(e.data)
        }
        next.onstop = () => {
          setChunks(nextChunks.slice())
          if (isChunkStopRef.current && streamRef.current) {
            const b = nextChunks.length ? new Blob(nextChunks, { type: mimeType }) : null
            if (chunkResolverRef.current) {
              chunkResolverRef.current(b)
              chunkResolverRef.current = null
            }
            isChunkStopRef.current = false
            startRecorderOnStream(streamRef.current)
          } else {
            streamRef.current?.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
        }
        mediaRecorderRef.current = next
        next.start()
      } else {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
    mediaRecorderRef.current = recorder
    recorder.start()
  }

  const start = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this browser or connection (requires HTTPS).')
      }
      const stream = streamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }))
      streamRef.current = stream
      startRecorderOnStream(stream)
      setRecording(true)
      setPermissionError(null)
    } catch (e: any) {
      console.error('Microphone start error:', e)
      setPermissionError(e?.message || 'Microphone permission error')
    }
  }

  const stop = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  /** Stop current chunk, get blob, then restart recorder on same stream. Resolves with blob or null. */
  const takeChunk = (): Promise<Blob | null> => {
    if (!recording || !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      chunkResolverRef.current = resolve
      isChunkStopRef.current = true
      mediaRecorderRef.current!.stop()
    })
  }

  const reset = () => setChunks([])

  const getBlob = (overrideMime?: string) => {
    if (!chunks.length) return null
    return new Blob(chunks, { type: overrideMime || mimeType })
  }

  return { recording, start, stop, reset, getBlob, chunks, permissionError, takeChunk }
}


