import { cn } from '../../utils/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'offline' | 'processing'

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
  dot?: boolean
}

const variants: Record<BadgeVariant, string> = {
  default:    'bg-slate-800 text-slate-300 border-slate-700',
  success:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error:      'bg-red-500/10 text-red-400 border-red-500/20',
  offline:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  processing: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
}

const dotColors: Record<BadgeVariant, string> = {
  default:    'bg-slate-400',
  success:    'bg-emerald-400',
  warning:    'bg-amber-400 animate-pulse',
  error:      'bg-red-400',
  offline:    'bg-slate-500',
  processing: 'bg-brand-400 animate-pulse',
}

export function Badge({ variant = 'default', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColors[variant])} />}
      {children}
    </span>
  )
}
