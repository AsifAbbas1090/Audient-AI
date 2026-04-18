/**
 * useVocalPrompts — always-on wake-word + command recognition for hands-free
 * session control.
 *
 * Two-phase model:
 *  1. "watching"  — silent; Web Speech API runs continuously listening for
 *                   the word "Audient".  Nothing is stored or sent anywhere.
 *  2. "listening" — 2.5 s command window opened after wake word detected.
 *                   Fuzzy-matches the next utterance against known commands.
 *
 * Audio feedback:
 *  · Wake word detected  → ascending three-note chime
 *  · Command matched     → double-beep + voice confirmation
 *  · No match / timeout  → low error beep
 *
 * Every vocal event (hit or miss) is logged to the backend so the session
 * record has a timestamped audit trail of exactly what the doctor said.
 */
import { useEffect, useRef, useState } from 'react'
import { playChime, playErrorBeep, playSuccessBeep, speak } from '../lib/vocalAudio'
import api from '../lib/api'

// ── Types ───────────────────────────────────────────────────────────────────
export type VocalCommand = 'start' | 'stop' | 'pause' | 'resume' | 'generate_summary'
export type VocalPhase   = 'off' | 'watching' | 'listening' | 'success' | 'error'

export interface UseVocalPromptsOptions {
  sessionId?:          string | null
  onStart:             () => void
  onStop:              () => void
  onPause:             () => void
  onResume:            () => void
  onGenerateSummary:   () => void
}

export interface UseVocalPromptsResult {
  phase:     VocalPhase
  supported: boolean
  lastHeard: string | null
  lastCmd:   VocalCommand | null
}

// ── Command table ────────────────────────────────────────────────────────────
const COMMAND_WINDOW_MS    = 2500
const CONFIDENCE_THRESHOLD = 0.52   // minimum fuzzy score to accept a command

const COMMAND_ALIASES: Record<VocalCommand, string[]> = {
  start:            ['start', 'start recording', 'begin', 'begin recording'],
  stop:             ['stop', 'stop recording', 'end', 'end recording', 'finish', 'done', 'end session'],
  pause:            ['pause', 'pause recording', 'hold', 'hold on'],
  resume:           ['resume', 'resume recording', 'continue', 'go on'],
  generate_summary: ['generate summary', 'summary', 'generate', 'get summary', 'summarise', 'summarize'],
}

const VOICE_CONFIRMATIONS: Record<VocalCommand, string> = {
  start:            'Recording started.',
  stop:             'Recording stopped. Processing your session.',
  pause:            'Recording paused.',
  resume:           'Recording resumed.',
  generate_summary: 'Generating your summary now.',
}

// ── Levenshtein fuzzy matching ───────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j - 1], dp[j], prev)
      dp[j - 1] = prev
      prev = val
    }
    dp[b.length] = prev
  }
  return dp[b.length]
}

function matchCommand(transcript: string): { cmd: VocalCommand; score: number } | null {
  const heard = transcript.toLowerCase().trim()
  let best: { cmd: VocalCommand; score: number } | null = null

  for (const [cmd, aliases] of Object.entries(COMMAND_ALIASES) as [VocalCommand, string[]][]) {
    for (const alias of aliases) {
      if (heard.includes(alias)) return { cmd: cmd as VocalCommand, score: 1.0 }
      const dist  = levenshtein(heard, alias)
      const score = 1 - dist / Math.max(heard.length, alias.length, 1)
      if (!best || score > best.score) best = { cmd: cmd as VocalCommand, score }
    }
  }
  return best && best.score >= CONFIDENCE_THRESHOLD ? best : null
}

function hasWakeWord(text: string): boolean {
  const normalized = text.toLowerCase().trim()
  if (/\baudient\b/.test(normalized)) return true
  const firstWord = normalized.split(/\s+/)[0] ?? ''
  return levenshtein(firstWord, 'audient') <= 2
}

// ── Web Speech API shim types ────────────────────────────────────────────────
interface SpeechResult      { transcript: string; confidence: number }
interface SpeechResultItem  { readonly [i: number]: SpeechResult; readonly length: number }
interface SpeechResultList  { readonly [i: number]: SpeechResultItem; readonly length: number }
interface SpeechEvent       { readonly resultIndex: number; readonly results: SpeechResultList }
interface SpeechErrorEvent  { readonly error: string }
interface SpeechRecognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: SpeechEvent) => void) | null
  onend:    (() => void) | null
  onerror:  ((e: SpeechErrorEvent) => void) | null
  start(): void; stop(): void
}

const SpeechAPI: (new () => SpeechRecognition) | null =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
    : null

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useVocalPrompts(opts: UseVocalPromptsOptions): UseVocalPromptsResult {
  const supported = Boolean(SpeechAPI)

  const [phase,     setPhase]     = useState<VocalPhase>(supported ? 'watching' : 'off')
  const [lastHeard, setLastHeard] = useState<string | null>(null)
  const [lastCmd,   setLastCmd]   = useState<VocalCommand | null>(null)

  // Stable mutable refs so the rec.onresult closure is never stale
  const phaseRef    = useRef<VocalPhase>(supported ? 'watching' : 'off')
  const optsRef     = useRef(opts)
  optsRef.current   = opts   // updated every render — always fresh callbacks
  const cmdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recRef      = useRef<SpeechRecognition | null>(null)
  const mountedRef  = useRef(true)

  // Thread-safe phase setter (updates both ref and React state)
  function setP(p: VocalPhase) {
    phaseRef.current = p
    if (mountedRef.current) setPhase(p)
  }

  // ── Handler ref pattern — updated every render, called by stable onresult ─
  const handlerRef = useRef<(t: string, c: number) => void>(() => {})

  // Rebuild the handler after every render so it always closes over fresh state
  useEffect(() => {
    handlerRef.current = (transcript: string, confidence: number) => {
      const text = transcript.toLowerCase().trim()

      if (phaseRef.current === 'watching') {
        if (!hasWakeWord(text)) return
        playChime()

        // Try same-breath command: "Audient start"
        const afterWake = text.replace(/\baudient[.,!]?\s*/i, '').trim()
        if (afterWake) {
          const match = matchCommand(afterWake)
          if (match) { dispatchCommand(match.cmd, afterWake, match.score); return }
        }
        // Open 2.5 s command window
        setP('listening')
        cmdTimerRef.current = setTimeout(() => {
          if (phaseRef.current === 'listening') {
            playErrorBeep()
            setP('watching')
          }
        }, COMMAND_WINDOW_MS)

      } else if (phaseRef.current === 'listening') {
        const match = matchCommand(text)
        if (match) {
          dispatchCommand(match.cmd, text, match.score)
        } else if (text.length > 2) {
          if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null }
          playErrorBeep()
          setP('error')
          logCommand(text, confidence, null, false)
          setTimeout(() => { if (phaseRef.current === 'error') setP('watching') }, 1000)
        }
      }
    }
  })

  function dispatchCommand(cmd: VocalCommand, heard: string, score: number) {
    if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null }
    setP('success')
    if (mountedRef.current) { setLastCmd(cmd); setLastHeard(heard) }
    playSuccessBeep()
    speak(VOICE_CONFIRMATIONS[cmd])

    const o = optsRef.current
    switch (cmd) {
      case 'start':            o.onStart();           break
      case 'stop':             o.onStop();            break
      case 'pause':            o.onPause();           break
      case 'resume':           o.onResume();          break
      case 'generate_summary': o.onGenerateSummary(); break
    }

    logCommand(heard, score, cmd, true)
    setTimeout(() => {
      setP('watching')
      if (mountedRef.current) { setLastCmd(null); setLastHeard(null) }
    }, 1500)
  }

  function logCommand(
    phrase: string, confidence: number,
    cmd: VocalCommand | null, actionTaken: boolean
  ) {
    const sid = optsRef.current.sessionId
    if (!sid) return
    api.post(`/api/sessions/${sid}/vocal-commands`, {
      phrase_heard:    phrase,
      confidence,
      command_matched: cmd,
      action_taken:    actionTaken,
    }).catch(() => {})
  }

  // ── Speech recognition lifecycle (mounts once) ───────────────────────────
  useEffect(() => {
    mountedRef.current = true
    if (!SpeechAPI) return

    const rec = new SpeechAPI()
    rec.lang            = 'en-US'
    rec.continuous      = true
    rec.interimResults  = false
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r[0]) handlerRef.current(r[0].transcript, r[0].confidence ?? 0.8)
      }
    }

    rec.onend = () => {
      // Auto-restart while still active (recognition stops after long silence)
      if (phaseRef.current !== 'off') {
        try { rec.start() } catch { /* already starting */ }
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setP('off')
      // 'no-speech' and 'aborted' are normal — onend will restart
    }

    recRef.current = rec
    try { rec.start() } catch { /* ignore */ }

    return () => {
      mountedRef.current    = false
      phaseRef.current      = 'off'
      if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current)
      recRef.current?.stop()
      recRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, supported, lastHeard, lastCmd }
}
