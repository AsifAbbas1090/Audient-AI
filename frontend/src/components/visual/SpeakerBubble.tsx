import { cn } from '../../utils/cn'

type SpeakerBubbleProps = {
  speaker:    string
  text:       string
  timestamp?: string
  className?: string
}

const isS2 = (s: string) =>
  s.toLowerCase().includes('2') || s.toLowerCase().includes('doctor')

export function SpeakerBubble({ speaker, text, timestamp, className }: SpeakerBubbleProps) {
  const s2 = isS2(speaker)

  return (
    <div className={cn('flex items-start gap-3 group', className)}>
      {/* Avatar */}
      <div className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
        s2
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
      )}>
        {s2 ? 'S2' : 'S1'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={cn('text-xs font-semibold', s2 ? 'text-emerald-400' : 'text-brand-400')}>
            {speaker}
          </span>
          {timestamp && (
            <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {timestamp}
            </span>
          )}
        </div>
        <p className={cn(
          'text-sm leading-relaxed rounded-xl px-3 py-2',
          s2
            ? 'bg-emerald-500/5 border border-emerald-500/10 text-slate-200'
            : 'bg-brand-500/5 border border-brand-500/10 text-slate-200'
        )}>
          {text}
        </p>
      </div>
    </div>
  )
}
