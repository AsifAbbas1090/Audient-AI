/**
 * vocalAudio.ts — audio feedback for vocal prompts.
 *
 * Uses a singleton AudioContext so it can be primed (resumed) during a user
 * gesture and remain active for subsequent non-gesture callbacks (onresult).
 * Chrome suspends any AudioContext created outside a gesture; calling
 * primeAudio() inside a button-click handler lifts that restriction.
 */

// AudioContext is only created AFTER the first user gesture (click/key/touch).
// Creating it before a gesture causes Chrome's autoplay-policy warning.
let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  // Return null silently if not yet primed — sounds are skipped, no error logged
  return _ctx && _ctx.state !== 'closed' ? _ctx : null
}

/** Create + resume the shared AudioContext.
 *  Must be called from inside a user-gesture handler. */
export function primeAudio(): void {
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (_ctx.state === 'suspended') _ctx.resume()
  } catch { /* ignore */ }
}

// Listen for the first interaction anywhere and prime then.
if (typeof window !== 'undefined') {
  const once = { capture: true, passive: true, once: true } as const
  const handler = () => primeAudio()
  window.addEventListener('click',      handler, once)
  window.addEventListener('keydown',    handler, once)
  window.addEventListener('touchstart', handler, once)
}

function play(fn: (ctx: AudioContext) => void): void {
  try {
    const ctx = getCtx()
    if (!ctx) return          // not yet primed — skip silently
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => fn(ctx)).catch(() => {})
    } else {
      fn(ctx)
    }
  } catch { /* ignore */ }
}

/** Ascending three-note chime — plays on wake-word detection. */
export function playChime(): void {
  play(ctx => {
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
  })
}

/** Short rising double-beep — plays on successful command. */
export function playSuccessBeep(): void {
  play(ctx => {
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
  })
}

/** Low single tone — plays when command window times out or is not understood. */
export function playErrorBeep(): void {
  play(ctx => {
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
  })
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
