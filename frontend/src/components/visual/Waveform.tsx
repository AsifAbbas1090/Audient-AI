import { cn } from '../../utils/cn'

type WaveformProps = {
  active?:    boolean
  speaker?:   1 | 2
  className?: string
}

const barAnims = [
  'animate-bar-1', 'animate-bar-2', 'animate-bar-3', 'animate-bar-4',
  'animate-bar-5', 'animate-bar-6', 'animate-bar-7', 'animate-bar-8',
  'animate-bar-1', 'animate-bar-3', 'animate-bar-5', 'animate-bar-2',
  'animate-bar-7', 'animate-bar-4', 'animate-bar-6', 'animate-bar-8',
  'animate-bar-2', 'animate-bar-5', 'animate-bar-1', 'animate-bar-7',
  'animate-bar-3', 'animate-bar-6', 'animate-bar-4', 'animate-bar-8',
  'animate-bar-5', 'animate-bar-1', 'animate-bar-3', 'animate-bar-7',
  'animate-bar-6', 'animate-bar-2', 'animate-bar-8', 'animate-bar-4',
]

// Idle heights as % of container (0–1)
const idleScale = [
  0.3, 0.5, 0.2, 0.6, 0.35, 0.55, 0.2, 0.65,
  0.4, 0.3, 0.5, 0.25, 0.45, 0.6, 0.35, 0.2,
  0.65, 0.4, 0.3, 0.5, 0.25, 0.45, 0.55, 0.35,
  0.2, 0.6, 0.4, 0.3, 0.5, 0.25, 0.45, 0.55,
]

export function Waveform({ active = false, speaker, className }: WaveformProps) {
  const activeColor = speaker === 2 ? 'bg-emerald-500' : 'bg-brand-500'
  const idleColor   = speaker === 2 ? 'bg-emerald-900/60' : 'bg-brand-900/60'

  return (
    <div className={cn('flex items-center justify-center h-14 gap-[3px]', className)}>
      {barAnims.map((anim, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] h-full rounded-full origin-center',
            active ? [activeColor, anim] : [idleColor, 'transition-transform duration-700']
          )}
          style={active ? undefined : { transform: `scaleY(${idleScale[i]})` }}
        />
      ))}
    </div>
  )
}
