import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { CardIcon } from '@/components/CardIcon'
import { PALETTE, color as paletteColor } from '@/lib/colors'
import { CARD_COLORS } from '@/features/card/AppearancePicker'
import { Expand, FileText } from '@/components/icons'
import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetCardQuery, useUpdateCardMutation } from '@/store/api'
import { openCard } from '@/store/ui'
import { CardEditor } from '@/features/card/CardEditor'
import { TagBadge } from '@/features/card/TagBadge'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<ObjectNode>) {
  const dispatch = useAppDispatch()
  const card = data.card
  const isOpen = useAppSelector((s) => s.ui.openCardId === card?.id)
  const [editing, setEditing] = useState(false)
  const [updateCard] = useUpdateCardMutation()
  const tint = card?.color ? paletteColor(card.color) : null
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (root.current?.contains(t) || t.closest('.mention-popup')) return
      setEditing(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(false)
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [editing])

  useEffect(() => {
    if (!selected) setEditing(false)
  }, [selected])

  return (
    <>
      <Resizer selected={selected} minWidth={180} minHeight={80} />
      {card && (
        <NodeToolbar isVisible={selected && !editing} position={Position.Top} offset={10}>
          <div className="flex items-center gap-1 rounded-full border bg-popover p-1 shadow-md">
            <button
              aria-label="Default color"
              onClick={() => updateCard({ id: card.id, color: null })}
              className={cn('size-5 rounded-full border bg-card', !card.color && 'ring-2 ring-foreground/40')}
            />
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                aria-label={c}
                onClick={() => updateCard({ id: card.id, color: c })}
                className={cn('size-5 rounded-full border', card.color === c && 'ring-2 ring-foreground/40')}
                style={{ background: PALETTE[c].border }}
              />
            ))}
          </div>
        </NodeToolbar>
      )}
      <div
        ref={root}
        onDoubleClick={() => card && setEditing(true)}
        className={cn(
          'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-4px_rgba(0,0,0,0.08)] transition-shadow',
          selected && 'ring-2 ring-brand/70',
          (isOpen || editing) && 'ring-2 ring-brand'
        )}
        style={tint ? { background: `linear-gradient(${tint.bg}, ${tint.bg}), var(--card)`, borderColor: tint.border } : undefined}
      >
        {card && (
          <button
            onClick={() => dispatch(openCard(card.id))}
            className="nodrag absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-md bg-card/80 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-accent hover:text-foreground"
            aria-label="Open card"
          >
            <Expand className="size-3.5" />
          </button>
        )}
        {!card ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" /> Missing card
          </div>
        ) : editing ? (
          <InlineEditor cardId={card.id} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
            <div className="flex items-start gap-1.5 pr-6">
              <CardIcon icon={card.icon} className="mt-0.5 size-[18px] text-[16px]" />
              <div className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">{card.title || <span className="text-muted-foreground">Untitled</span>}</div>
            </div>
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
        )}
      </div>
      <Handles />
    </>
  )
})

function InlineEditor({ cardId }: { cardId: string }) {
  const { data: card } = useGetCardQuery(cardId)
  const [update] = useUpdateCardMutation()
  const [title, setTitle] = useState<string | null>(null)
  if (!card) return null
  return (
    <div className="nodrag nowheel nopan flex min-h-0 flex-1 cursor-text flex-col overflow-y-auto p-4">
      <input
        value={title ?? card.title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== null && title !== card.title && update({ id: cardId, title })}
        placeholder="Untitled"
        className="mb-1 bg-transparent pr-6 text-[15px] font-semibold tracking-tight outline-none"
      />
      <CardEditor key={card.id} content={card.content} autofocus className="text-sm [&_.prose-canvas]:text-[13px]" onChange={(content) => update({ id: cardId, content })} />
    </div>
  )
}
