import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Brain, Languages, Quote, UserCheck, Wand2 } from 'lucide-react'

const features = [
  { icon: UserCheck, title: 'Speaker Identification', desc: 'Detect and color-code speakers in real-time.' },
  { icon: Languages, title: 'Real-time Translation', desc: 'Instant multilingual transcripts and captions.' },
  { icon: Wand2, title: 'Smart Summarization', desc: 'Concise summaries that capture decisions and actions.' },
  { icon: Brain, title: 'Entity Extraction', desc: 'Surface names, places, and key terms as you talk.' },
]

const useCases = [
  { title: 'Healthcare', image: 'https://source.unsplash.com/1600x900/?healthcare,doctor' },
  { title: 'Legal', image: 'https://source.unsplash.com/1600x900/?legal,court' },
  { title: 'Business', image: 'https://source.unsplash.com/1600x900/?business,meeting' },
  { title: 'Education', image: 'https://source.unsplash.com/1600x900/?education,lecture' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-hero relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute inset-0 bg-glow" />
      <header className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-soft">
            <Quote size={16} />
          </div>
          <div className="font-extrabold tracking-tight">Audient AI</div>
        </div>
        <nav className="flex items-center gap-4">
          <a className="text-sm text-slate-700 dark:text-slate-300 hover:underline" href="#features">Features</a>
          <a className="text-sm text-slate-700 dark:text-slate-300 hover:underline" href="#usecases">Use Cases</a>
          <a className="text-sm text-slate-700 dark:text-slate-300 hover:underline" href="#cta">Pricing</a>
          <Button asChild variant="secondary"><a href="/app">Dashboard</a></Button>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-5xl md:text-6xl font-extrabold tracking-tight"
          >
            Drop your pens.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-4 text-xl text-slate-600 dark:text-slate-300"
          >
            We capture the essence, not the noise.
          </motion.p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild glow>
              <a href="/live">Start Recording</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="#features">Learn More</a>
            </Button>
          </div>

          <div className="mt-12 flex items-center justify-center">
            <div className="w-full h-40 rounded-3xl bg-white/40 dark:bg-slate-900/40 backdrop-blur border border-slate-200/60 dark:border-slate-800 shadow-soft flex items-center justify-center">
              <span className="text-slate-500">Abstract soundwave visualization</span>
            </div>
          </div>
        </section>

        <section id="features" className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <Card>
                  <CardContent>
                    <div className="h-12 w-12 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center">
                      <f.icon />
                    </div>
                    <div className="mt-4 font-semibold">{f.title}</div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="usecases" className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((u, i) => (
              <motion.div key={u.title} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
                  <img alt={u.title} src={u.image} className="h-48 w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-3 left-4 text-white font-semibold">{u.title}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="cta" className="max-w-5xl mx-auto px-6 py-16 text-center">
          <Card>
            <CardContent className="py-10">
              <div className="text-2xl md:text-3xl font-bold">Try Audient AI – Turn Talk into Insight.</div>
              <p className="mt-2 text-slate-600 dark:text-slate-300">Start in seconds. No credit card needed.</p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button asChild glow>
                  <a href="/app">Get Started</a>
                </Button>
                <Button asChild variant="secondary">
                  <a href="/live">Start a Live Session</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 max-w-7xl mx-auto px-6 py-10 text-sm text-slate-500">
        © {new Date().getFullYear()} Audient AI. All rights reserved.
      </footer>
    </div>
  )
}


