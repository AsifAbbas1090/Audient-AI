import { cn } from '../../utils/cn'

type CardVariant = 'default' | 'glass' | 'elevated' | 'flat'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant
  hover?:   boolean
}

const variants: Record<CardVariant, string> = {
  default:  'bg-white/5 border border-white/10 backdrop-blur-xl shadow-card',
  glass:    'bg-white/5 border border-white/8 backdrop-blur-2xl shadow-glow',
  elevated: 'bg-surface-50 border border-white/10 shadow-glow-lg',
  flat:     'bg-white/3 border border-white/6',
}

const lightVariants: Record<CardVariant, string> = {
  default:  'light:bg-white light:border-slate-200 light:shadow-soft',
  glass:    'light:bg-white/90 light:border-slate-200 light:backdrop-blur-xl',
  elevated: 'light:bg-white light:border-slate-200 light:shadow-soft',
  flat:     'light:bg-slate-50 light:border-slate-100',
}

export function Card({ variant = 'default', hover = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl theme-transition',
        variants[variant],
        lightVariants[variant],
        hover && 'hover:border-brand-500/30 hover:shadow-glow cursor-pointer transition-all duration-200 light:hover:border-brand-400/40 light:hover:shadow-soft',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pt-6 pb-4', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pb-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-white light:text-slate-900', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-slate-400 light:text-slate-600 mt-1', className)} {...props} />
}
