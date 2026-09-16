import type { NodeProps } from '@xyflow/react'
import { FileText } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/lib/utils'
import { store } from '@/store'
import { openCard } from '@/store/ui'
import { TagBadge } from '@/features/card/TagBadge'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<ObjectNode>) {
  const card = data.card
  const isOpen = store.getState().ui.openCardId === card?.id
  return (
    <>
      <Resizer selected={selected} minWidth={180} minHeight={80} />
      <div
        onDoubleClick={() => card && store.dispatch(openCard(card.id))}
        className={cn(
          'group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-4px_rgba(0,0,0,0.08)] transition-shadow',
          selected && 'ring-2 ring-brand/70',
          isOpen && 'ring-2 ring-brand'
        )}
      >
        {card ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
            <div className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">{card.title || <span className="text-muted-foreground">Untitled</span>}</div>
            {card.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <TagBadge key={t.id} tag={t} />
                ))}
              </div>
            )}
            <p className="min-h-0 flex-1 overflow-hidden text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
              {card.excerpt}
            </p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" /> Missing card
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})
