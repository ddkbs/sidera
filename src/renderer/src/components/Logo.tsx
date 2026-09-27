import { APP_NAME } from '@shared/brand'
import { cn } from '@/lib/utils'

/** The app mark (mirrors build/logo-mark.svg): an "S" traced from a star to a node. Drawn in currentColor. */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden className={className}>
      <path d="M53 21H41A15.5 15.5 0 0 0 41 52A15.5 15.5 0 0 1 41 83H27" stroke="currentColor" strokeWidth={7.5} strokeLinecap="round" />
      <circle cx={27} cy={83} r={9} fill="currentColor" />
      <path
        d="M68 4C69.19 15.56 73.44 19.81 85 21C73.44 22.19 69.19 26.44 68 38C66.81 26.44 62.56 22.19 51 21C62.56 19.81 66.81 15.56 68 4Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Brand mark; `withWordmark` adds the product name beside it (the mark then scales with the font size). */
export function Logo({ className, withWordmark = false }: { className?: string; withWordmark?: boolean }) {
  if (!withWordmark) return <Mark className={className} />
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold tracking-tight', className)}>
      <Mark className="size-[1.3em] shrink-0" />
      {APP_NAME}
    </span>
  )
}

/** The mark on the dark app-icon tile, for places that stand in for the app icon (About). */
export function LogoTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[22.5%] bg-linear-to-b from-[#2c2c31] to-[#0a0a0c] text-white shadow-sm ring-1 ring-black/5 ring-inset dark:ring-white/10',
        className
      )}
    >
      <Mark className="size-[68%]" />
    </div>
  )
}
