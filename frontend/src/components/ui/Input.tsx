import { cn } from '../../utils/cn'
import React from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?:  React.ReactNode
  error?: string
  label?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ icon, error, label, className, id, ...props }, ref) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'h-11 w-full rounded-xl text-sm',
              'bg-white/5 border border-white/10',
              'text-slate-100 placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
              'theme-transition',
              icon && 'pl-10',
              !icon && 'px-4',
              error && 'border-red-500/50 focus:ring-red-500',
              // light mode
              'light:bg-white light:border-slate-200 light:text-slate-900 light:placeholder:text-slate-400',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
