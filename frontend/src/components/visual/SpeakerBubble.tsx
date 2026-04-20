import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'

type SpeakerBubbleProps = {
  speaker:      string
  text:         string
  timestamp?:   string
  className?:   string
  compact?:     boolean
  /** Label is still settling (first 30s) — renders grey/muted badge with a dot. */
  provisional?: boolean
  /** Show correction popup on click. Only pass true during a live session. */
  editable?:    boolean
  onCorrect?:   (action: 'doctor' | 'patient' | 'remove') => void
}

/** Patient-side labels (second speaker in diarization, or dedicated patient mic). */
export function isPatientSpeakerLabel(speaker: string): boolean {
  const l = speaker.toLowerCase()
  return (
    l.includes('patient')
    || /\bspeaker\s*2\b/.test(l)
    || l === 's2'
  )
}

/** Third-party speaker — family member, nurse, interpreter, etc. */
export function isThirdSpeakerLabel(speaker: string): boolean {
  const l = speaker.toLowerCase()
  return (
    /\bspeaker\s*[3-9]\b/.test(l)
    || l.includes('other')
    || l.includes('nurse')
    || l.includes('family')
    || l.includes('interpreter')
  )
}

export function SpeakerBubble({
  speaker, text, timestamp, className, compact,
  provisional = false, editable = false, onCorrect,
}: SpeakerBubbleProps) {
  const patientSide = isPatientSpeakerLabel(speaker)
  const thirdParty  = !patientSide && isThirdSpeakerLabel(speaker)
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // Close popup on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!popupRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const handleSelect = (action: 'doctor' | 'patient' | 'remove') => {
    setOpen(false)
    onCorrect?.(action)
  }

  // Avatar colours — grey when provisional, coloured when stable
  const avatarClass = provisional
    ? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    : patientSide
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : thirdParty
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        : 'bg-brand-500/20 text-brand-400 border-brand-500/30'

  // Text bubble
  const bubbleClass = provisional
    ? 'bg-white/3 border border-white/8 text-slate-400 light:bg-slate-50 light:border-slate-200 light:text-slate-600'
    : patientSide
      ? 'bg-emerald-500/5 border border-emerald-500/10 text-slate-200 light:text-slate-800'
      : thirdParty
        ? 'bg-amber-500/5 border border-amber-500/10 text-slate-200 light:text-slate-800'
        : 'bg-brand-500/5 border border-brand-500/10 text-slate-200 light:text-slate-800'

  return (
    <div className={cn('flex items-start gap-2 sm:gap-3 group relative', className)}>
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className={cn(
          'rounded-full flex items-center justify-center font-bold border',
          compact ? 'h-6 w-6 text-[9px]' : 'h-7 w-7 text-[10px] mt-0.5',
          avatarClass,
        )}>
          {patientSide ? 'Pt' : thirdParty ? 'Ot' : 'Dr'}
        </div>
        {/* Provisional dot — small grey pulsing indicator on the avatar */}
        {provisional && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-slate-500 border border-surface-400 animate-pulse" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-baseline gap-2 mb-1">
            <span className={cn(
              'text-xs font-semibold',
              provisional   ? 'text-slate-500'
              : patientSide ? 'text-emerald-400'
              : thirdParty  ? 'text-amber-400'
              :               'text-brand-400',
            )}>
              {speaker}
            </span>
            {provisional && (
              <span className="text-[9px] text-slate-600 italic">settling…</span>
            )}
            {timestamp && (
              <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                {timestamp}
              </span>
            )}
          </div>
        )}
        {compact && timestamp && (
          <span className="text-[10px] text-slate-500 mb-1 block">{timestamp}</span>
        )}

        {/* Text bubble — clickable when editable */}
        <p
          onClick={() => editable && setOpen(o => !o)}
          className={cn(
            'text-sm leading-relaxed rounded-xl px-3 py-2 transition-opacity',
            bubbleClass,
            editable && 'cursor-pointer hover:opacity-80 select-none',
          )}
        >
          {text}
        </p>
      </div>

      {/* One-tap correction popup */}
      {editable && open && (
        <div
          ref={popupRef}
          className="absolute left-8 top-8 z-50 bg-surface-300 light:bg-white border border-white/12 light:border-slate-200 rounded-xl shadow-2xl overflow-hidden min-w-[170px]"
        >
          <button
            onClick={() => handleSelect('doctor')}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-brand-300 hover:bg-brand-500/10 transition-colors"
          >
            <span className="h-2 w-2 rounded-full bg-brand-400 shrink-0" />
            This was me (Doctor)
          </button>
          <button
            onClick={() => handleSelect('patient')}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-emerald-300 hover:bg-emerald-500/10 transition-colors border-t border-white/6 light:border-slate-100"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
            This was patient
          </button>
          <button
            onClick={() => handleSelect('remove')}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/6 light:border-slate-100"
          >
            <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
            Remove this line
          </button>
        </div>
      )}
    </div>
  )
}
