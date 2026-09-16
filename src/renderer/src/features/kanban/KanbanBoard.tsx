import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { useCreateCardMutation, useGetKanbanQuery, useMoveKanbanItemMutation } from '@/store/api'
import { openCard } from '@/store/ui'
import type { CardSummary } from '@shared/types'

const NONE = '__none'
type Columns = Record<string, CardSummary[]>

export function KanbanBoard({ tagId, filter }: { tagId: string; filter: string }) {
  const { data: board } = useGetKanbanQuery({ tagId })
  const [move] = useMoveKanbanItemMutation()
  const [createCard] = useCreateCardMutation()
  const dispatch = useAppDispatch()
  const [columns, setColumns] = useState<Columns>({})
  const [active, setActive] = useState<CardSummary | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    if (!board || active) return
    setColumns(Object.fromEntries(board.columns.map((c) => [c.option?.id ?? NONE, c.cards])))
  }, [board, active])

  if (!board) return null
  const q = filter.trim().toLowerCase()

  const findColumn = (id: string): string | undefined => (id in columns ? id : Object.keys(columns).find((k) => columns[k].some((c) => c.id === id)))

  const onDragStart = (e: DragStartEvent) => {
    const col = findColumn(String(e.active.id))
    setActive(col ? columns[col].find((c) => c.id === e.active.id) ?? null : null)
  }

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return
    const from = findColumn(String(a.id))
    const to = findColumn(String(over.id))
    if (!from || !to || from === to) return
    setColumns((cols) => {
      const item = cols[from].find((c) => c.id === a.id)!
      const overIndex = cols[to].findIndex((c) => c.id === over.id)
      const index = overIndex < 0 ? cols[to].length : overIndex
      return { ...cols, [from]: cols[from].filter((c) => c.id !== a.id), [to]: [...cols[to].slice(0, index), item, ...cols[to].slice(index)] }
    })
  }

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const col = findColumn(String(a.id))
    setActive(null)
    if (!col || !over) return
    let list = columns[col]
    const from = list.findIndex((c) => c.id === a.id)
    const to = over.id in columns ? list.length - 1 : list.findIndex((c) => c.id === over.id)
    if (to >= 0 && from !== to) {
      list = arrayMove(list, from, to)
      setColumns((cols) => ({ ...cols, [col]: list }))
    }
    const index = list.findIndex((c) => c.id === a.id)
    void move({ cardId: String(a.id), propertyId: board.property.id, optionId: col === NONE ? null : col, index })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex h-full gap-3 overflow-x-auto px-8 pb-6">
        {board.columns.map((column) => {
          const key = column.option?.id ?? NONE
          const cards = (columns[key] ?? []).filter((c) => !q || c.title.toLowerCase().includes(q))
          if (key === NONE && cards.length === 0 && !active) return null
          const c = color(column.option?.color)
          return (
            <Column key={key} id={key}>
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className="rounded-md px-1.5 py-0.5 text-xs font-medium" style={{ background: c.bg, color: c.fg }}>
                  {column.option?.name ?? `No ${board.property.name.toLowerCase()}`}
                </span>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
                <button
                  className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={async () => {
                    const r = await createCard({ tagIds: [tagId] })
                    if ('data' in r && r.data) {
                      await move({ cardId: r.data.id, propertyId: board.property.id, optionId: column.option?.id ?? null, index: 999999 })
                      dispatch(openCard(r.data.id))
                    }
                  }}
                  aria-label="Add card"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                  {cards.map((card) => (
                    <SortableCard key={card.id} card={card} onOpen={() => dispatch(openCard(card.id))} />
                  ))}
                </div>
              </SortableContext>
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {active && <KanbanCard card={active} className="rotate-2 shadow-xl" />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors', isOver && 'bg-muted')}>
      {children}
    </div>
  )
}

function SortableCard({ card, onOpen }: { card: CardSummary; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} onClick={onOpen}>
      <KanbanCard card={card} className={cn(isDragging && 'opacity-40')} />
    </div>
  )
}

function KanbanCard({ card, className }: { card: CardSummary; className?: string }) {
  return (
    <div className={cn('cursor-grab rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:shadow-md active:cursor-grabbing', className)}>
      <div className="font-medium">{card.title || <span className="text-muted-foreground">Untitled</span>}</div>
      {card.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.excerpt}</p>}
    </div>
  )
}
