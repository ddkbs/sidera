import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronRight, FileText, Inbox, MessageSquare, Paperclip, Plus } from '@/components/icons'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { cn } from '@/lib/utils'
import type { Task, TaskPriority, TaskStatus } from '@shared/types'
import { nextStatus, type TaskGroup } from './model'
import { AssigneeAvatar, AssigneePicker, DueLabel, DuePicker, PriorityIcon, PriorityPicker, StatusIcon, StatusPicker, useTaskPatch } from './TaskProperties'
import type { NewTaskDefaults } from './NewTaskDialog'

export const taskKey = (t: Pick<Task, 'cardId' | 'taskId'>) => `${t.cardId}:${t.taskId}`

export function TaskList({
  groups,
  collapsed,
  onToggleGroup,
  selectedKey,
  openKey,
  onSelect,
  onOpen,
  onAdd,
  showGroupHeaders
}: {
  groups: TaskGroup[]
  collapsed: Set<string>
  onToggleGroup: (key: string) => void
  selectedKey: string | null
  openKey: string | null
  onSelect: (key: string) => void
  onOpen: (t: Task) => void
  onAdd: (defaults: NewTaskDefaults) => void
  showGroupHeaders: boolean
}) {
  return (
    <div className="pb-24">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        return (
          <section key={g.key}>
            {showGroupHeaders && (
              <div className="group/header sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-muted/60 px-6 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
                <button onClick={() => onToggleGroup(g.key)} className="flex min-w-0 items-center gap-2 text-sm">
                  <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', !isCollapsed && 'rotate-90')} />
                  <GroupGlyph group={g} />
                  <span className="truncate font-medium">{g.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{g.tasks.length}</span>
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => onAdd(defaultsFor(g))}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition group-hover/header:opacity-100 hover:bg-accent hover:text-foreground"
                  aria-label={`New task in ${g.label}`}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            )}
            {!isCollapsed &&
              g.tasks.map((t) => (
                <TaskRow
                  key={taskKey(t)}
                  task={t}
                  selected={selectedKey === taskKey(t)}
                  open={openKey === taskKey(t)}
                  hideCard={g.kind === 'card'}
                  onSelect={() => onSelect(taskKey(t))}
                  onOpen={() => onOpen(t)}
                />
              ))}
          </section>
        )
      })}
    </div>
  )
}

function defaultsFor(g: TaskGroup): NewTaskDefaults {
  if (g.kind === 'status') return { status: g.value as TaskStatus }
  if (g.kind === 'priority') return { priority: g.value as TaskPriority }
  if (g.kind === 'assignee') return { assigneeId: g.value }
  if (g.kind === 'card' && g.value) return { card: { id: g.value, title: g.label } }
  return {}
}

function GroupGlyph({ group }: { group: TaskGroup }) {
  const first = group.tasks[0]
  if (group.kind === 'status') return <StatusIcon status={group.value as TaskStatus} />
  if (group.kind === 'priority') return <PriorityIcon priority={group.value as TaskPriority} />
  if (group.kind === 'assignee') return first?.assignee ? <ProfileAvatar profile={first.assignee} size="xs" /> : <AssigneeAvatar profile={null} />
  if (group.kind === 'card') return group.label === 'Inbox' ? <Inbox className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />
  return null
}

export function CardChip({ task, className }: { task: Task; className?: string }) {
  const isInbox = task.cardTitle === 'Inbox'
  return (
    <span className={cn('inline-flex h-5 max-w-44 shrink items-center gap-1 rounded-full border px-1.5 text-[11px] text-muted-foreground', className)}>
      {isInbox ? <Inbox className="size-3 shrink-0" /> : task.cardIcon && task.cardIcon.length <= 4 ? <span className="text-[10px] leading-none">{task.cardIcon}</span> : <FileText className="size-3 shrink-0" />}
      <span className="truncate">{task.cardTitle || 'Untitled'}</span>
    </span>
  )
}

function TaskRow({ task, selected, open, hideCard, onSelect, onOpen }: { task: Task; selected: boolean; open: boolean; hideCard: boolean; onSelect: () => void; onOpen: () => void }) {
  const patch = useTaskPatch()
  const [menu, setMenu] = useState<null | 'status' | 'priority' | 'assignee' | 'due'>(null)
  const setOpen = (m: typeof menu) => (o: boolean) => setMenu(o ? m : null)
  const done = task.status === 'done'
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      data-task-key={taskKey(task)}
      data-task-row
      onMouseDown={onSelect}
      onClick={onOpen}
      className={cn(
        'group/row relative flex h-11 cursor-default items-center gap-2.5 border-b border-border/60 px-6 text-sm transition-colors select-none',
        'hover:bg-accent/50',
        selected && 'bg-accent/70 hover:bg-accent/70',
        open && 'bg-accent hover:bg-accent'
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <PriorityPicker value={task.priority} onChange={(v) => void patch(task, { priority: v })} open={menu === 'priority'} onOpenChange={setOpen('priority')}>
        <button onClick={stop} className="grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-background" aria-label="Priority">
          <PriorityIcon priority={task.priority} />
        </button>
      </PriorityPicker>
      <StatusPicker value={task.status} onChange={(v) => void patch(task, { status: v })} open={menu === 'status'} onOpenChange={setOpen('status')}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (e.altKey) return
            e.preventDefault()
            void patch(task, { status: nextStatus(task.status) })
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu('status')
          }}
          className="grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-background"
          aria-label="Status (click to advance, right-click to choose)"
          title="Click to advance · right-click to choose"
        >
          <StatusIcon status={task.status} />
        </button>
      </StatusPicker>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn('truncate', done && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{task.text || 'Untitled task'}</span>
        {!hideCard && <CardChip task={task} className="hidden md:inline-flex" />}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
        {task.attachmentCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs tabular-nums" title={`${task.attachmentCount} attachment${task.attachmentCount === 1 ? '' : 's'}`}>
            <Paperclip className="size-3.5" />
            {task.attachmentCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1 text-xs tabular-nums" title={`${task.commentCount} comment${task.commentCount === 1 ? '' : 's'}`}>
            <MessageSquare className="size-3.5" />
            {task.commentCount}
          </span>
        )}
        <DuePicker value={task.dueDate} onChange={(v) => void patch(task, { dueDate: v })} open={menu === 'due'} onOpenChange={setOpen('due')} align="end">
          <button onClick={stop} className={cn('flex h-6 min-w-6 items-center justify-center rounded-md px-1 transition hover:bg-background', !task.dueDate && 'opacity-0 group-hover/row:opacity-100')}>
            {task.dueDate ? <DueLabel due={task.dueDate} done={done} /> : <CalendarIcon className="size-3.5" />}
          </button>
        </DuePicker>
        <AssigneePicker value={task.assignee?.id ?? null} onChange={(v) => void patch(task, { assigneeId: v })} open={menu === 'assignee'} onOpenChange={setOpen('assignee')} align="end">
          <button onClick={stop} className="grid size-6 place-items-center rounded-full transition hover:ring-2 hover:ring-border" aria-label="Assignee" title={task.assignee?.name ?? 'Unassigned'}>
            <AssigneeAvatar profile={task.assignee} />
          </button>
        </AssigneePicker>
      </div>
    </div>
  )
}
