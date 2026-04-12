import { useEffect, useRef, useState } from 'react'
import {
  Mic, RotateCcw, Brain, User, Calendar,
  HeartPulse, BookOpen, Smile, FileText, Loader2,
  CheckCircle2, Save,
} from 'lucide-react'
import { Sidebar }       from '../components/ui/Sidebar'
import { Button }        from '../components/ui/Button'
import { Badge }         from '../components/ui/Badge'
import { Card }          from '../components/ui/Card'
import { SpeakerBubble } from '../components/visual/SpeakerBubble'
import { RecordButton }  from '../components/visual/RecordButton'
import { Waveform }      from '../components/visual/Waveform'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { useToast }         from '../components/ui/Toaster'
import api from '../lib/api'

// ── Types ────────────────────────────────────────────────────
type Segment = { speaker: string; text: string; start?: number; end?: number }

type ExtractedInfo = {
  Name?:           string | null
  Age?:            string | null
  Gender?:         string | null
  Disease?:        string | null
  Education?:      string | null
  EmotionalState?: string | null
  AdditionalNotes?:string | null
}

// ── Field config ─────────────────────────────────────────────
const DEMO_FIELDS = [
  { key: 'Name',      label: 'Patient Name',  icon: User,      span: 1 },
  { key: 'Age',       label: 'Age',           icon: Calendar,  span: 1 },
  { key: 'Gender',    label: 'Gender',        icon: User,      span: 1 },
  { key: 'Education', label: 'Education',     icon: BookOpen,  span: 1 },
] as const

const CLINICAL_FIELDS = [
  { key: 'Disease',       label: 'Condition / Disease', icon: HeartPulse, span: 2 },
  { key: 'EmotionalState',label: 'Emotional State',     icon: Smile,      span: 2 },
] as const

// ── Page ─────────────────────────────────────────────────────
export default function ASRPage() {
  const [segments,    setSegments]    = useState<Segment[]>([])
  const [rawText,     setRawText]     = useState('')
  const [info,        setInfo]        = useState<ExtractedInfo | null>(null)
  const [transcribing,setTranscribing]= useState(false)
  const [extracting,  setExtracting]  = useState(false)
  const [noOllama,    setNoOllama]    = useState(false)
  const [statusMsg,   setStatusMsg]   = useState<string | null>(null)
  const [isSaving,    setIsSaving]    = useState(false)
  const [savedId,     setSavedId]     = useState<string | null>(null)
  const audioRef       = useRef<HTMLAudioElement | null>(null)
  const recordStartRef = useRef<number>(0)
  const detectedLang   = useRef<string>('Unknown')

  const toast = useToast()

  const { recording, start, stop, reset, getBlob, permissionError, chunks } =
    useMediaRecorder({ mimeType: 'audio/webm' })

  // After recording stops → transcribe → extract → save
  useEffect(() => {
    if (recording || !chunks.length) return

    const blob = getBlob('audio/webm')
    if (!blob) return

    const url = URL.createObjectURL(blob)
    if (audioRef.current) audioRef.current.src = url

    const run = async () => {
      setTranscribing(true)
      setInfo(null)
      setSegments([])
      setRawText('')
      setNoOllama(false)
      setStatusMsg(null)
      setSavedId(null)
      detectedLang.current = 'Unknown'

      let finalSegments: Segment[] = []
      let finalText     = ''
      let finalInfo: ExtractedInfo | null = null
      const duration = Math.round((Date.now() - recordStartRef.current) / 1000)

      try {
        const form = new FormData()
        form.append('file', blob, 'speech.webm')
        form.append('translate', 'true')
        form.append('diarize',   'true')
        const res = await api.post('/api/transcribe', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        finalText = res.data.text || ''
        setRawText(finalText)
        if (res.data.language) detectedLang.current = res.data.language
        if (res.data.diarization_skipped) setStatusMsg(res.data.diarization_skipped)
        if (res.data.segments?.length) {
          finalSegments = res.data.segments.map((s: Segment) => ({
            speaker: s.speaker || 'Speaker 1',
            text:    s.text    || '',
            start:   s.start,
            end:     s.end,
          }))
          setSegments(finalSegments)
          toast('Transcription complete', 'success')
        }

        if (finalText) {
          setExtracting(true)
          try {
            const exRes = await api.post('/api/extract', { text: finalText })
            if (exRes.data?.skipped) {
              setNoOllama(true)
              toast('Extraction skipped', 'error')
            } else {
              finalInfo = exRes.data
              setInfo(finalInfo)
              toast('Medical data extracted', 'success')
            }
          } catch {
            setNoOllama(true)
            toast('Extraction failed', 'error')
          } finally {
            setExtracting(false)
          }
        }
      } catch {
        setStatusMsg('Transcription failed — is the backend running?')
        toast('Transcription failed', 'error')
        return
      } finally {
        setTranscribing(false)
      }

      // ── Save to DB ────────────────────────────────────────
      if (!finalSegments.length && !finalText) return
      setIsSaving(true)
      try {
        const res = await api.post('/api/conversations', {
          segments:   finalSegments,
          extraction: finalInfo,
          duration,
          language:   detectedLang.current,
        })
        setSavedId(res.data.conversation_id)
        toast('Session saved to history', 'success')
      } catch {
        toast('Could not save session to history', 'error')
      } finally {
        setIsSaving(false)
      }
    }

    run()
    return () => URL.revokeObjectURL(url)
  }, [recording, chunks])

  const handleClear = () => {
    setSegments([])
    setRawText('')
    setInfo(null)
    setNoOllama(false)
    setStatusMsg(null)
    setSavedId(null)
    setIsSaving(false)
    reset()
  }

  const handleStart = () => {
    recordStartRef.current = Date.now()
    reset()
    start()
  }

  const recordState = transcribing || isSaving
    ? 'processing'
    : recording
    ? 'recording'
    : 'idle'

  const hasResult = segments.length > 0 || rawText

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────── */}
        <header className="shrink-0 border-b border-white/8 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg text-white">Record & Extract</h1>
            <p className="text-xs text-slate-500 mt-0.5">Record audio → transcribe → AI medical extraction</p>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Badge variant="processing" dot>Saving…</Badge>}
            {savedId && !isSaving && (
              <Badge variant="success">
                <CheckCircle2 size={11} className="mr-1" />
                Saved
              </Badge>
            )}
            {hasResult && !isSaving && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <RotateCcw size={13} />
                Clear
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">

          {/* ── Record card ─────────────────────────────── */}
          <Card variant="elevated" className="p-6">
            <div className="flex flex-col items-center gap-6">
              <RecordButton
                state={recordState}
                onClick={recording ? stop : handleStart}
              />

              <div className="w-full">
                <Waveform active={recording} />
              </div>

              {permissionError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 w-full text-center">
                  {permissionError}
                </p>
              )}
              {statusMsg && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 w-full text-center">
                  {statusMsg}
                </p>
              )}

              {/* Playback — only visible after recording */}
              {hasResult && (
                <audio ref={audioRef} className="w-full h-10 rounded-xl" controls />
              )}
            </div>
          </Card>

          {/* ── Transcript ──────────────────────────────── */}
          {(hasResult || transcribing) && (
            <Card variant="elevated">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <h2 className="font-semibold text-white text-sm">Transcript</h2>
                <div className="flex items-center gap-2">
                  {transcribing && <Badge variant="default" dot>Transcribing…</Badge>}
                  {isSaving     && <Badge variant="processing" dot>Saving…</Badge>}
                  {savedId && !isSaving && (
                    <a
                      href={`/app/sessions/${savedId}`}
                      className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      <Save size={11} />
                      View in History
                    </a>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 space-y-3 min-h-[80px]">
                {transcribing && !segments.length && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    Processing audio with Whisper…
                  </div>
                )}
                {segments.length > 0
                  ? segments.map((s, i) => (
                      <SpeakerBubble key={i} speaker={s.speaker} text={s.text} />
                    ))
                  : rawText && (
                      <p className="text-sm text-slate-300 leading-relaxed">{rawText}</p>
                    )
                }
              </div>
            </Card>
          )}

          {/* ── Extracted fields ────────────────────────── */}
          {(extracting || info || noOllama) && (
            <Card variant="elevated">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Brain size={15} className="text-brand-400" />
                  AI Medical Extraction
                </h2>
                {extracting && <Badge variant="default" dot>Extracting…</Badge>}
                {!extracting && info && <Badge variant="success">Complete</Badge>}
              </div>

              <div className="p-5">
                {/* Ollama unavailable */}
                {noOllama && !extracting && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Brain size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Ollama not running</p>
                      <p className="text-xs text-amber-400/70 mt-1">
                        Start it with: <code className="bg-black/20 px-1 rounded">ollama serve</code> then
                        pull the model: <code className="bg-black/20 px-1 rounded">ollama pull phi3:mini</code>
                      </p>
                    </div>
                  </div>
                )}

                {/* Loading skeleton */}
                {extracting && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className={`h-20 rounded-xl bg-white/4 animate-pulse ${i >= 4 ? 'col-span-2' : ''}`} />
                    ))}
                  </div>
                )}

                {/* Fields */}
                {info && !extracting && (
                  <div className="space-y-4">
                    {/* Demographics row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {DEMO_FIELDS.map(({ key, label, icon: Icon }) => (
                        <div key={key} className="p-4 rounded-xl bg-white/4 border border-white/8">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon size={12} className="text-slate-500" />
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
                          </div>
                          <p className="text-sm font-medium text-white truncate">
                            {info[key as keyof ExtractedInfo] || '—'}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Clinical row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {CLINICAL_FIELDS.map(({ key, label, icon: Icon }) => (
                        <div key={key} className="p-4 rounded-xl bg-brand-500/8 border border-brand-500/15">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon size={13} className="text-brand-400" />
                            <span className="text-[10px] font-semibold text-brand-400 uppercase tracking-wide">{label}</span>
                          </div>
                          <p className="text-base font-semibold text-brand-200">
                            {info[key as keyof ExtractedInfo] || '—'}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    <div className="p-4 rounded-xl bg-white/4 border border-white/8">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileText size={12} className="text-slate-500" />
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Additional Notes</span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {info.AdditionalNotes || 'No additional notes.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── Empty state ──────────────────────────────── */}
          {!hasResult && !transcribing && (
            <div className="text-center py-16 text-slate-500">
              <Mic size={36} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">Press the button above to start recording</p>
              <p className="text-xs mt-1 opacity-60">Whisper transcribes · phi3:mini extracts medical data</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
