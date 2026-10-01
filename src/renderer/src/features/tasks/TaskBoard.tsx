import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { MessageSquare, Paperclip, Plus } from '@/components/icons'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@shared/types'
import { STATUS_LABEL, sortTasks } from './model'
import type { NewTaskDefaults } from './NewTaskDialog'
import { AssigneeAvatar, DueLabel, PriorityIcon, StatusIcon, useTaskPatch } from './TaskProperties'
import { CardChip, taskKey } from './TaskList'

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done']

/** Kanban by status. Dropping a card on another column changes its status (done ⇔ checkbox in the card). */
export function TaskBoard({
  tasks,
  selectedKey,
  openKey,
  onSelect,
  onOpen,
  onAdd
}: {
  tasks: Task[]
  selectedKey: string | null
  openKey: string | null
  onSelect: (key: string) => void
  onOpen: (t: Task) => void
  onAdd: (d: NewTaskDefaults) => void
}) {
  const patch = useTaskPatch()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [active, setActive] = useState<Task | null>(null)

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    const task = tasks.find((t) => taskKey(t) === e.active.id)
    const status = e.over?.id as TaskStatus | undefined
    if (task && status && status !== task.status) void patch(task, { status })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => {
        setActive(tasks.find((t) => taskKey(t) === e.active.id) ?? null)
        onSelect(String(e.active.id))
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex h-full gap-3 overflow-x-auto px-6 pt-4 pb-6">
        {COLUMNS.map((status) => {
          const items = sortTasks(tasks.filter((t) => t.status === status))
          return (
            <Column key={status} status={status} count={items.length} onAdd={() => onAdd({ status })} dragging={!!active && active.status !== status}>
              {items.map((task) => (
                <DraggableCard key={taskKey(task)} task={task} selected={selectedKey === taskKey(task)} open={openKey === taskKey(task)} onOpen={() => onOpen(task)} />
              ))}
              {items.length === 0 && (
                <div className="grid h-20 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">{active ? t('task.dropHere') : t('task.none')}</div>
              )}
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {active && <BoardCard task={active} className="rotate-[1.5deg] shadow-xl ring-1 ring-border" />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ status, count, onAdd, dragging, children }: { status: TaskStatus; count: number; onAdd: () => void; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-80 shrink-0 flex-col rounded-xl bg-muted/40 p-2 transition-colors dark:bg-muted/25',
        dragging && 'ring-1 ring-border ring-inset',
        isOver && 'bg-accent/70 ring-primary/30 dark:bg-accent/40'
      )}
    >
      <div className="flex h-8 items-center gap-2 px-1.5 pb-1">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        <button onClick={onAdd} className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label={t('cmd.tasks.new')}>
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">{children}</div>
    </div>
  )
}

function DraggableCard({ task, selected, open, onOpen }: { task: Task; selected: boolean; open: boolean; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: taskKey(task) })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} data-task-key={taskKey(task)} data-task-row onClick={onOpen} className={cn('outline-none', isDragging && 'opacity-40')}>
      <BoardCard task={task} className={cn(selected && 'ring-2 ring-primary/40', open && 'ring-2 ring-primary/60')} />
    </div>
  )
}

function BoardCard({ task, className }: { task: Task; className?: string }) {
  const done = task.status === 'done'
  return (
    <div className={cn('cursor-grab rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:border-foreground/15 hover:shadow-sm active:cursor-grabbing', className)}>
      <div className="flex items-start gap-2">
        <span className={cn('min-w-0 flex-1 leading-snug', done && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{task.text || t('task.untitled')}</span>
        <AssigneeAvatar profile={task.assignee} className="mt-px" />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-muted-foreground">
        {task.priority !== 'none' && (
          <span className="grid size-5 place-items-center rounded border">
            <PriorityIcon priority={task.priority} className="size-3.5" />
          </span>
        )}
        <CardChip task={task} className="max-w-36" />
        {task.dueDate && <DueLabel due={task.dueDate} done={done} />}
        <div className="ml-auto flex items-center gap-2">
          {task.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs tabular-nums">
              <Paperclip className="size-3.5" />
              {task.attachmentCount}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1 text-xs tabular-nums">
              <MessageSquare className="size-3.5" />
              {task.commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
