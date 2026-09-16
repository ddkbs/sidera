import { X } from '@/components/icons'
import { color } from '@/lib/colors'
import type { Tag } from '@shared/types'

export function TagBadge({ tag, onRemove }: { tag: Pick<Tag, 'name' | 'color'>; onRemove?: () => void }) {
  const c = color(tag.color)
  return (
    <span
      className="group/tag inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      #{tag.name}
      {onRemove && (
        <button onClick={onRemove} className="-mr-0.5 hidden rounded group-hover/tag:inline-flex" aria-label={`Remove ${tag.name}`}>
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
