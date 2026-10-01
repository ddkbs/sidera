import { useVirtualizer } from '@tanstack/react-virtual'
import { CardIcon } from '@/components/CardIcon'
import { color as paletteColor } from '@/lib/colors'
import { Check, ChevronDown, Columns3, Hash, List, Plus, Table2, TextBlock } from '@/components/icons'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TagBadge } from '@/features/card/TagBadge'
import { TagMenu } from '@/features/card/TagMenu'
import { KanbanBoard } from '@/features/kanban/KanbanBoard'
import { color } from '@/lib/colors'
import { formatDate, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CardRowMenu } from './CardRowMenu'
import { TagTable } from './TagTable'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateCardMutation, useListCardsQuery, useListTagsQuery } from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import type { CardSummary, Tag } from '@shared/types'

export function LibraryView() {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const { data: tags = [] } = useListTagsQuery()
  const [createCard] = useCreateCardMutation()
  const [filter, setFilter] = useState('')
  const [includeBlocks, setIncludeBlocks] = useState(false)
  if (view.type !== 'library') return null
  const tag = tags.find((t) => t.id === view.tagId)
  const mode = view.mode === 'kanban' && !view.tagId ? 'table' : view.mode

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-8 pt-6 pb-4">
        <div className="min-w-0">
          {tag && (
            <button onClick={() => dispatch(navigate({ type: 'library', tagId: null, mode: view.mode }))} className="mb-0.5 text-xs text-muted-foreground hover:text-foreground">
              {t('sidebar.library')} /
            </button>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{tag ? `#${tag.name}` : t('sidebar.library')}</h1>
          <p className="text-sm text-muted-foreground">{tag ? t('library.taggedHint') : t('library.allHint')}</p>
        </div>
        <div className="flex-1" />
        {mode !== 'kanban' && !view.tagId && (
          <button
            onClick={() => setIncludeBlocks((v) => !v)}
            aria-pressed={includeBlocks}
            title={t('library.blocksHint')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition',
              includeBlocks ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {includeBlocks ? <Check className="size-3.5" /> : <TextBlock className="size-3.5" />} {t('library.includeBlocks')}
          </button>
        )}
        <TagFilterMenu tags={tags} activeTagId={view.tagId} mode={view.mode} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('library.filter')}
          className="h-8 w-48 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
        />
        <Tabs value={mode} onValueChange={(m) => dispatch(navigate({ ...view, mode: m as typeof view.mode }))}>
          <TabsList className="h-8">
            <TabsTrigger value="table" className="px-2"><Table2 /> {t('library.table')}</TabsTrigger>
            <TabsTrigger value="list" className="px-2"><List /> {t('library.list')}</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="kanban" className="px-2" disabled={!view.tagId}><Columns3 /> Kanban</TabsTrigger>
                </span>
              </TooltipTrigger>
              {!view.tagId && <TooltipContent>{t('library.kanbanHint')}</TooltipContent>}
            </Tooltip>
          </TabsList>
        </Tabs>
        <Button
          size="sm"
          onClick={async () => {
            const r = await createCard({ tagIds: view.tagId ? [view.tagId] : [] })
            if ('data' in r && r.data) dispatch(openCard(r.data.id))
          }}
        >
          <Plus /> {t('palette.newCard')}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'kanban' && view.tagId ? <KanbanBoard tagId={view.tagId} filter={filter} /> : mode === 'table' && view.tagId ? <TagTable tagId={view.tagId} filter={filter} /> : <CardCollection tagId={view.tagId} mode={mode === 'list' ? 'list' : 'table'} filter={filter} includeBlocks={includeBlocks} />}
      </div>
    </div>
  )
}

/** Compact tag picker — replaces the sidebar's removed Tags section for browsing/filtering by tag. */
function TagFilterMenu({ tags, activeTagId, mode }: { tags: Tag[]; activeTagId: string | null; mode: 'table' | 'list' | 'kanban' }) {
  const dispatch = useAppDispatch()
  const active = tags.find((t) => t.id === activeTagId)
  const go = (tagId: string | null) => dispatch(navigate({ type: 'library', tagId, mode: mode === 'kanban' && !tagId ? 'table' : mode }))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-8 gap-1.5 px-2.5', active && 'border-primary/40')}>
          {active ? <Hash className="size-3.5" style={{ color: color(active.color).fg }} /> : <Hash className="size-3.5 text-muted-foreground" />}
          {active ? active.name : t('library.allTags')}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => go(null)} className={cn(!activeTagId && 'font-medium')}>
          {t('library.everyCard')}
        </DropdownMenuItem>
        {tags.length > 0 && <div className="my-1 border-t" />}
        {tags.map((t) => (
          <TagMenu key={t.id} tag={t}>
            <DropdownMenuItem onSelect={() => go(t.id)} className={cn(activeTagId === t.id && 'font-medium')}>
              <Hash className="size-3.5" style={{ color: color(t.color).fg }} />
              {t.name}
            </DropdownMenuItem>
          </TagMenu>
        ))}
        {!tags.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('library.noTags')}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CardCollection({ tagId, mode, filter, includeBlocks }: { tagId: string | null; mode: 'table' | 'list'; filter: string; includeBlocks: boolean }) {
  const dispatch = useAppDispatch()
  const { data = [], isLoading } = useListCardsQuery({ tagId: tagId ?? undefined, limit: 5000, ...(includeBlocks ? { kind: 'all' as const } : {}) })
  const q = filter.trim().toLowerCase()
  const rows = q ? data.filter((c) => c.title.toLowerCase().includes(q) || c.excerpt.toLowerCase().includes(q)) : data
  const parent = useRef<HTMLDivElement>(null)
  const rowHeight = mode === 'table' ? 40 : 76
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => rowHeight, overscan: 12 })

  if (!isLoading && rows.length === 0)
    return <div className="mx-8 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">{q ? t('library.noMatch') : t('library.noCards')}</div>

  return (
    <div className="flex h-full flex-col px-8 pb-6">
      {mode === 'table' && (
        <div className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1fr)_120px] border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{t('library.colTitle')}</span>
          <span>{t('palette.tags')}</span>
          <span className="text-right">{t('library.colUpdated')}</span>
        </div>
      )}
      <div ref={parent} className="min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: virtual.getTotalSize() }} className="relative">
          {virtual.getVirtualItems().map((item) => {
            const c = rows[item.index]
            return (
              <div key={c.id} className="absolute inset-x-0" style={{ transform: `translateY(${item.start}px)`, height: item.size }}>
                <CardRowMenu cardId={c.id}>{mode === 'table' ? <TableRow card={c} onOpen={() => dispatch(openCard(c.id))} /> : <ListRow card={c} onOpen={() => dispatch(openCard(c.id))} />}</CardRowMenu>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TableRow({ card, onOpen }: { card: CardSummary; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="grid h-full w-full grid-cols-[minmax(200px,2fr)_minmax(160px,1fr)_120px] items-center border-b px-3 text-left text-sm transition hover:bg-accent">
      <span className="flex min-w-0 items-center gap-2 font-medium">
        {card.color && <span className="size-2 shrink-0 rounded-full" style={{ background: paletteColor(card.color).border }} />}
        <CardIcon icon={card.icon} className="size-4 text-[14px]" />
        <span className="truncate">{card.title || <span className="text-muted-foreground">{t('common.untitled')}</span>}</span>
        {card.kind === 'block' && <BlockBadge />}
      </span>
      <span className="flex gap-1 overflow-hidden">{card.tags.map((t) => <TagBadge key={t.id} tag={t} />)}</span>
      <span className="text-right text-xs text-muted-foreground">{formatDate(card.updatedAt)}</span>
    </button>
  )
}

function ListRow({ card, onOpen }: { card: CardSummary; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex h-[68px] w-full flex-col justify-center gap-0.5 rounded-lg px-3 text-left transition hover:bg-accent">
      <span className="flex items-center gap-2">
        {card.color && <span className="size-2 shrink-0 rounded-full" style={{ background: paletteColor(card.color).border }} />}
        <CardIcon icon={card.icon} className="size-4 text-[14px]" />
        <span className="truncate text-sm font-medium">{card.title || t('common.untitled')}</span>
        {card.kind === 'block' && <BlockBadge />}
        {card.tags.map((t) => <TagBadge key={t.id} tag={t} />)}
      </span>
      <span className="line-clamp-1 text-sm text-muted-foreground">{card.excerpt || t('library.emptyCard')}</span>
    </button>
  )
}

function BlockBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <TextBlock className="size-3" /> {t('library.textBlock')}
    </span>
  )
}
