import { Sidebar } from '../components/ui/Sidebar'
import { Button } from '../components/ui/Button'
import { Waveform } from '../components/visual/Waveform'
import { Mic, Pause, Square, Languages, Flag, Star } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import axios from 'axios'

export default function LiveSessionPage() {
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [transcripts, setTranscripts] = useState<{ id: number, speaker: string, text: string }[]>([])
  const [processing, setProcessing] = useState(false)

  const { recording, start, stop, reset, getBlob, chunks, permissionError } = useMediaRecorder({ mimeType: 'audio/webm' })

  useEffect(() => {
    if (!recording && chunks.length > 0) {
      const processAudio = async () => {
        setProcessing(true)
        const blob = getBlob('audio/webm')
        if (blob) {
          console.log(`Sending audio blob size: ${blob.size} bytes`);
          if (blob.size < 1000) {
            console.warn("Audio blob is suspiciously small. Mic might be failing.");
          }
          // Optional: Create a temporary URL if we want to play it back, but we just transcribe here.
          const form = new FormData()
          form.append('file', blob, 'speech.webm')
          // Construct URL based on current hostname to support mobile usage
          const apiHost = window.location.hostname;
          const apiUrl = `http://${apiHost}:5000/api/transcribe`;

          try {
            const res = await axios.post(apiUrl, form, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })
            const text = res.data.text
            if (text && text.trim().length > 0) {
              setTranscripts(prev => [...prev, {
                id: Date.now(),
                speaker: 'You', // In a real multi-speaker setup, this would be identified differently
                text: text
              }])
            } else {
              // Optional: Feedback for silence
              console.log("No speech detected")
            }
          } catch (err) {
            console.error("Transcription failed", err)
          }
        }
        setProcessing(false)
      }
      processAudio()
    }
  }, [recording, chunks])

  const toggle = () => {
    if (!active) {
      // Start Session
      setActive(true)
      setPaused(false)
      reset()
      start()
    }
    else if (!paused) {
      // Pause Session (Stop recording to transcribe current chunk)
      setPaused(true)
      stop()
    }
    else {
      // Resume Session
      setPaused(false)
      reset()
      start()
    }
  }

  const handleStop = () => {
    setActive(false)
    setPaused(false)
    stop()
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Live Session</h1>
                <div className="flex gap-2">
                  <Button variant="secondary"><Languages size={16} className="mr-2" /> Translate</Button>
                  <Button variant="secondary"><Flag size={16} className="mr-2" /> Mark</Button>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center">
                <div className={`h-24 w-24 rounded-full flex items-center justify-center shadow-soft ${active && !paused ? 'bg-brand-600 text-white ring-4 ring-brand-400/40 animate-pulse' : 'bg-white dark:bg-slate-800'}`}>
                  {!active ? <Mic /> : paused ? <Pause /> : <Mic />}
                </div>
                <div className="mt-3 flex gap-3">
                  <Button onClick={toggle} glow>{!active ? 'Start' : paused ? 'Resume' : 'Pause'}</Button>
                  <Button variant="secondary" onClick={handleStop}><Square className="mr-2" size={14} /> Stop</Button>
                </div>
                {permissionError && <div className="text-red-500 text-xs mt-2">{permissionError}</div>}
              </div>

              <div className="mt-8">
                <Waveform active={active && !paused} />
              </div>

              <div className="mt-8 space-y-3 relative min-h-[200px]">
                {transcripts.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-10">
                    {active ? 'Listening...' : 'Ready to start session'}
                  </div>
                )}
                {transcripts.map((t) => (
                  <div key={t.id} className="text-sm">
                    <span className="font-semibold text-brand-700">{t.speaker}:</span>
                    <span className="ml-2 text-slate-700 dark:text-slate-300">{t.text}</span>
                  </div>
                ))}
                {processing && (
                  <div className="text-sm text-slate-400 italic">Processing audio...</div>
                )}

                <div className="hidden md:block fixed bottom-8 right-8 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 backdrop-blur shadow-soft w-80">
                  <div className="text-sm font-semibold">Essence Summary</div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Real-time insights will appear here as the conversation unfolds.</p>
                </div>
              </div>
            </div>
          </section>
          <aside>
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Summary</h2>
                <Star size={16} className="text-brand-500" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Essence Summary: Real-time insights will appear here as the conversation unfolds.</p>
              <div className="mt-4">
                <div className="font-medium">Decisions</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  <li>—</li>
                </ul>
              </div>
              <div className="mt-4">
                <div className="font-medium">Action Items</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  <li>—</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}


