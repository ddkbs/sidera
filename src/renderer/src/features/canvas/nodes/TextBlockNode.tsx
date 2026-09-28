import type { NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { docToText } from '@shared/doc'
import type { DocJSON, TextBlockStyle } from '@shared/types'
import { Expand } from '@/components/icons'
import { color as paletteColor } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { api, useGetCardQuery, useUpdateCardMutation } from '@/store/api'
import { openCard } from '@/store/ui'
import { CardEditor } from '@/features/card/CardEditor'
import type { ObjectNode } from '../types'
import { Handles } from './NodeChrome'
import { useAutoHeight, WidthResizer } from './autoHeight'
import { useEditMode } from './useEditMode'

export const blockStyle = (data: Record<string, unknown> | undefined): TextBlockStyle => (data?.style === 'framed' ? 'framed' : 'plain')

/**
 * A text block: a card of kind 'block' shown as lightweight rich text directly on the board.
 * Click a selected block (or double-click) to type; the height follows the content, the width is resizable.
 * Leaving an empty block removes it again, so trying out a block leaves nothing behind.
 */
export const TextBlockNode = memo(function TextBlockNode({ id, data, selected, height }: NodeProps<ObjectNode>) {
  const dispatch = useAppDispatch()
  const summary = data.card!
  const { data: card } = useGetCardQuery(summary.id)
  const [update] = useUpdateCardMutation()
  const style = blockStyle(data.object.data)
  const tint = summary.color ? paletteColor(summary.color) : null
  const latest = useRef<DocJSON | null>(null)
  // what was just typed, shown until the refetched card catches up (avoids flashing the old text)
  const [local, setLocal] = useState<DocJSON | null>(null)
  useEffect(() => setLocal(null), [card?.updatedAt])
  const editTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(editTimer.current), [])

  const { editing, setEditing, root } = useEditMode(
    selected,
    () => {
      const text = latest.current ? docToText(latest.current) : summary.excerpt
      latest.current = null
      if (text.trim()) return
      // nothing written: take the block away again (card + placement), no undo entry needed
      void (async () => {
        await window.api.removeObjects([id])
        await window.api.deleteCard(summary.id)
        dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: data.object.whiteboardId }]))
      })()
    },
    !!data.autoEdit
  )

  const content = useRef<HTMLDivElement>(null)
  useAutoHeight(id, content, height, 36)

  return (
    <>
      <WidthResizer selected={selected && !editing} minWidth={140} />
      <div
        ref={root}
        onClick={() => {
          if (!selected || editing) return
          clearTimeout(editTimer.current)
          editTimer.current = setTimeout(() => setEditing(true), 200)
        }}
        onDoubleClick={() => {
          clearTimeout(editTimer.current)
          setEditing(true)
        }}
        className={cn(
          'group relative h-full w-full rounded-lg text-foreground transition-[box-shadow,background-color]',
          style === 'framed' ? 'border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-canvas hover:ring-1 hover:ring-border',
          selected && !editing && 'ring-2 ring-brand/60 hover:ring-brand/60',
          editing && 'ring-2 ring-brand/80 hover:ring-brand/80',
          editing ? 'nodrag nopan nowheel cursor-text' : 'cursor-default'
        )}
        style={tint ? { background: `linear-gradient(${tint.bg}, ${tint.bg}), var(${style === 'framed' ? '--card' : '--canvas'})`, borderColor: tint.border } : undefined}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            dispatch(openCard(summary.id))
          }}
          className="nodrag absolute top-1 -right-8 z-10 grid size-6 place-items-center rounded-md border bg-popover text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-foreground"
          aria-label="Open as card"
          title="Open as card"
        >
          <Expand className="size-3.5" />
        </button>
        <div ref={content} className={cn('text-block', style === 'framed' ? 'px-4 py-3' : 'px-2 py-1.5', !editing && 'pointer-events-none')}>
          {card && (
            <CardEditor
              key={editing ? 'edit' : `view-${card.updatedAt}-${local ? 'local' : 'stored'}`}
              content={(!editing && local) || card.content}
              editable={editing}
              autofocus={editing}
              placeholder="Type, or '/' for headings, lists, tables…"
              className="min-h-0"
              onChange={(doc) => {
                latest.current = doc
                setLocal(doc)
                void update({ id: summary.id, content: doc })
              }}
            />
          )}
        </div>
      </div>
      <Handles />
    </>
  )
})
