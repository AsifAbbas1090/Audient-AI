import { Sidebar } from '../components/ui/Sidebar'
import { sessions } from '../data/mock'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../shared/Input'
import { Search } from 'lucide-react'

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Sessions</h1>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input placeholder="Search sessions..." className="pl-9" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            {sessions.map(s => (
              <a key={s.id} href={`/session/${s.id}`}>
                <Card className="hover:shadow-soft">
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{s.title}</div>
                        <div className="text-xs text-slate-500 mt-1">{new Date(s.date).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-1">
                        {s.tags.map(t => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{t}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 line-clamp-2">{s.summary}</p>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}


