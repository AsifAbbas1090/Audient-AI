import { Sidebar } from '../components/ui/Sidebar'
import { Button } from '../components/ui/Button'
import { useEffect, useRef, useState } from 'react'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import axios from 'axios'

export default function ASRPage() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const { recording, start, stop, reset, getBlob, permissionError, chunks } = useMediaRecorder({ mimeType: 'audio/webm' })
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /* New State for extracted info */
  const [info, setInfo] = useState<{ Name: string | null, Age: string | null, Gender: string | null, Disease: string | null, Education: string | null, EmotionalState: string | null, AdditionalNotes: string | null } | null>(null);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (!recording && chunks.length) {
      const blob = getBlob('audio/webm')
      if (blob) {
        const url = URL.createObjectURL(blob)
        if (audioRef.current) audioRef.current.src = url

          ; (async () => {
            setLoading(true)
            setInfo(null) // Reset info
            try {
              const form = new FormData()
              form.append('file', blob, 'speech.webm')
              // Construct URL based on environment variable or current hostname
              const apiBase = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;
              const apiUrl = `${apiBase}/api/transcribe`;
              console.log(`Sending audio to: ${apiUrl}`);

              const res = await axios.post(apiUrl, form, { headers: { 'Content-Type': 'multipart/form-data' } })
              const transcribedText = res.data.text || ''
              setText(transcribedText)

              if (transcribedText) {
                // Now extract info
                setExtracting(true)
                try {
                  const extractUrl = `${apiBase}/api/extract`;
                  console.log(`Calling extraction: ${extractUrl} with text: ${transcribedText.substring(0, 50)}...`);
                  const extractRes = await axios.post(extractUrl, { text: transcribedText }, { headers: { 'Content-Type': 'application/json' } })
                  console.log("Extraction result:", extractRes.data);
                  setInfo(extractRes.data)
                } catch (ex) {
                  console.error("Extraction failed", ex)
                } finally {
                  setExtracting(false)
                }
              }

            } catch {
              setText('Error transcribing audio')
            } finally {
              setLoading(false)
            }
          })()

        // Cleanup function to revoke ObjectURL when effect re-runs or component unmounts
        return () => {
          URL.revokeObjectURL(url)
        }
      }
    }
  }, [recording, chunks])

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
          <h1 className="text-xl font-semibold">Live English Transcription</h1>
          <div className="mt-6 flex flex-col items-center">
            <div className="w-full h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
              {permissionError ? permissionError : (recording ? 'Recording…' : 'Idle')}
            </div>
            <div className="mt-4 flex gap-3">
              {!recording ? (
                <Button glow onClick={() => { reset(); start() }}>Start Recording</Button>
              ) : (
                <Button glow onClick={() => stop()}>Stop Recording</Button>
              )}
              <Button variant="secondary" onClick={() => { setText(''); setInfo(null); reset(); }}>Clear</Button>
            </div>
            <div className="mt-6 w-full">
              <div className="text-sm text-slate-500 mb-2">Transcription</div>
              <div className="min-h-[96px] p-4 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                {loading ? 'Transcribing…' : text || '—'}
              </div>
              <audio ref={audioRef} className="mt-3 w-full" controls />

              {/* Extracted Info Section */}
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Extracted Information</h2>
                {extracting && <div className="text-sm text-brand-500 animate-pulse mb-4">Extracting details...</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* --- Row 1: Demographics (White Cards) --- */}
                  {[
                    { label: 'Name', value: info?.Name },
                    { label: 'Age', value: info?.Age },
                    { label: 'Gender', value: info?.Gender },
                    { label: 'Education', value: info?.Education },
                  ].map((item, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                      <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">{item.label}</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate" title={item.value || ''}>{item.value || '—'}</div>
                    </div>
                  ))}

                  {/* --- Row 2: Clinical & Emotional (Highlighted Cards) --- */}

                  {/* Disease / Condition */}
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-brand-50/50 border border-brand-100 dark:bg-brand-900/10 dark:border-brand-800 shadow-sm transition-all hover:shadow-md">
                    <div className="text-xs text-brand-600 dark:text-brand-400 uppercase font-bold tracking-wider mb-2">Disease / Condition</div>
                    <div className="text-lg font-medium text-brand-700 dark:text-brand-300">
                      {info?.Disease || '—'}
                    </div>
                  </div>

                  {/* Emotional State */}
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-brand-50/50 border border-brand-100 dark:bg-brand-900/10 dark:border-brand-800 shadow-sm transition-all hover:shadow-md">
                    <div className="text-xs text-brand-600 dark:text-brand-400 uppercase font-bold tracking-wider mb-2">Emotional State</div>
                    <div className="text-lg font-medium text-brand-700 dark:text-brand-300">
                      {info?.EmotionalState || '—'}
                    </div>
                  </div>

                  {/* --- Row 3: Notes (Highlighted Card) --- */}

                  {/* Additional Notes */}
                  <div className="lg:col-span-4 md:col-span-2 p-5 rounded-2xl bg-brand-50/50 border border-brand-100 dark:bg-brand-900/10 dark:border-brand-800 shadow-sm transition-all hover:shadow-md">
                    <div className="text-xs text-brand-600 dark:text-brand-400 uppercase font-bold tracking-wider mb-2">Additional Notes / Unstructured Data</div>
                    <p className="text-sm text-brand-800 dark:text-brand-200 leading-relaxed whitespace-pre-wrap">
                      {info?.AdditionalNotes || 'No additional notes provided.'}
                    </p>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}


