import { GripVertical, Library, X } from '@/components/icons'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSearchQuery } from '@/store/api'
import { t } from '@/lib/i18n'

export const CARD_MIME = 'application/x-sidera-card'

/** Floating card library on the canvas. Drag cards onto the whiteboard. */
export function CardDrawer({ onBoard }: { onBoard: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { data = [] } = useSearchQuery(q, { skip: !open })
  const cards = data.filter((h) => h.kind === 'card' && h.cardKind !== 'block')

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'absolute top-3 right-3 z-10 flex h-9 items-center gap-2 rounded-xl border bg-popover/95 px-3 text-sm shadow-lg backdrop-blur transition hover:bg-accent',
              open && 'bg-accent'
            )}
          >
            <Library className="size-4" /> {t('task.cards')}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('drawer.hint')}</TooltipContent>
      </Tooltip>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-14 right-3 z-10 flex max-h-[min(560px,calc(100%-180px))] w-72 flex-col overflow-hidden rounded-xl border bg-popover shadow-xl"
          >
            <div className="flex items-center gap-2 border-b p-2">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('drawer.search')}
                className="h-8 flex-1 rounded-md bg-transparent px-2 text-sm outline-none"
              />
              <button onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label={t('common.close')}>
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {cards.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('drawer.none')}</p>}
              {cards.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CARD_MIME, c.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="group flex cursor-grab items-start gap-1.5 rounded-lg px-2 py-2 transition hover:bg-accent active:cursor-grabbing"
                >
                  <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.title || t('common.untitled')}</span>
                      {onBoard.has(c.id) && <span className="size-1.5 shrink-0 rounded-full bg-brand" title={t('find.onBoard')} />}
                    </div>
                    {c.snippet && <div className="line-clamp-2 text-xs text-muted-foreground">{c.snippet}</div>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
