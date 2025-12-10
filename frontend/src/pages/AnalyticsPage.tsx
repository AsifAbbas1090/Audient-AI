import { Sidebar } from '../components/ui/Sidebar'

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="text-sm text-slate-500">Sessions this month</div>
              <div className="text-4xl font-extrabold mt-1">32</div>
            </div>
            <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 shadow-soft">
              <div className="text-sm text-slate-500">Average summary confidence</div>
              <div className="text-4xl font-extrabold mt-1">93%</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}


