import { Mic, Square, Loader2, Pause } from 'lucide-react'
import { cn } from '../../utils/cn'

type RecordState = 'idle' | 'recording' | 'paused' | 'processing'

type RecordButtonProps = {
  state:     RecordState
  onClick:   () => void
  className?: string
  size?:     'md' | 'lg'
}

const icons: Record<RecordState, React.ReactNode> = {
  idle:       <Mic size={28} />,
  recording:  <Square size={22} className="fill-current" />,
  paused:     <Pause size={24} />,
  processing: <Loader2 size={24} className="animate-spin" />,
}

const labels: Record<RecordState, string> = {
  idle:       'Start Recording',
  recording:  'Stop',
  paused:     'Paused',
  processing: 'Processing…',
}

export function RecordButton({ state, onClick, className, size = 'lg' }: RecordButtonProps) {
  const isRecording = state === 'recording'
  const btnSize     = size === 'lg' ? 'h-24 w-24' : 'h-16 w-16'
  const ringSize    = size === 'lg' ? 'h-24 w-24' : 'h-16 w-16'

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative flex items-center justify-center">
        {/* Ripple rings — only when recording */}
        {isRecording && (
          <>
            <span className={cn('absolute rounded-full bg-red-500/20', ringSize, 'animate-ping-slow')} />
            <span className={cn('absolute rounded-full bg-red-500/10', ringSize, 'animate-ping-slower')} />
          </>
        )}

        <button
          onClick={onClick}
          disabled={state === 'processing'}
          className={cn(
            'relative z-10 rounded-full flex items-center justify-center',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0a0f] light:focus-visible:ring-offset-slate-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200 active:scale-95',
            btnSize,
            isRecording
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_0_1px_rgba(239,68,68,0.3),0_8px_32px_rgba(239,68,68,0.4)]'
              : state === 'processing'
              ? 'bg-surface-50 border border-white/10 text-slate-400'
              : 'bg-brand-600 hover:bg-brand-500 text-white shadow-glow hover:shadow-glow-lg'
          )}
        >
          {icons[state]}
        </button>
      </div>

      <span className="text-sm text-slate-400 font-medium">{labels[state]}</span>
    </div>
  )
}
