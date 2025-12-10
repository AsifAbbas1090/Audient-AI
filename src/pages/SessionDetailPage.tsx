import { Sidebar } from '../components/ui/Sidebar'
import { useParams } from 'react-router-dom'
import { sessions, transcript, mockSummary } from '../data/mock'
import { Button } from '../components/ui/Button'

export default function SessionDetailPage() {
  const { id } = useParams()
  const session = sessions.find(s => s.id === id)

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">{session?.title ?? 'Session'}</h1>
                  <div className="text-xs text-slate-500">{session ? new Date(session.date).toLocaleString() : ''}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary">Export PDF</Button>
                  <Button variant="secondary">Export DOCX</Button>
                  <Button>Share</Button>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {transcript.map(line => (
                  <div key={line.id} className="text-sm">
                    <span className="font-semibold text-brand-700">{line.speaker}</span>
                    <span className="mx-2 text-xs text-slate-400">{line.time}</span>
                    <span className="text-slate-700 dark:text-slate-300">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside>
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Summary</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{mockSummary.essence}</p>
              <div className="mt-4">
                <div className="font-medium">Key Entities</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {mockSummary.entities.map(e => (
                    <span key={e} contentEditable className="text-xs px-2 py-1 rounded-full bg-brand-100 text-brand-700">{e}</span>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="font-medium">Action Items</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {mockSummary.actionItems.map(a => (<li key={a}>{a}</li>))}
                </ul>
              </div>
              <div className="mt-4">
                <div className="font-medium">Decisions</div>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {mockSummary.decisions.map(d => (<li key={d}>{d}</li>))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}


