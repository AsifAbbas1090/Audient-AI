import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Mic, UserCheck, Languages, Brain, ShieldCheck,
  ArrowRight, WifiOff, Stethoscope, Scale, GraduationCap, FlaskConical,
  ChevronRight, Play,
} from 'lucide-react'

// ── Animation helpers ────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  whileInView:{ opacity: 1, y: 0  },
  viewport:   { once: true },
  transition: { duration: 0.5, delay, ease: 'easeOut' },
})

// ── Data ─────────────────────────────────────────────────────
const features = [
  {
    icon: UserCheck,
    title: 'Two-Speaker Diarization',
    desc:  'Automatically separates doctor and patient voices in real-time from a single microphone.',
    color: 'text-brand-400',
    bg:    'bg-brand-500/10 border-brand-500/20',
  },
  {
    icon: Languages,
    title: 'Any Language → English',
    desc:  'Whisper translates Urdu, Arabic, French and 90+ other languages to English instantly.',
    color: 'text-violet-400',
    bg:    'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Brain,
    title: 'AI Field Extraction',
    desc:  'Phi3:mini extracts Name, Age, Disease, Emotional State and more — fully offline.',
    color: 'text-emerald-400',
    bg:    'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy-First',
    desc:  'No internet required after setup. Audio never leaves your machine. HIPAA-conscious design.',
    color: 'text-amber-400',
    bg:    'bg-amber-500/10 border-amber-500/20',
  },
]

const steps = [
  {
    num:   '01',
    title: 'Record',
    desc:  'Click Start. One microphone captures both speakers in any language.',
  },
  {
    num:   '02',
    title: 'Transcribe & Diarize',
    desc:  'Whisper converts speech to text every 3 seconds. Pyannote labels who said what.',
  },
  {
    num:   '03',
    title: 'Extract & Review',
    desc:  'Phi3:mini pulls structured medical fields from the transcript. Edit and export.',
  },
]

const useCases = [
  { icon: Stethoscope,  title: 'Healthcare',   desc: 'Patient intake, clinical notes, follow-up documentation.' },
  { icon: Scale,        title: 'Legal',        desc: 'Depositions, discovery interviews, client consultations.'  },
  { icon: GraduationCap, title: 'Education',   desc: 'Research interviews, thesis recordings, academic sessions.' },
  { icon: FlaskConical, title: 'Research',     desc: 'Field studies, structured interviews, qualitative analysis.' },
]

// Mock transcript lines for hero preview
const mockLines = [
  { speaker: 'Doctor',  text: 'How long have you been experiencing these symptoms?', s2: false },
  { speaker: 'Patient', text: 'About three weeks now. The pain gets worse at night.',  s2: true  },
  { speaker: 'Doctor',  text: 'Any fever or chills accompanying the pain?',            s2: false },
  { speaker: 'Patient', text: 'Yes, mild fever in the evenings around 37.8°C.',        s2: true  },
]

// ── Subcomponents ────────────────────────────────────────────
function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/6 bg-surface-400/80 backdrop-blur-xl light:bg-white/90 light:border-slate-200/90">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-glow">
            <Mic size={15} className="text-white" />
          </div>
          <span className="font-display font-bold text-white light:text-slate-900 text-sm">Audient AI</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#features"   className="hover:text-white light:hover:text-slate-900 transition-colors">Features</a>
          <a href="#how"        className="hover:text-white light:hover:text-slate-900 transition-colors">How it works</a>
          <a href="#usecases"   className="hover:text-white light:hover:text-slate-900 transition-colors">Use cases</a>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden sm:block text-sm text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium shadow-glow transition-colors"
          >
            Get started <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  )
}

function HeroPreview() {
  return (
    <motion.div
      {...fadeUp(0.4)}
      className="relative w-full max-w-2xl mx-auto mt-14"
    >
      {/* Glow behind card */}
      <div className="absolute inset-x-10 -top-6 h-32 bg-brand-500/20 blur-3xl rounded-full pointer-events-none" />

      {/* Card */}
      <div className="relative rounded-2xl border border-white/10 bg-surface-50/90 backdrop-blur-xl overflow-hidden shadow-glow-lg light:bg-white light:border-slate-200 light:shadow-soft">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/6 bg-white/3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/60"   />
            <div className="h-3 w-3 rounded-full bg-amber-500/60" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="h-5 rounded-md bg-white/5 border border-white/8 text-[10px] text-slate-500 flex items-center px-3">
              Live Session — Patient Intake
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-slate-500">Recording</span>
          </div>
        </div>

        {/* Transcript lines */}
        <div className="px-4 py-4 space-y-3">
          {mockLines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0  }}
              transition={{ delay: 0.6 + i * 0.25, duration: 0.4 }}
              className="flex items-start gap-2.5"
            >
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${
                line.s2
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
              }`}>
                {line.s2 ? 'PT' : 'DR'}
              </div>
              <div className="flex-1">
                <span className={`text-[10px] font-semibold ${line.s2 ? 'text-emerald-400' : 'text-brand-400'}`}>
                  {line.speaker}
                </span>
                <p className={`text-xs mt-0.5 leading-relaxed rounded-lg px-2.5 py-1.5 ${
                  line.s2
                    ? 'bg-emerald-500/5 border border-emerald-500/10 text-slate-300'
                    : 'bg-brand-500/5 border border-brand-500/10 text-slate-300'
                }`}>
                  {line.text}
                  {i === mockLines.length - 1 && (
                    <span className="inline-block w-0.5 h-3 bg-brand-400 ml-0.5 animate-blink align-text-bottom" />
                  )}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom extracted fields preview */}
        <div className="px-4 pb-4 pt-1 border-t border-white/6 bg-white/2">
          <div className="text-[10px] text-slate-500 mb-2 font-medium uppercase tracking-wider">AI Extracted</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Disease',        value: 'Viral fever'  },
              { label: 'Duration',       value: '3 weeks'      },
              { label: 'Temp',           value: '37.8°C'       },
              { label: 'Emotional State', value: 'Anxious'     },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-lg px-2.5 py-1">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{f.label}</span>
                <span className="text-[10px] text-slate-200">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-400 text-slate-100 overflow-x-hidden light:bg-slate-50 light:text-slate-900">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 bg-grid-dots bg-grid opacity-[0.07] pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-[500px] bg-glow-radial pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-brand-600/8 blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs text-brand-300 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Offline · Private · Real-time
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1 {...fadeUp(0.1)} className="font-display font-bold text-5xl md:text-6xl lg:text-7xl text-white light:text-slate-900 leading-[1.08] tracking-tight">
            Drop the pen.{' '}
            <span className="text-gradient">Capture</span>{' '}
            the conversation.
          </motion.h1>

          <motion.p {...fadeUp(0.2)} className="mt-6 text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
            Real-time two-speaker medical transcription with AI extraction —
            all running offline on your machine. No cloud. No compromise.
          </motion.p>

          {/* CTAs */}
          <motion.div {...fadeUp(0.3)} className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium shadow-glow hover:shadow-glow-lg transition-all duration-200"
            >
              <Mic size={16} />
              Start Recording Free
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-all duration-200"
            >
              <Play size={14} />
              See how it works
            </a>
          </motion.div>

          {/* Hero preview card */}
          <HeroPreview />
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">Features</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-white light:text-slate-900">
              Everything in one pipeline
            </h2>
            <p className="mt-3 text-slate-400 max-w-lg mx-auto">
              From raw audio to structured medical records — no internet, no subscriptions.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div key={f.title} {...fadeUp(i * 0.08)}>
                <div className="h-full rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/15 p-6 transition-all duration-200 group">
                  <div className={`h-11 w-11 rounded-xl border flex items-center justify-center mb-5 ${f.bg}`}>
                    <f.icon size={20} className={f.color} />
                  </div>
                  <h3 className="font-semibold text-white light:text-slate-900 text-sm mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section id="how" className="py-24 px-6 border-y border-white/6 bg-white/2">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-white light:text-slate-900">
              Three steps, zero friction
            </h2>
          </motion.div>

          <div className="relative grid md:grid-cols-3 gap-8">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px border-t border-dashed border-white/10 pointer-events-none" />

            {steps.map((s, i) => (
              <motion.div key={s.num} {...fadeUp(i * 0.12)} className="relative text-center">
                <div className="inline-flex h-16 w-16 rounded-2xl items-center justify-center bg-brand-600/20 border border-brand-500/30 mb-5 mx-auto">
                  <span className="font-display font-bold text-xl text-brand-400">{s.num}</span>
                </div>
                <h3 className="font-semibold text-white light:text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ─────────────────────────────────────── */}
      <section id="usecases" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">Use cases</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-white light:text-slate-900">
              Built for two-person conversations
            </h2>
            <p className="mt-3 text-slate-400 max-w-lg mx-auto">
              Any domain where two people talk and notes need to be taken.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {useCases.map((u, i) => (
              <motion.div key={u.title} {...fadeUp(i * 0.08)}>
                <div className="h-full rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-brand-500/20 p-6 transition-all duration-200 group">
                  <div className="h-12 w-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-5 group-hover:bg-brand-500/15 transition-colors">
                    <u.icon size={22} className="text-brand-400" />
                  </div>
                  <h3 className="font-semibold text-white light:text-slate-900 mb-2">{u.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{u.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            {...fadeUp()}
            className="relative rounded-3xl border border-brand-500/20 bg-brand-600/8 p-12 text-center overflow-hidden"
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-glow-radial opacity-50 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs text-brand-300 font-medium mb-6">
                <WifiOff size={11} />
                No internet required after setup
              </span>

              <h2 className="font-display font-bold text-3xl md:text-4xl text-white light:text-slate-900 mb-4 leading-tight">
                Ready to transcribe your first session?
              </h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">
                Set up takes under 5 minutes. All models run locally — your patients'
                conversations stay on your machine.
              </p>

              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium shadow-glow hover:shadow-glow-lg transition-all duration-200"
                >
                  Create free account
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-all duration-200"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-white/6 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <Mic size={13} className="text-white" />
            </div>
            <span className="font-display font-bold text-sm text-white light:text-slate-900">Audient AI</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
            <a href="#how"      className="hover:text-slate-300 transition-colors">How it works</a>
            <Link to="/login"   className="hover:text-slate-300 transition-colors">Sign in</Link>
          </div>

          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Audient AI · Academic FYP · All models run offline
          </p>
        </div>
      </footer>
    </div>
  )
}
