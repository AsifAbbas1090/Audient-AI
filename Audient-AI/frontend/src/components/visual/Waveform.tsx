import { motion } from 'framer-motion'

type WaveformProps = {
  active?: boolean
  bars?: number
  className?: string
}

export function Waveform({ active = false, bars = 24, className }: WaveformProps) {
  const heights = Array.from({ length: bars }, () => Math.random() * 40 + 10)
  return (
    <div className={className}>
      <div className="flex items-end h-24 gap-1 opacity-80">
        {heights.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 8 }}
            animate={{ height: active ? [8, h, 12, h * 0.6, 8] : 8 }}
            transition={{ duration: 1.6, repeat: active ? Infinity : 0, delay: i * 0.02, ease: 'easeInOut' }}
            className="w-1 rounded bg-brand-500"
          />
        ))}
      </div>
    </div>
  )
}


