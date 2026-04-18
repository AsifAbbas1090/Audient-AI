import { cn } from '../../utils/cn'

type ToggleProps = {
  checked:   boolean
  onChange:  (val: boolean) => void
  label?:    string
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <label className={cn('inline-flex items-center gap-3 cursor-pointer select-none', disabled && 'opacity-40 cursor-not-allowed', className)}>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] light:focus-visible:ring-offset-slate-50',
          checked ? 'bg-brand-600' : 'bg-white/10 light:bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-5'
          )}
        />
      </button>
      {label && <span className="text-sm text-slate-300 light:text-slate-700">{label}</span>}
    </label>
  )
}
