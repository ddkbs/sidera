import { cn } from '@/lib/utils'

/** The app mark (same shape as the dock icon), drawn in theme colors. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('size-10', className)}>
      <rect width="64" height="64" rx="16" className="fill-foreground" />
      <path d="M40.5 20.5H26a7 7 0 0 0-7 7v9a7 7 0 0 0 7 7h14.5" fill="none" strokeWidth="4.2" strokeLinecap="round" className="stroke-background" />
      <circle cx="40.8" cy="32" r="4.1" className="fill-background" />
    </svg>
  )
}
