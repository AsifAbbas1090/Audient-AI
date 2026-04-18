import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../utils/cn'
import { motion } from 'framer-motion'
import React from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline'
type Size    = 'xs' | 'sm' | 'md' | 'lg' | 'icon'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?:  boolean
  variant?:  Variant
  size?:     Size
  glow?:     boolean
  loading?:  boolean
}

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-medium rounded-xl',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
  'focus-visible:ring-offset-[#0a0a0f] light:focus-visible:ring-offset-slate-50',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'theme-transition',
].join(' ')

const sizes: Record<Size, string> = {
  xs:   'h-7 px-3 text-xs rounded-lg',
  sm:   'h-9 px-4 text-sm',
  md:   'h-10 px-5 text-sm',
  lg:   'h-12 px-6 text-base',
  icon: 'h-10 w-10',
}

const variants: Record<Variant, string> = {
  primary:     'bg-brand-600 text-white hover:bg-brand-500 shadow-card light:shadow-soft',
  secondary:   'bg-white/8 text-slate-200 hover:bg-white/12 border border-white/10 hover:border-white/20 light:bg-slate-100 light:text-slate-800 light:border-slate-200 light:hover:bg-slate-200/80',
  ghost:       'text-slate-300 hover:bg-white/8 hover:text-white light:text-slate-600 light:hover:bg-slate-200/60 light:hover:text-slate-900',
  destructive: 'bg-red-600 text-white hover:bg-red-500',
  outline:     'border border-brand-500/50 text-brand-400 hover:bg-brand-500/10 hover:border-brand-500 light:border-brand-500/40',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { asChild, className, variant = 'primary', size = 'md', glow, loading, children, disabled, ...props },
    ref
  ) {
    const Comp: any = asChild ? Slot : motion.button
    const motionProps = asChild ? {} : {
      whileTap: { scale: 0.97 },
      whileHover: glow
        ? { boxShadow: '0 0 0 3px rgba(99,102,241,0.2), 0 8px 24px rgba(99,102,241,0.3)' }
        : undefined,
    }

    return (
      <Comp
        ref={ref as any}
        className={cn(base, sizes[size], variants[variant], className)}
        disabled={disabled || loading}
        {...motionProps}
        {...props}
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" />{children}</>
          : children
        }
      </Comp>
    )
  }
)
