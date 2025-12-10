import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../utils/cn'
import { motion } from 'framer-motion'
import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
}

const base = 'inline-flex items-center justify-center rounded-2xl font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed'
const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base'
}
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-500 shadow-soft',
  secondary: 'bg-white/70 text-slate-900 hover:bg-white border border-slate-200 shadow-soft dark:bg-slate-900/60 dark:text-white dark:border-slate-800',
  ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800',
  destructive: 'bg-red-600 text-white hover:bg-red-500'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ asChild, className, variant = 'primary', size = 'md', glow, children, ...props }, ref) {
  const Comp: any = asChild ? Slot : motion.button
  const glowClass = glow ? 'hover:ring-2 hover:ring-brand-500/30 hover:shadow-soft' : ''
  const motionProps = asChild ? {} : {
    whileTap: { scale: 0.98 },
    whileHover: glow ? { boxShadow: '0 0 0 3px rgba(99,102,241,0.15), 0 10px 30px rgba(99,102,241,0.35)' } : undefined
  }
  return (
    <Comp
      ref={ref as any}
      className={cn(base, sizes[size], variants[variant], glowClass, className)}
      {...motionProps}
      {...props}
    >
      {children}
    </Comp>
  )
})


