import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/** Small animated orb used as AI/agent status indicator. `active` = an agent is working right now. */
export function Orb({ active, online, className }: { active: boolean; online: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-grid size-4 place-items-center', className)}>
      {active && (
        <motion.span
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#60a5fa,#a78bfa,#f472b6,#60a5fa)] blur-[3px]"
          animate={{ rotate: 360, scale: [1, 1.35, 1] }}
          transition={{ rotate: { repeat: Infinity, duration: 1.6, ease: 'linear' }, scale: { repeat: Infinity, duration: 1.2 } }}
        />
      )}
      <motion.span
        className={cn(
          'relative size-3 rounded-full',
          online ? 'bg-[radial-gradient(circle_at_30%_30%,#e0e7ff,#818cf8_45%,#6d28d9)]' : 'bg-muted-foreground/40'
        )}
        animate={active ? { rotate: 360 } : { scale: [1, 1.06, 1] }}
        transition={active ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : { repeat: Infinity, duration: 3 }}
      />
    </span>
  )
}
