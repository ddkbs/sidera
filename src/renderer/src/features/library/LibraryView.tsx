import { useVirtualizer } from '@tanstack/react-virtual'
import { Columns3, List, Plus, Table2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TagBadge } from '@/features/card/TagBadge'
import { KanbanBoard } from '@/features/kanban/KanbanBoard'
import { CardRowMenu } from './CardRowMenu'
import { TagTable } from './TagTable'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateCardMutation, useListCardsQuery, useListTagsQuery } from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import type { CardSummary } from '@shared/types'

export function LibraryView() {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const { data: tags = [] } = useListTagsQuery()
  const [createCard] = useCreateCardMutation()
  const [filter, setFilter] = useState('')
  if (view.type !== 'library') return null
  const tag = tags.find((t) => t.id === view.tagId)
  const mode = view.mode === 'kanban' && !view.tagId ? 'table' : view.mode

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-8 pt-6 pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{tag ? `#${tag.name}` : 'Card Library'}</h1>
          <p className="text-sm text-muted-foreground">{tag ? 'Tagged cards — switch to Kanban to organize by status' : 'Every card across your whiteboards'}</p>
        </div>
        <div className="flex-1" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="h-8 w-48 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
        />
        <Tabs value={mode} onValueChange={(m) => dispatch(navigate({ ...view, mode: m as typeof view.mode }))}>
          <TabsList className="h-8">
            <TabsTrigger value="table" className="px-2"><Table2 /> Table</TabsTrigger>
            <TabsTrigger value="list" className="px-2"><List /> List</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="kanban" className="px-2" disabled={!view.tagId}><Columns3 /> Kanban</TabsTrigger>
                </span>
              </TooltipTrigger>
              {!view.tagId && <TooltipContent>Open a tag to use Kanban</TooltipContent>}
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
          <Plus /> New card
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'kanban' && view.tagId ? <KanbanBoard tagId={view.tagId} filter={filter} /> : mode === 'table' && view.tagId ? <TagTable tagId={view.tagId} filter={filter} /> : <CardCollection tagId={view.tagId} mode={mode === 'list' ? 'list' : 'table'} filter={filter} />}
      </div>
    </div>
  )
}

function CardCollection({ tagId, mode, filter }: { tagId: string | null; mode: 'table' | 'list'; filter: string }) {
  const dispatch = useAppDispatch()
  const { data = [], isLoading } = useListCardsQuery({ tagId: tagId ?? undefined, limit: 5000 })
  const q = filter.trim().toLowerCase()
  const rows = q ? data.filter((c) => c.title.toLowerCase().includes(q) || c.excerpt.toLowerCase().includes(q)) : data
  const parent = useRef<HTMLDivElement>(null)
  const rowHeight = mode === 'table' ? 40 : 76
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => rowHeight, overscan: 12 })

  if (!isLoading && rows.length === 0)
    return <div className="mx-8 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">No cards{q ? ' match your filter' : ' yet'}</div>

  return (
    <div className="flex h-full flex-col px-8 pb-6">
      {mode === 'table' && (
        <div className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1fr)_120px] border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Title</span>
          <span>Tags</span>
          <span className="text-right">Updated</span>
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
      <span className="truncate font-medium">{card.title || <span className="text-muted-foreground">Untitled</span>}</span>
      <span className="flex gap-1 overflow-hidden">{card.tags.map((t) => <TagBadge key={t.id} tag={t} />)}</span>
      <span className="text-right text-xs text-muted-foreground">{new Date(card.updatedAt).toLocaleDateString()}</span>
    </button>
  )
}

function ListRow({ card, onOpen }: { card: CardSummary; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex h-[68px] w-full flex-col justify-center gap-0.5 rounded-lg px-3 text-left transition hover:bg-accent">
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{card.title || 'Untitled'}</span>
        {card.tags.map((t) => <TagBadge key={t.id} tag={t} />)}
      </span>
      <span className="line-clamp-1 text-sm text-muted-foreground">{card.excerpt || 'Empty card'}</span>
    </button>
  )
}
