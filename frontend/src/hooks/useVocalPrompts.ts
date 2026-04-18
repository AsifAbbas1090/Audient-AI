/**
 * useVocalPrompts — wake-word voice control for hands-free session management.
 *
 * Architecture: fresh SpeechRecognition instance per utterance cycle.
 * Chrome's Web Speech API accumulates internal state and silently stops
 * delivering results when a long-lived instance shares the mic with a
 * MediaRecorder.  Creating a new instance after each onend avoids this.
 *
 * Two-phase model:
 *  watching  → listening for "Audient [command]"
 *  listening → 4 s window to speak a command after the wake word fires
 */
import { useEffect, useRef, useState } from 'react'
import { playChime, playErrorBeep, playSuccessBeep, speak, primeAudio } from '../lib/vocalAudio'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
export type VocalCommand = 'start' | 'stop' | 'pause' | 'resume' | 'generate_summary'
export type VocalPhase   = 'off' | 'watching' | 'listening' | 'success' | 'error'

export interface UseVocalPromptsOptions {
  sessionId?:        string | null
  onStart:           () => void
  onStop:            () => void
  onPause:           () => void
  onResume:          () => void
  onGenerateSummary: () => void
}

export interface UseVocalPromptsResult {
  phase:     VocalPhase
  supported: boolean
  lastHeard: string | null
  lastCmd:   VocalCommand | null
}

// ── Constants ──────────────────────────────────────────────────────────────────
const COMMAND_WINDOW_MS = 4000

// ── Command table ──────────────────────────────────────────────────────────────
const COMMANDS: { cmd: VocalCommand; triggers: string[] }[] = [
  { cmd: 'start',            triggers: ['start', 'begin', 'record', 'go']                                },
  { cmd: 'stop',             triggers: ['stop', 'end', 'finish', 'done', 'complete']                      },
  { cmd: 'pause',            triggers: ['pause', 'hold', 'wait']                                          },
  { cmd: 'resume',           triggers: ['resume', 'continue', 'unpause', 'go on']                         },
  { cmd: 'generate_summary', triggers: ['summary', 'summarise', 'summarize', 'generate', 'report']        },
]

const VOICE_CONFIRMATIONS: Record<VocalCommand, string> = {
  start:            'Recording started.',
  stop:             'Session ended. Processing now.',
  pause:            'Paused.',
  resume:           'Resumed.',
  generate_summary: 'Generating summary.',
}

// Wake word variants — common speech-engine mishearings of "Audient"
const WAKE_VARIANTS = ['audient', 'audience', 'evident', 'obvious', 'audio', 'audient ai', 'audience ai']

// ── Helpers ────────────────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev)
      dp[j - 1] = prev
      prev = val
    }
    dp[b.length] = prev
  }
  return dp[b.length]
}

function hasWakeWord(text: string): boolean {
  const t = text.toLowerCase()
  for (const v of WAKE_VARIANTS) if (t.includes(v)) return true
  // Fuzzy: any single word within edit-distance 2 of "audient"
  for (const w of t.split(/\s+/)) if (levenshtein(w, 'audient') <= 2) return true
  return false
}

function stripWakeWord(text: string): string {
  let s = text.toLowerCase()
  for (const v of WAKE_VARIANTS) s = s.replace(v, '')
  // Remove stray "ai" left after stripping "audient ai"
  s = s.replace(/\bai\b/, '').replace(/[.,!?]+/g, ' ').trim()
  // Fuzzy-strip leading word that resembles "audient"
  const words = s.split(/\s+/)
  if (words[0] && levenshtein(words[0], 'audient') <= 2) words.shift()
  return words.join(' ').trim()
}

function matchCommand(text: string): VocalCommand | null {
  const t = text.toLowerCase()
  for (const { cmd, triggers } of COMMANDS) {
    for (const tr of triggers) {
      if (t.includes(tr)) return cmd
    }
  }
  // Fuzzy single-word fallback
  for (const w of t.split(/\s+/)) {
    for (const { cmd, triggers } of COMMANDS) {
      for (const tr of triggers) {
        if (tr.split(' ').length === 1 && levenshtein(w, tr) <= 1) return cmd
      }
    }
  }
  return null
}

// ── Web Speech API shim ────────────────────────────────────────────────────────
interface SpeechAlt  { transcript: string; confidence: number }
interface SpeechItem { readonly length: number; readonly isFinal: boolean; readonly [i: number]: SpeechAlt }
interface SpeechList { readonly length: number; readonly [i: number]: SpeechItem }
interface SpeechEvt  { readonly resultIndex: number; readonly results: SpeechList }
interface SpeechErrEvt { readonly error: string }
interface SR {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: SpeechEvt) => void) | null
  onend:    (() => void) | null
  onerror:  ((e: SpeechErrEvt) => void) | null
  start(): void; stop(): void
}
const SpeechAPI: (new () => SR) | null =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null

const L = {
  info:  (...a: unknown[]) => console.log( '%c[Vocal]', 'color:#818cf8;font-weight:bold', ...a),
  warn:  (...a: unknown[]) => console.warn('%c[Vocal]', 'color:#f59e0b;font-weight:bold', ...a),
  error: (...a: unknown[]) => console.error('%c[Vocal]','color:#f87171;font-weight:bold', ...a),
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useVocalPrompts(opts: UseVocalPromptsOptions): UseVocalPromptsResult {
  const supported = Boolean(SpeechAPI)
  L.info('SpeechRecognition supported:', supported)

  const [phase,     setPhase]     = useState<VocalPhase>(supported ? 'watching' : 'off')
  const [lastHeard, setLastHeard] = useState<string | null>(null)
  const [lastCmd,   setLastCmd]   = useState<VocalCommand | null>(null)

  const phaseRef     = useRef<VocalPhase>(supported ? 'watching' : 'off')
  const optsRef      = useRef(opts)
  optsRef.current    = opts
  const cmdTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRef      = useRef(false)
  const activeRecRef = useRef<SR | null>(null)  // only the current instance may restart

  function setP(p: VocalPhase) {
    phaseRef.current = p
    setPhase(p)
  }

  function log(phrase: string, confidence: number, cmd: VocalCommand | null, acted: boolean) {
    const sid = optsRef.current.sessionId
    if (!sid) return
    api.post(`/api/sessions/${sid}/vocal-commands`, {
      phrase_heard: phrase, confidence, command_matched: cmd, action_taken: acted,
    }).catch(() => {})
  }

  function dispatch(cmd: VocalCommand, heard: string, score: number) {
    if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null }
    setP('success')
    setLastCmd(cmd)
    setLastHeard(heard)
    primeAudio()
    playSuccessBeep()
    speak(VOICE_CONFIRMATIONS[cmd])
    const o = optsRef.current
    if (cmd === 'start')            o.onStart()
    if (cmd === 'stop')             o.onStop()
    if (cmd === 'pause')            o.onPause()
    if (cmd === 'resume')           o.onResume()
    if (cmd === 'generate_summary') o.onGenerateSummary()
    log(heard, score, cmd, true)
    setTimeout(() => { setP('watching'); setLastCmd(null); setLastHeard(null) }, 1800)
  }

  function handleTranscript(transcript: string, confidence: number) {
    const text = transcript.toLowerCase().trim()
    if (!text) return
    setLastHeard(transcript)

    L.info(`heard [${phaseRef.current}] "${transcript}" (conf=${confidence.toFixed(2)})`)

    if (phaseRef.current === 'watching') {
      const woke = hasWakeWord(text)
      L.info('wake-word check:', woke, '| variants checked against:', text)
      if (!woke) return

      primeAudio()
      playChime()
      const afterWake = stripWakeWord(text)
      L.info('after strip:', `"${afterWake}"`)

      if (afterWake) {
        const cmd = matchCommand(afterWake)
        L.info('same-breath command match:', cmd)
        if (cmd) { dispatch(cmd, afterWake, 1.0); return }
      }

      L.info('opening command window for', COMMAND_WINDOW_MS, 'ms')
      setP('listening')
      cmdTimerRef.current = setTimeout(() => {
        if (phaseRef.current === 'listening') {
          L.warn('command window timed out — no command heard')
          playErrorBeep()
          setP('watching')
        }
      }, COMMAND_WINDOW_MS)

    } else if (phaseRef.current === 'listening') {
      const cmd = matchCommand(text)
      L.info('command match attempt:', `"${text}"`, '→', cmd)
      if (cmd) {
        dispatch(cmd, text, 1.0)
      } else {
        L.warn('no command matched for:', `"${text}"`)
      }
    }
  }

  // ── Fresh-instance cycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!SpeechAPI) return
    stopRef.current = false

    let cycleCount = 0

    function startCycle() {
      if (stopRef.current) return
      cycleCount++
      const n = cycleCount
      L.info(`cycle #${n} started`)

      const rec = new SpeechAPI!()
      activeRecRef.current = rec   // register as the ONE active instance

      rec.lang            = 'en-US'
      rec.continuous      = false
      rec.interimResults  = false
      rec.maxAlternatives = 5

      rec.onresult = (event) => {
        if (activeRecRef.current !== rec) return  // stale — ignore
        const alts: { transcript: string; confidence: number }[] = []
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          if (!r.isFinal) continue
          for (let j = 0; j < r.length; j++) {
            if (r[j]?.transcript) alts.push({ transcript: r[j].transcript, confidence: r[j].confidence ?? 0.8 })
          }
        }
        L.info(`cycle #${n} got ${alts.length} alt(s):`, alts.map(a => `"${a.transcript}"`).join(', '))

        L.info(`cycle #${n} phase="${phaseRef.current}"`)

        if (phaseRef.current === 'watching') {
          for (const { transcript, confidence } of alts) {
            if (hasWakeWord(transcript.toLowerCase())) {
              handleTranscript(transcript, confidence)
              return
            }
          }
          L.info('no wake word in any alternative — staying in watch mode')
        } else if (phaseRef.current === 'listening') {
          for (const { transcript, confidence } of alts) {
            const prev = phaseRef.current
            handleTranscript(transcript, confidence)
            if (phaseRef.current !== prev) return
          }
        } else {
          // 'success' or 'error' — still try a same-breath wake+command so a fast
          // second utterance ("audient start" right after a previous command) isn't lost
          L.warn(`cycle #${n} result arrived during phase="${phaseRef.current}" — attempting wake+cmd anyway`)
          for (const { transcript } of alts) {
            if (hasWakeWord(transcript.toLowerCase())) {
              const afterWake = stripWakeWord(transcript.toLowerCase())
              if (afterWake) {
                const cmd = matchCommand(afterWake)
                if (cmd) { L.info('late same-breath cmd:', cmd); dispatch(cmd, afterWake, 1.0); return }
              }
            }
          }
        }
      }

      rec.onend = () => {
        // Guard: only the instance that is still "active" may schedule the next cycle.
        // Chrome fires onend AFTER onerror('aborted') on stale instances — this check
        // prevents the duplicate-cycle runaway that caused the #62 doubling issue.
        if (activeRecRef.current !== rec) {
          L.info(`cycle #${n} stale onend ignored`)
          return
        }
        activeRecRef.current = null
        L.info(`cycle #${n} ended — restarting in 300 ms`)
        if (!stopRef.current) setTimeout(startCycle, 300)
      }

      rec.onerror = (e) => {
        if (e.error === 'aborted' || e.error === 'no-speech') {
          // Expected — aborted fires when a new cycle starts before this one finishes,
          // no-speech fires on silence. Both are harmless; onend handles the restart.
          L.info(`cycle #${n} ok-error (${e.error}) — onend will restart`)
          return
        }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          L.error('Microphone permission denied — vocal prompts disabled')
          setP('off')
          stopRef.current = true
          return
        }
        L.warn(`cycle #${n} error:`, e.error)
      }

      try {
        rec.start()
        L.info(`cycle #${n} listening…`)
      } catch (err) {
        L.error(`cycle #${n} failed to start:`, err)
        activeRecRef.current = null
        if (!stopRef.current) setTimeout(startCycle, 300)
      }
    }

    startCycle()

    return () => {
      stopRef.current = true
      if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current)
      setP('off')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, supported, lastHeard, lastCmd }
}
