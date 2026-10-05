import { recordCardPatch } from '@/lib/undo-actions'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import { CardIcon } from '@/components/CardIcon'
import { color as paletteColor } from '@/lib/colors'
import { Expand, FileText } from '@/components/icons'
import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetCardQuery, useUpdateCardMutation } from '@/store/api'
import { openCard } from '@/store/ui'
import { CardEditor } from '@/features/card/CardEditor'
import { TagBadge } from '@/features/card/TagBadge'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { BLOCK_DEFAULT_SIZE } from '../textSize'
import { t, useLang } from '@/lib/i18n'

const MIN_H = 90
const MAX_H = 520

export const CardNode = memo(function CardNode({ id, data, selected }: NodeProps<ObjectNode>) {
  useLang()
  const dispatch = useAppDispatch()
  const card = data.card
  const rf = useReactFlow()
  const isOpen = useAppSelector((s) => s.ui.openCardId === card?.id)
  const [editing, setEditing] = useState(false)
  const tint = card?.color ? paletteColor(card.color) : null
  const root = useRef<HTMLDivElement>(null)
  const editTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(editTimer.current), [])

  // Cards grow with their content until the user resizes one by hand (that pins the height).
  const content = useRef<HTMLDivElement>(null)
  const autoSize = data.object.data?.autoSize !== false
  // text size (same presets as text blocks): scales the whole card content, so a smaller size also makes the card smaller
  const zoom = (Number(data.object.data?.fontSize) || BLOCK_DEFAULT_SIZE) / BLOCK_DEFAULT_SIZE
  useEffect(() => {
    const el = content.current
    if (!autoSize || editing || !el) return
    const fit = (): void => {
      const next = Math.min(Math.max(Math.ceil(el.scrollHeight) + 2, MIN_H), MAX_H)
      const current = rf.getNode(id)?.height
      if (current !== undefined && Math.abs(next - current) < 4) return
      rf.setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, height: next } : n)))
      persist([{ id, height: next }])
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [autoSize, editing, id, rf, card?.excerpt, card?.title, card?.tags.length])

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
      <div
        ref={root}
        /* single click on a selected card types inline, double-click opens the big card window;
           entering edit mode is deferred so the second click of a double-click is not swallowed */
        onClick={() => {
          if (!card || !selected) return
          clearTimeout(editTimer.current)
          editTimer.current = setTimeout(() => setEditing(true), 220)
        }}
        onDoubleClick={() => {
          if (!card) return
          clearTimeout(editTimer.current)
          setEditing(false)
          dispatch(openCard(card.id))
        }}
        className={cn(
          'group relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-4px_rgba(0,0,0,0.08)] transition-shadow',
          selected && 'ring-2 ring-brand/70',
          (isOpen || editing) && 'ring-2 ring-brand'
        )}
        style={{ ...(tint ? { background: `linear-gradient(${tint.bg}, ${tint.bg}), var(--card)`, borderColor: tint.border } : {}), ...(zoom !== 1 ? { zoom } : {}) }}
      >
        {card && (
          <button
            onClick={() => dispatch(openCard(card.id))}
            className="nodrag absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-md bg-card/80 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-accent hover:text-foreground"
            aria-label={t('task.openCard')}
          >
            <Expand className="size-3.5" />
          </button>
        )}
        {!card ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" /> {t('cardNode.missing')}
          </div>
        ) : editing ? (
          <InlineEditor cardId={card.id} />
        ) : (
          <div ref={content} className={cn('flex flex-col gap-1.5 p-4', autoSize ? 'shrink-0' : 'min-h-0 flex-1')}>
            <div className="flex items-start gap-1.5 pr-6">
              <CardIcon icon={card.icon} className="mt-0.5 size-[18px] text-[16px]" />
              <div className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
                {card.title || <span className="text-muted-foreground">{t('common.untitled')}</span>}
              </div>
            </div>
            {card.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <TagBadge key={t.id} tag={t} />
                ))}
              </div>
            )}
            <div
              className={cn(
                'pointer-events-none text-[13px] leading-relaxed text-muted-foreground',
                autoSize ? 'max-h-[460px] overflow-hidden' : 'min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
              )}
            >
              <CardPreview cardId={card.id} updatedAt={card.updatedAt} excerpt={card.excerpt} />
            </div>
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})

/** Read-only rich render of the card body (quotes, lists, headings, toggles, tables…); plain excerpt until it loads. */
function CardPreview({ cardId, updatedAt, excerpt }: { cardId: string; updatedAt: number; excerpt: string }) {
  const { data: card } = useGetCardQuery(cardId)
  if (!card) return <p className="whitespace-pre-line">{excerpt}</p>
  return (
    <CardEditor
      key={`${card.id}:${Math.max(updatedAt, card.updatedAt)}`}
      content={card.content}
      editable={false}
      placeholder=""
      onChange={() => undefined}
      className="min-h-0 [&_.prose-canvas]:text-[13px]"
    />
  )
}

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
        onBlur={() => {
          if (title === null || title === card.title) return
          update({ id: cardId, title })
          recordCardPatch(cardId, t('undo.renameCard'), { title: card.title }, { title })
        }}
        placeholder={t('common.untitled')}
        className="mb-1 bg-transparent pr-6 text-[15px] font-semibold tracking-tight outline-none"
      />
      <CardEditor
        key={card.id}
        content={card.content}
        autofocus
        className="text-sm [&_.prose-canvas]:text-[13px]"
        onChange={(content) => update({ id: cardId, content })}
      />
    </div>
  )
}
