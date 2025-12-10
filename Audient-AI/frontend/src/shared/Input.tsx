import { cn } from '../utils/cn'

type Props = React.InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn('h-11 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500', className)}
      {...props}
    />
  )
}


