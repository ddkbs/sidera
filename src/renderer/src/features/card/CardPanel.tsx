import { recordCardPatch } from '@/lib/undo-actions'
import { recordDelete } from '@/lib/undo-actions'
import { ArrowUpRight, Link2, LayoutDashboard, MoreHorizontal, PanelLeft, Trash2, X } from '@/components/icons'
import { DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { useAddObjectMutation, useDeleteCardMutation, useGetCardQuery, useListWhiteboardsQuery, useUpdateCardMutation } from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import { CardEditor } from './CardEditor'
import { AppearancePicker } from './AppearancePicker'
import { CardIcon } from '@/components/CardIcon'
import { color as paletteColor } from '@/lib/colors'
import { PropertyList } from './PropertyList'
import { TagPicker } from './TagPicker'
import { storageKey } from '@/lib/storage'

const DOCK_KEY = storageKey('sidera.card.dock')

/**
 * The card window. By default a centered overlay (~900px) over the whole app; the
 * "Dock to the right" option puts it back in the old side-panel position.
 */
export function CardPanel({ cardId }: { cardId: string }) {
  const dispatch = useAppDispatch()
  const { data: card, isLoading } = useGetCardQuery(cardId)
  const [update] = useUpdateCardMutation()
  const [remove] = useDeleteCardMutation()
  const [addObject] = useAddObjectMutation()
  const { data: boards = [] } = useListWhiteboardsQuery()
  const [title, setTitle] = useState('')
  const [docked, setDocked] = useState(() => localStorage.getItem(DOCK_KEY) === 'right')

  useEffect(() => {
    if (card) setTitle(card.title)
    // only when switching cards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id])

  const close = useCallback(() => dispatch(openCard(null)), [dispatch])

  useEffect(() => {
    // Let nested dialogs/popovers (appearance picker, tag menu, …) swallow Escape first.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog]:not([data-card-modal])') && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const toggleDock = () => {
    setDocked((d) => {
      localStorage.setItem(DOCK_KEY, d ? 'center' : 'right')
      return !d
    })
  }

  const header = (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
      <span className="px-2 text-xs text-muted-foreground">{t('task.card')}</span>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('card.more')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(cardId)
              toast.success(t('card.idCopied'))
            }}
          >
            <Link2 /> {t('card.copyId')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleDock}>
            <PanelLeft className="rotate-180" /> {docked ? t('card.center') : t('card.dock')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LayoutDashboard /> {t('card.addToBoard')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {boards.length === 0 && <DropdownMenuItem disabled>{t('card.noBoards')}</DropdownMenuItem>}
              {boards.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={async () => {
                    const detail = await window.api.getWhiteboard(b.id)
                    const objs = detail?.objects ?? []
                    const x = objs.length ? Math.max(...objs.map((o) => o.x + o.width)) + 60 : 0
                    const y = objs.length ? Math.min(...objs.map((o) => o.y)) : 0
                    await addObject({ whiteboardId: b.id, kind: 'card', refId: cardId, x, y })
                    toast.success(t('card.addedTo', { name: b.name }), { action: { label: t('common.open'), onClick: () => dispatch(navigate({ type: 'whiteboard', id: b.id })) } })
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
              recordDelete('card', cardId)
            }}
          >
            <Trash2 /> {t('undo.deleteCard')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="size-7" onClick={close} aria-label={t('common.close')}>
        <X className="size-4" />
      </Button>
    </div>
  )

  const appearance = card && (
    <AppearancePicker
      color={card.color}
      icon={card.icon}
      onChange={(p) => {
        update({ id: card.id, ...p })
        recordCardPatch(card.id, t('undo.cardAppearance'), { color: card.color, icon: card.icon }, { color: card.color, icon: card.icon, ...p })
      }}
    >
      <button className="h-7 rounded-md px-2 text-xs text-muted-foreground opacity-0 transition group-hover/appearance:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
        {card.icon ? t('card.changeColor') : t('card.addIconColor')}
      </button>
    </AppearancePicker>
  )

  const aside = card && (card.backlinks.length > 0 || card.whiteboards.length > 0) && (
    <div className={cn('space-y-5 text-sm', docked ? 'mt-10 border-t pt-5' : 'w-60 shrink-0 border-l py-8 pr-8 pl-6')}>
      {card.whiteboards.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{t('card.onBoards')}</h4>
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
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{t('card.backlinks', { count: card.backlinks.length })}</h4>
          <div className="flex flex-col">
            {card.backlinks.map((b) => (
              <button
                key={b.cardId}
                onClick={() => dispatch(openCard(b.cardId))}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-accent"
              >
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{b.title || t('common.untitled')}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )

  const body =
    isLoading || !card ? (
      <div className="space-y-3 p-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    ) : (
      <div className={cn(docked ? 'px-8 pt-6 pb-16' : 'px-10 pt-8 pb-20')}>
        {card.color && <div className={cn('mb-5 h-1.5', docked ? '-mx-8 -mt-6' : '-mx-10 -mt-8')} style={{ background: paletteColor(card.color).border }} />}
        <div className="group/appearance mb-1 flex min-h-7 items-end gap-1">
          {card.icon && (
            <AppearancePicker
              color={card.color}
              icon={card.icon}
              onChange={(p) => {
                update({ id: card.id, ...p })
                recordCardPatch(card.id, t('undo.cardAppearance'), { color: card.color, icon: card.icon }, { color: card.color, icon: card.icon, ...p })
              }}
            >
              <button className="-ml-1 grid size-12 place-items-center rounded-lg text-4xl transition hover:bg-accent" aria-label={t('card.changeIcon')}>
                <CardIcon icon={card.icon} className="size-9" />
              </button>
            </AppearancePicker>
          )}
          {appearance}
        </div>
        <textarea
          value={title}
          rows={1}
          placeholder={t('common.untitled')}
          onChange={(e) => {
            setTitle(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onBlur={() => {
            if (title === card.title) return
            update({ id: card.id, title })
            recordCardPatch(card.id, t('undo.renameCard'), { title: card.title }, { title })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(document.querySelector('.card-panel-editor .ProseMirror') as HTMLElement | null)?.focus()
            }
          }}
          className={cn('w-full resize-none bg-transparent font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60', docked ? 'text-2xl' : 'text-[32px] leading-tight')}
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
        {docked && aside}
      </div>
    )

  if (docked) {
    return (
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        className="absolute inset-y-2 right-2 z-30 flex w-[min(560px,48vw)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/10"
      >
        {header}
        <ScrollArea className="min-h-0 flex-1">{body}</ScrollArea>
      </motion.aside>
    )
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={close}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('task.card')}
        data-card-modal=""
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className="relative flex max-h-[85vh] w-[min(900px,92vw)] flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl shadow-black/25"
      >
        {header}
        <div className="flex min-h-0 flex-1">
          <ScrollArea className="min-h-0 min-w-0 flex-1">{body}</ScrollArea>
          {aside && <ScrollArea className="min-h-0">{aside}</ScrollArea>}
        </div>
      </motion.div>
    </div>
  )
}
