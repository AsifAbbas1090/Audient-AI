import { useEffect, useRef } from 'react'
import { cn } from '../../utils/cn'

type WaveformProps = {
  active?:    boolean
  speaker?:   1 | 2
  className?: string
}

const BAR_COUNT  = 32
const SMOOTHING  = 0.8   // 0–1, higher = smoother

// Idle heights as fraction of container (0–1)
const idleScale = [
  0.30, 0.50, 0.20, 0.60, 0.35, 0.55, 0.20, 0.65,
  0.40, 0.30, 0.50, 0.25, 0.45, 0.60, 0.35, 0.20,
  0.65, 0.40, 0.30, 0.50, 0.25, 0.45, 0.55, 0.35,
  0.20, 0.60, 0.40, 0.30, 0.50, 0.25, 0.45, 0.55,
]

export function Waveform({ active = false, speaker, className }: WaveformProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const analyserRef= useRef<AnalyserNode | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const dataRef    = useRef<Float32Array<ArrayBuffer> | null>(null)
  const barsRef    = useRef<number[]>(Array(BAR_COUNT).fill(0.1))

  const activeColor = speaker === 2 ? '#34d399' : '#6366f1'  // emerald-400 / brand-500
  const idleColor   = speaker === 2 ? '#064e3b' : '#1e1b4b'  // emerald-900 / brand-950

  // Start / stop mic + analyser
  useEffect(() => {
    if (!active) {
      // Cleanup
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current  = null
      analyserRef.current= null
      dataRef.current    = null
      cancelAnimationFrame(rafRef.current)
      drawIdle()
      return
    }

    let cancelled = false

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const ctx     = new AudioContext()
        const source  = ctx.createMediaStreamSource(stream)
        const analyser= ctx.createAnalyser()
        analyser.fftSize       = 128          // 64 frequency bins
        analyser.smoothingTimeConstant = SMOOTHING
        source.connect(analyser)
        analyserRef.current = analyser
        dataRef.current     = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>
        drawLive()
      })
      .catch(() => {
        // Mic denied — fall back to CSS idle
        drawIdle()
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current   = null
      analyserRef.current = null
      cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  function drawLive() {
    const canvas  = canvasRef.current
    const analyser= analyserRef.current
    const data    = dataRef.current
    if (!canvas || !analyser || !data) return

    analyser.getFloatFrequencyData(data)

    const ctx    = canvas.getContext('2d')!
    const W      = canvas.width
    const H      = canvas.height
    const bins   = data.length                   // 64 bins
    const step   = Math.floor(bins / BAR_COUNT)  // bins per bar
    const barW   = W / BAR_COUNT
    const gap    = 2

    ctx.clearRect(0, 0, W, H)

    for (let i = 0; i < BAR_COUNT; i++) {
      // Average a slice of frequency bins for this bar
      let sum = 0
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] ?? -100
      }
      const avg = sum / step

      // dB range: -100 (silence) to 0 (max). Normalise to 0–1
      const norm    = Math.max(0, Math.min(1, (avg + 90) / 70))
      const target  = 0.05 + norm * 0.95
      // Smooth with previous value
      barsRef.current[i] = barsRef.current[i] * 0.6 + target * 0.4

      const barH = barsRef.current[i] * H
      const x    = i * barW
      const y    = (H - barH) / 2

      ctx.fillStyle = activeColor
      ctx.globalAlpha = 0.85
      // Rounded bar
      const r = Math.min(barW - gap, barH) / 2
      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y, barW - gap, barH, r)
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(drawLive)
  }

  function drawIdle() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W   = canvas.width
    const H   = canvas.height
    const barW= W / BAR_COUNT
    const gap = 2

    ctx.clearRect(0, 0, W, H)
    for (let i = 0; i < BAR_COUNT; i++) {
      const barH = idleScale[i] * H
      const x    = i * barW
      const y    = (H - barH) / 2
      const r    = Math.min(barW - gap, barH) / 2

      ctx.fillStyle   = idleColor
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y, barW - gap, barH, r)
      ctx.fill()
    }
  }

  // Draw idle on mount
  useEffect(() => { drawIdle() }, [])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={56}
      className={cn('w-full h-14 rounded-lg', className)}
    />
  )
}
