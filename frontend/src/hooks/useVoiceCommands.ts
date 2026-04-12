/**
 * useVoiceCommands — hands-free session control via Web Speech API.
 *
 * Supported commands (case-insensitive, partial match):
 *   "start"                  → onStart()
 *   "stop" | "end session"   → onStop()
 *   "pause"                  → onPause()
 *   "resume"                 → onResume()
 *   "clear" | "reset"        → onClear()
 *
 * Usage:
 *   const { listening, lastCommand, supported, startListening, stopListening }
 *     = useVoiceCommands({ onStart, onStop, onPause, onResume, onClear })
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface Commands {
  onStart:  () => void
  onStop:   () => void
  onPause:  () => void
  onResume: () => void
  onClear:  () => void
}

interface VoiceCommandsResult {
  listening:      boolean
  lastCommand:    string | null
  supported:      boolean
  startListening: () => void
  stopListening:  () => void
}

// Map keyword patterns → command names
const COMMAND_MAP: Array<{ patterns: string[]; name: string }> = [
  { patterns: ['start', 'start recording', 'begin'],       name: 'start'  },
  { patterns: ['stop', 'end session', 'end', 'stop recording', 'finish'], name: 'stop'   },
  { patterns: ['pause', 'hold on'],                        name: 'pause'  },
  { patterns: ['resume', 'continue', 'go on'],             name: 'resume' },
  { patterns: ['clear', 'reset', 'erase'],                 name: 'clear'  },
]

// Minimal local types for the Web Speech API (not in default TS DOM lib)
interface ISpeechRecognitionResult { readonly [index: number]: { transcript: string }; readonly length: number }
interface ISpeechRecognitionResultList { readonly [index: number]: ISpeechRecognitionResult; readonly length: number }
interface ISpeechRecognitionEvent { readonly resultIndex: number; readonly results: ISpeechRecognitionResultList }
interface ISpeechRecognitionErrorEvent { readonly error: string }
interface ISpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult:  ((e: ISpeechRecognitionEvent) => void)       | null
  onend:     (() => void)                                  | null
  onerror:   ((e: ISpeechRecognitionErrorEvent) => void)  | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => ISpeechRecognition
const SpeechRecognitionAPI: SpeechRecognitionCtor | null =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null

export function useVoiceCommands(commands: Commands): VoiceCommandsResult {
  const supported = Boolean(SpeechRecognitionAPI)
  const [listening,   setListening]   = useState(false)
  const [lastCommand, setLastCommand] = useState<string | null>(null)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const enabledRef     = useRef(false)   // tracks whether user wants it on
  const commandsRef    = useRef(commands)
  commandsRef.current  = commands        // always fresh callbacks

  const dispatch = useCallback((name: string) => {
    setLastCommand(name)
    setTimeout(() => setLastCommand(null), 2500)
    switch (name) {
      case 'start':  commandsRef.current.onStart();  break
      case 'stop':   commandsRef.current.onStop();   break
      case 'pause':  commandsRef.current.onPause();  break
      case 'resume': commandsRef.current.onResume(); break
      case 'clear':  commandsRef.current.onClear();  break
    }
  }, [])

  const initRecognition = useCallback((): ISpeechRecognition | null => {
    if (!SpeechRecognitionAPI) return null
    const rec = new SpeechRecognitionAPI()
    rec.lang           = 'en-US'
    rec.continuous     = true
    rec.interimResults = false

    rec.onresult = (event: ISpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase()
        for (const { patterns, name } of COMMAND_MAP) {
          if (patterns.some(p => transcript.includes(p))) {
            console.log(`[VoiceCommand] detected: "${transcript}" → ${name}`)
            dispatch(name)
            break
          }
        }
      }
    }

    rec.onend = () => {
      // Auto-restart while still enabled (recognition stops after silence)
      if (enabledRef.current) {
        try { rec.start() } catch { /* ignore */ }
      } else {
        setListening(false)
      }
    }

    rec.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        enabledRef.current = false
        setListening(false)
      }
      // Ignore 'no-speech' and 'aborted' — they fire normally
    }

    return rec
  }, [dispatch])

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return
    enabledRef.current = true
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition()
    }
    try {
      recognitionRef.current?.start()
      setListening(true)
    } catch { /* already started */ }
  }, [initRecognition])

  const stopListening = useCallback(() => {
    enabledRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setLastCommand(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      enabledRef.current = false
      recognitionRef.current?.stop()
    }
  }, [])

  return { listening, lastCommand, supported, startListening, stopListening }
}
