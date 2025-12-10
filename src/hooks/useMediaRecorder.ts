import { useEffect, useRef, useState } from 'react'

export type UseMediaRecorderOptions = {
  mimeType?: string
  audioBitsPerSecond?: number
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const { mimeType = 'audio/webm' } = options
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [chunks, setChunks] = useState<Blob[]>([])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const start = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported on this browser or connection (requires HTTPS).")
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType })
      const localChunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data)
      }
      recorder.onstop = () => {
        setChunks(localChunks.slice())
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setPermissionError(null)
    } catch (e: any) {
      console.error("Microphone start error:", e)
      setPermissionError(e?.message || 'Microphone permission error')
    }
  }

  const stop = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  const reset = () => setChunks([])

  const getBlob = (overrideMime?: string) => {
    if (!chunks.length) return null
    return new Blob(chunks, { type: overrideMime || mimeType })
  }

  return { recording, start, stop, reset, getBlob, chunks, permissionError }
}


