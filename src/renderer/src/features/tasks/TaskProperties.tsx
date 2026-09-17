import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Calendar as CalendarIcon,
  Check,
  FileText,
  Inbox,
  PriorityHigh,
  PriorityLow,
  PriorityMedium,
  PriorityNone,
  PriorityUrgent,
  StatusDone,
  StatusInProgress,
  StatusTodo,
  UserCircle,
  type AppIcon
} from '@/components/icons'
import { Calendar } from '@/components/ui/calendar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { recordTaskPatch } from '@/lib/undo-actions'
import { cn } from '@/lib/utils'
import { useGetActiveProfileQuery, useListProfilesQuery, useSearchQuery, useUpdateTaskMutation } from '@/store/api'
import { addDays, isoDate } from '@shared/tasks'
import type { ProfileRef, Task, TaskPatch, TaskPriority, TaskStatus } from '@shared/types'
import { describeDue, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, type DueTone } from './model'

// ---------- glyphs ----------

const STATUS_ICON: Record<TaskStatus, AppIcon> = { todo: StatusTodo, in_progress: StatusInProgress, done: StatusDone }
const STATUS_TEXT: Record<TaskStatus, string> = {
  todo: 'text-muted-foreground',
  in_progress: 'text-amber-500 dark:text-amber-400',
  done: 'text-indigo-500 dark:text-indigo-400'
}

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return <Icon className={cn('size-4 shrink-0', STATUS_TEXT[status], className)} />
}

const PRIORITY_ICON: Record<TaskPriority, AppIcon> = { none: PriorityNone, low: PriorityLow, medium: PriorityMedium, high: PriorityHigh, urgent: PriorityUrgent }

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const Icon = PRIORITY_ICON[priority]
  return <Icon className={cn('size-4 shrink-0', priority === 'urgent' ? 'text-orange-500' : priority === 'none' ? 'text-muted-foreground/70' : 'text-foreground/70', className)} />
}

const DUE_TONE: Record<DueTone, string> = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-orange-600 dark:text-orange-400',
  soon: 'text-foreground/80',
  later: 'text-muted-foreground',
  done: 'text-muted-foreground'
}

export function DueLabel({ due, done, className, withIcon = true }: { due: string; done?: boolean; className?: string; withIcon?: boolean }) {
  const { label, tone } = describeDue(due, isoDate(), done)
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums', DUE_TONE[tone], className)}>
      {withIcon && <CalendarIcon className="size-3.5 shrink-0" />}
      {label}
    </span>
  )
}

// ---------- mutation + undo ----------

const UNDO_LABEL: Record<string, string> = { status: 'Change status', priority: 'Change priority', assigneeId: 'Change assignee', dueDate: 'Change due date', text: 'Rename task' }

/** Update a task property with optimistic UI and an undo entry. */
export function useTaskPatch() {
  const [update] = useUpdateTaskMutation()
  return async (task: Task, patch: Omit<TaskPatch, 'cardId' | 'taskId'>): Promise<boolean> => {
    const before: Omit<TaskPatch, 'cardId' | 'taskId'> = {}
    if (patch.status !== undefined) before.status = task.status
    if (patch.priority !== undefined) before.priority = task.priority
    if (patch.assigneeId !== undefined) before.assigneeId = task.assignee?.id ?? null
    if (patch.dueDate !== undefined) before.dueDate = task.dueDate
    if (patch.text !== undefined) before.text = task.text
    if (JSON.stringify(before) === JSON.stringify(patch)) return true
    const res = await update({ cardId: task.cardId, taskId: task.taskId, ...patch })
    if ('error' in res) {
      toast.error(`Could not update task: ${String(res.error)}`)
      return false
    }
    const keys = Object.keys(patch)
    recordTaskPatch(task.cardId, task.taskId, keys.length === 1 ? UNDO_LABEL[keys[0]] : 'Update task', before, patch)
    return true
  }
}

// ---------- pickers ----------

function PickerItem({ selected, onSelect, children, value }: { selected: boolean; onSelect: () => void; children: ReactNode; value: string }) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="gap-2">
      {children}
      <Check className={cn('ml-auto size-3.5', !selected && 'invisible')} />
    </CommandItem>
  )
}

interface PickerProps<T> {
  value: T
  onChange: (v: T) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (o: boolean) => void
}

function usePopover(open?: boolean, onOpenChange?: (o: boolean) => void) {
  const [inner, setInner] = useState(false)
  return [open ?? inner, onOpenChange ?? setInner] as const
}

export function StatusPicker({ value, onChange, children, align = 'start', open, onOpenChange }: PickerProps<TaskStatus>) {
  const [isOpen, setOpen] = usePopover(open, onOpenChange)
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-52 p-0" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Change status…" />
          <CommandList>
            <CommandGroup>
              {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                <PickerItem key={s} value={STATUS_LABEL[s]} selected={value === s} onSelect={() => (setOpen(false), onChange(s))}>
                  <StatusIcon status={s} /> {STATUS_LABEL[s]}
                </PickerItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function PriorityPicker({ value, onChange, children, align = 'start', open, onOpenChange }: PickerProps<TaskPriority>) {
  const [isOpen, setOpen] = usePopover(open, onOpenChange)
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-52 p-0" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Set priority…" />
          <CommandList>
            <CommandGroup>
              {[...PRIORITY_ORDER.slice(0, 4), 'none' as const].map((p) => (
                <PickerItem key={p} value={PRIORITY_LABEL[p]} selected={value === p} onSelect={() => (setOpen(false), onChange(p))}>
                  <PriorityIcon priority={p} /> {PRIORITY_LABEL[p]}
                </PickerItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function AssigneePicker({ value, onChange, children, align = 'start', open, onOpenChange }: PickerProps<string | null>) {
  const [isOpen, setOpen] = usePopover(open, onOpenChange)
  const { data: profiles = [] } = useListProfilesQuery()
  const { data: me } = useGetActiveProfileQuery()
  const ordered = [...profiles].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-60 p-0" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Assign to…" />
          <CommandList>
            <CommandEmpty>No people found</CommandEmpty>
            <CommandGroup>
              <PickerItem value="No assignee" selected={value === null} onSelect={() => (setOpen(false), onChange(null))}>
                <UserCircle className="size-5 text-muted-foreground" /> No assignee
              </PickerItem>
              {ordered.map((p) => (
                <PickerItem key={p.id} value={`${p.name} ${p.email ?? ''}`} selected={value === p.id} onSelect={() => (setOpen(false), onChange(p.id))}>
                  <ProfileAvatar profile={p} size="xs" />
                  <span className="truncate">{p.name}</span>
                  {p.id === me?.id && <span className="text-xs text-muted-foreground">you</span>}
                </PickerItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const toDate = (iso: string | null) => {
  if (!iso) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function DuePicker({ value, onChange, children, align = 'start', open, onOpenChange }: PickerProps<string | null>) {
  const [isOpen, setOpen] = usePopover(open, onOpenChange)
  const today = isoDate()
  const pick = (v: string | null) => {
    setOpen(false)
    onChange(v)
  }
  const nextMonday = addDays(today, ((8 - new Date().getDay()) % 7) || 7)
  const quick: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['Next week', nextMonday]
  ]
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 border-b p-2">
          {quick.map(([label, v]) => (
            <button
              key={label}
              onClick={() => pick(v)}
              className={cn('rounded-md border px-2 py-1 text-xs transition hover:bg-accent', value === v && 'border-primary/40 bg-accent')}
            >
              {label}
            </button>
          ))}
          {value && (
            <button onClick={() => pick(null)} className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground">
              Clear
            </button>
          )}
        </div>
        <Calendar mode="single" selected={toDate(value)} defaultMonth={toDate(value)} onSelect={(d) => d && pick(isoDate(d))} />
      </PopoverContent>
    </Popover>
  )
}

export type CardTarget = { id: string | null; title: string }

/** Choose the card a new task goes into; `id: null` = Inbox. */
export function CardPicker({ value, onChange, children, align = 'start' }: PickerProps<CardTarget>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: hits = [] } = useSearchQuery(query, { skip: !open })
  const pick = (t: CardTarget) => {
    setOpen(false)
    onChange(t)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Add to card…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No cards found</CommandEmpty>
            <CommandGroup>
              <PickerItem value="__inbox" selected={value.id === null} onSelect={() => pick({ id: null, title: 'Inbox' })}>
                <Inbox className="size-4 text-muted-foreground" /> Inbox
              </PickerItem>
            </CommandGroup>
            <CommandGroup heading="Cards">
              {hits
                .filter((h) => h.kind === 'card' && h.title !== 'Inbox')
                .map((h) => (
                  <PickerItem key={h.id} value={h.id} selected={value.id === h.id} onSelect={() => pick({ id: h.id, title: h.title })}>
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="truncate">{h.title || 'Untitled'}</span>
                  </PickerItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Avatar or an empty dashed placeholder. */
export function AssigneeAvatar({ profile, size = 'xs', className }: { profile: ProfileRef | null; size?: 'xs' | 'sm'; className?: string }) {
  if (profile) return <ProfileAvatar profile={profile} size={size} className={className} />
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground/70', size === 'xs' ? 'size-5' : 'size-6', className)}>
      <UserCircle className="size-3.5 opacity-0" />
    </span>
  )
}
