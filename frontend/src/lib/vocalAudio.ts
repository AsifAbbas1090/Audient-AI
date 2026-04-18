/**
 * vocalAudio.ts — audio feedback utilities for the vocal prompts system.
 * All functions are fire-and-forget; errors are silently ignored so a blocked
 * AudioContext or missing SpeechSynthesis never breaks the app.
 */

function makeCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)()
  } catch { return null }
}

/** Ascending three-note chime — plays on wake-word detection. */
export function playChime(): void {
  const ctx = makeCtx()
  if (!ctx) return
  const freqs = [523.25, 659.25, 783.99]  // C5, E5, G5
  freqs.forEach((freq, i) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.12
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.22, t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
    osc.start(t)
    osc.stop(t + 0.32)
  })
}

/** Short rising double-beep — plays on successful command. */
export function playSuccessBeep(): void {
  const ctx = makeCtx()
  if (!ctx) return
  ;[880, 1046].forEach((freq, i) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.1
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    osc.start(t)
    osc.stop(t + 0.25)
  })
}

/** Low single tone — plays when command window times out or is not understood. */
export function playErrorBeep(): void {
  const ctx = makeCtx()
  if (!ctx) return
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = 220
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.35)
}

/** Voice confirmation using the browser's TTS engine. */
export function speak(text: string): void {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt   = new SpeechSynthesisUtterance(text)
    utt.volume  = 0.75
    utt.rate    = 0.92
    utt.pitch   = 1.0
    window.speechSynthesis.speak(utt)
  } catch { /* ignore */ }
}
