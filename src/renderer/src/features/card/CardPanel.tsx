import { ArrowUpRight, Link2, LayoutDashboard, MoreHorizontal, Trash2, X } from '@/components/icons'
import { DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppDispatch } from '@/store'
import { useAddObjectMutation, useDeleteCardMutation, useGetCardQuery, useListWhiteboardsQuery, useUpdateCardMutation } from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import { CardEditor } from './CardEditor'
import { AppearancePicker } from './AppearancePicker'
import { CardIcon } from '@/components/CardIcon'
import { color as paletteColor } from '@/lib/colors'
import { PropertyList } from './PropertyList'
import { TagPicker } from './TagPicker'

export function CardPanel({ cardId }: { cardId: string }) {
  const dispatch = useAppDispatch()
  const { data: card, isLoading } = useGetCardQuery(cardId)
  const [update] = useUpdateCardMutation()
  const [remove] = useDeleteCardMutation()
  const [addObject] = useAddObjectMutation()
  const { data: boards = [] } = useListWhiteboardsQuery()
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (card) setTitle(card.title)
    // only when switching cards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog]') && dispatch(openCard(null))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const close = () => dispatch(openCard(null))

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className="absolute inset-y-2 right-2 z-30 flex w-[min(560px,48vw)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/10"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <span className="px-2 text-xs text-muted-foreground">Card</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(cardId)
                toast.success('Card id copied')
              }}
            >
              <Link2 /> Copy card id
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LayoutDashboard /> Add to whiteboard
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {boards.length === 0 && <DropdownMenuItem disabled>No whiteboards</DropdownMenuItem>}
                {boards.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={async () => {
                      const detail = await window.api.getWhiteboard(b.id)
                      const objs = detail?.objects ?? []
                      const x = objs.length ? Math.max(...objs.map((o) => o.x + o.width)) + 60 : 0
                      const y = objs.length ? Math.min(...objs.map((o) => o.y)) : 0
                      await addObject({ whiteboardId: b.id, kind: 'card', refId: cardId, x, y })
                      toast.success(`Added to ${b.name}`, { action: { label: 'Open', onClick: () => dispatch(navigate({ type: 'whiteboard', id: b.id })) } })
                    }}
                  >
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                close()
                await remove(cardId)
                toast('Card deleted')
              }}
            >
              <Trash2 /> Delete card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="size-7" onClick={close}>
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {isLoading || !card ? (
          <div className="space-y-3 p-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : (
          <div className="px-8 pt-6 pb-16">
            {card.color && <div className="-mx-8 -mt-6 mb-5 h-1.5" style={{ background: paletteColor(card.color).border }} />}
            <div className="group/appearance mb-1 flex min-h-7 items-end gap-1">
              {card.icon && (
                <AppearancePicker color={card.color} icon={card.icon} onChange={(p) => update({ id: card.id, ...p })}>
                  <button className="-ml-1 grid size-12 place-items-center rounded-lg text-4xl transition hover:bg-accent" aria-label="Change icon">
                    <CardIcon icon={card.icon} className="size-9" />
                  </button>
                </AppearancePicker>
              )}
              <AppearancePicker color={card.color} icon={card.icon} onChange={(p) => update({ id: card.id, ...p })}>
                <button className="h-7 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition group-hover/appearance:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                  {card.icon ? 'Change color' : 'Add icon & color'}
                </button>
              </AppearancePicker>
            </div>
            <textarea
              value={title}
              rows={1}
              placeholder="Untitled"
              onChange={(e) => {
                setTitle(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onBlur={() => title !== card.title && update({ id: card.id, title })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(document.querySelector('.card-panel-editor .ProseMirror') as HTMLElement | null)?.focus()
                }
              }}
              className="w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-2 mb-4">
              <TagPicker cardId={card.id} tags={card.tags} />
            </div>
            {card.properties.length > 0 && <PropertyList cardId={card.id} properties={card.properties} />}
            <CardEditor
              key={card.id}
              className="card-panel-editor"
              content={card.content}
              autofocus={!card.title && !card.contentText}
              onChange={(content) => update({ id: card.id, content })}
            />
            {(card.backlinks.length > 0 || card.whiteboards.length > 0) && (
              <div className="mt-10 space-y-5 border-t pt-5 text-sm">
                {card.whiteboards.length > 0 && (
                  <section>
                    <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">On whiteboards</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {card.whiteboards.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => dispatch(navigate({ type: 'whiteboard', id: w.id }))}
                          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition hover:bg-accent"
                        >
                          <LayoutDashboard className="size-3.5 text-muted-foreground" />
                          {w.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {card.backlinks.length > 0 && (
                  <section>
                    <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">Backlinks · {card.backlinks.length}</h4>
                    <div className="flex flex-col">
                      {card.backlinks.map((b) => (
                        <button
                          key={b.cardId}
                          onClick={() => dispatch(openCard(b.cardId))}
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-accent"
                        >
                          <ArrowUpRight className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{b.title || 'Untitled'}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </motion.aside>
  )
}
