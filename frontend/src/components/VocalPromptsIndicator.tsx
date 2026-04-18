import type { VocalPhase, VocalCommand } from '../hooks/useVocalPrompts'

interface VocalPromptsIndicatorProps {
  phase:     VocalPhase
  lastCmd:   VocalCommand | null
  lastHeard: string | null
  supported: boolean
}

const CMD_LABELS: Record<VocalCommand, string> = {
  start:            'Start',
  stop:             'Stop',
  pause:            'Pause',
  resume:           'Resume',
  generate_summary: 'Summary',
}

export function VocalPromptsIndicator({ phase, lastCmd, lastHeard, supported }: VocalPromptsIndicatorProps) {
  if (!supported || phase === 'off') return null

  const dotCls = {
    watching:  'bg-slate-500/70',
    listening: 'bg-brand-400 animate-pulse shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]',
    success:   'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]',
    error:     'bg-red-400',
  }[phase]

  const pill =
    phase === 'listening'
      ? { text: '🎤 Listening…',               cls: 'text-brand-200 bg-brand-500/20 border-brand-500/30'       }
    : phase === 'success' && lastCmd
      ? { text: `✓ ${CMD_LABELS[lastCmd]}`,     cls: 'text-emerald-200 bg-emerald-500/20 border-emerald-500/30' }
    : phase === 'error'
      ? { text: 'Not understood',               cls: 'text-red-200 bg-red-500/20 border-red-500/30'             }
    : null

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-1.5 pointer-events-none select-none">
      {/* Last heard — shows mic is working */}
      {lastHeard && phase === 'watching' && (
        <div className="text-[10px] text-slate-600 bg-black/30 border border-white/6 px-2 py-0.5 rounded-full max-w-[180px] truncate">
          heard: {lastHeard}
        </div>
      )}

      <div className="flex items-center gap-2">
        {pill && (
          <div className={`text-[11px] font-medium px-2.5 py-1 rounded-full border backdrop-blur-sm ${pill.cls}`}>
            {pill.text}
          </div>
        )}
        <div
          className={`h-3 w-3 rounded-full transition-all duration-300 ${dotCls}`}
          title={
            phase === 'watching'  ? 'Vocal prompts on — say "Audient [command]"' :
            phase === 'listening' ? 'Listening for command…' :
            phase === 'success'   ? `Done: ${lastCmd ?? ''}` : 'Not understood'
          }
        />
      </div>
    </div>
  )
}
