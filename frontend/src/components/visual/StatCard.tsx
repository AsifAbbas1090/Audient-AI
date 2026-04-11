import { cn } from '../../utils/cn'
import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
  label:      string
  value:      string | number
  icon:       LucideIcon
  trend?:     { value: string; up: boolean }
  className?: string
  iconColor?: string
}

export function StatCard({ label, value, icon: Icon, trend, className, iconColor = 'text-brand-400' }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border border-white/8 bg-white/4 backdrop-blur p-5 flex items-start gap-4',
      className
    )}>
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center bg-white/5 shrink-0', iconColor)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold font-display text-white leading-none">{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
        {trend && (
          <div className={cn('text-xs font-medium mt-1.5', trend.up ? 'text-emerald-400' : 'text-red-400')}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </div>
        )}
      </div>
    </div>
  )
}
