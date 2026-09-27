import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon, Check, Columns3, Filter, Layers, ListChecks, Plus, Rows, Search, UserCircle, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { formatBinding, useBinding, useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useGetActiveProfileQuery, useListProfilesQuery, useListTasksQuery } from '@/store/api'
import { isoDate } from '@shared/tasks'
import type { Task, TaskDueFilter, TaskPriority, TaskStatus } from '@shared/types'
import {
  activeFilterCount,
  DUE_LABEL,
  EMPTY_FILTERS,
  filterTasks,
  groupTasks,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  sortTasks,
  STATUS_LABEL,
  STATUS_ORDER,
  type GroupBy,
  type TaskFilters,
  type TaskViewMode
} from './model'
import { NewTaskDialog, type NewTaskDefaults } from './NewTaskDialog'
import { TaskBoard } from './TaskBoard'
import { TaskDetailPanel } from './TaskDetailPanel'
import { TaskList, taskKey } from './TaskList'
import { PriorityIcon, StatusIcon } from './TaskProperties'
import { storageKey } from '@/lib/storage'

interface Prefs {
  mode: TaskViewMode
  groupBy: GroupBy
  filters: Omit<TaskFilters, 'query'>
  collapsed: string[]
}

const PREFS_KEY = storageKey('canvascl.tasks.prefs')
const DEFAULT_PREFS: Prefs = { mode: 'list', groupBy: 'status', filters: EMPTY_FILTERS, collapsed: ['done'] }

const loadPrefs = (): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    return { ...DEFAULT_PREFS, ...p, filters: { ...EMPTY_FILTERS, ...p?.filters } }
  } catch {
    return DEFAULT_PREFS
  }
}

const GROUP_LABEL: Record<GroupBy, string> = { status: 'Status', card: 'Card', assignee: 'Assignee', priority: 'Priority', none: 'No grouping' }

export function TasksView() {
  const { data: tasks = [], isLoading } = useListTasksQuery({ status: 'all' })
  const { data: me } = useGetActiveProfileQuery()
  const { data: profiles = [] } = useListProfilesQuery()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [newTask, setNewTask] = useState<NewTaskDefaults | null>(null)
  const newKey = useBinding('tasks.new')

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  const update = (p: Partial<Prefs>) => setPrefs((s) => ({ ...s, ...p }))
  const setFilters = (f: Partial<TaskFilters>) => setPrefs((s) => ({ ...s, filters: { ...s.filters, ...f } }))
  const filters: TaskFilters = { ...prefs.filters, query }
  const today = isoDate()

  const visible = useMemo(() => filterTasks(tasks, filters, me?.id ?? null, today), [tasks, JSON.stringify(filters), me?.id, today])
  const groups = useMemo(() => groupTasks(visible, prefs.groupBy, me?.id ?? null), [visible, prefs.groupBy, me?.id])
  const collapsed = useMemo(() => new Set(prefs.collapsed), [prefs.collapsed])

  /** Keyboard order = what's on screen. */
  const order = useMemo(() => {
    if (prefs.mode === 'board') return (['todo', 'in_progress', 'done'] as TaskStatus[]).flatMap((s) => sortTasks(visible.filter((t) => t.status === s)))
    return groups.flatMap((g) => (collapsed.has(g.key) && prefs.groupBy !== 'none' ? [] : g.tasks))
  }, [prefs.mode, prefs.groupBy, visible, groups, collapsed])

  const openCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.length - openCount
  const opened = openKey ? tasks.find((t) => taskKey(t) === openKey) : undefined

  useEffect(() => {
    if (openKey && !isLoading && !opened) setOpenKey(null)
  }, [openKey, opened, isLoading])

  const move = (delta: number) => {
    if (!order.length) return
    const i = order.findIndex((t) => taskKey(t) === selectedKey)
    const next = order[i === -1 ? (delta > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, i + delta))]
    const key = taskKey(next)
    setSelectedKey(key)
    if (openKey) setOpenKey(key)
    requestAnimationFrame(() => document.querySelector(`[data-task-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }

  const overlayOpen = () => !!document.querySelector('[role=dialog], [role=menu], [data-radix-popper-content-wrapper]')
  const onRowOrBody = () => {
    const el = document.activeElement
    return !el || el === document.body || el.hasAttribute('data-task-row')
  }

  useCommands(
    {
      'tasks.new': () => (overlayOpen() ? false : setNewTask({})),
      'tasks.next': () => (overlayOpen() ? false : move(1)),
      'tasks.prev': () => (overlayOpen() ? false : move(-1)),
      'tasks.open': () => {
        if (overlayOpen() || !onRowOrBody() || !selectedKey) return false
        setOpenKey(selectedKey)
      }
    },
    newTask === null
  )

  const openTask = (t: Task) => {
    setSelectedKey(taskKey(t))
    setOpenKey(taskKey(t))
  }

  const nFilters = activeFilterCount(filters)

  return (
    <div className="relative flex h-full flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-3">
        <div className="grid size-8 place-items-center rounded-lg border bg-card shadow-xs">
          <ListChecks className="size-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold tracking-tight">Tasks</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {openCount} open · {doneCount} done
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex h-8 items-center rounded-lg border bg-muted/50 p-0.5" role="tablist" aria-label="View">
          {(
            [
              ['list', 'List', Rows],
              ['board', 'Board', Columns3]
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              role="tab"
              aria-selected={prefs.mode === mode}
              onClick={() => update({ mode })}
              className={cn(
                'flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition',
                prefs.mode === mode ? 'bg-background text-foreground shadow-xs' : 'hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={() => setNewTask({})}>
              <Plus className="size-4" /> New task
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            New task <Kbd>{formatBinding(newKey)}</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-6 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Search tasks"
            className="h-7 w-48 rounded-md border bg-background pr-2 pl-7 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <QuickFilter active={filters.assignee === 'me'} onClick={() => setFilters({ assignee: filters.assignee === 'me' ? 'any' : 'me' })}>
          {me && <ProfileAvatar profile={me} size="xs" className="size-4 text-[8px]" />}
          Assigned to me
        </QuickFilter>
        <QuickFilter active={filters.due === 'overdue'} onClick={() => setFilters({ due: filters.due === 'overdue' ? 'any' : 'overdue' })}>
          <CalendarIcon className="size-3.5" /> Overdue
        </QuickFilter>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(chip, nFilters > 0 && 'border-primary/30 bg-primary/5 text-foreground')}>
              <Filter className="size-3.5" /> Filter
              {nFilters > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground tabular-nums">{nFilters}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <StatusIcon status="in_progress" /> Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {STATUS_ORDER.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={filters.statuses.includes(s)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) => setFilters({ statuses: toggle(filters.statuses, s, on) })}
                  >
                    <StatusIcon status={s} /> {STATUS_LABEL[s]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserCircle /> Assignee
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuRadioGroup value={filters.assignee} onValueChange={(v) => setFilters({ assignee: v })}>
                  <DropdownMenuRadioItem value="any">Anyone</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="me">Assigned to me</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="none">Unassigned</DropdownMenuRadioItem>
                  {profiles.length > 1 && <DropdownMenuSeparator />}
                  {profiles.length > 1 &&
                    profiles.map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        <ProfileAvatar profile={p} size="xs" /> <span className="truncate">{p.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PriorityIcon priority="high" /> Priority
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {PRIORITY_ORDER.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={filters.priorities.includes(p)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) => setFilters({ priorities: toggle(filters.priorities, p, on) })}
                  >
                    <PriorityIcon priority={p} /> {PRIORITY_LABEL[p]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CalendarIcon /> Due date
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                <DropdownMenuRadioGroup value={filters.due} onValueChange={(v) => setFilters({ due: v as TaskDueFilter | 'any' })}>
                  <DropdownMenuRadioItem value="any">Any time</DropdownMenuRadioItem>
                  {(['overdue', 'today', 'week'] as TaskDueFilter[]).map((d) => (
                    <DropdownMenuRadioItem key={d} value={d}>
                      {DUE_LABEL[d]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {nFilters > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setFilters(EMPTY_FILTERS)} className="text-muted-foreground">
                  <X /> Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ActiveFilterChips filters={filters} profiles={profiles} meId={me?.id} onChange={setFilters} />

        <div className="flex-1" />
        {prefs.mode === 'list' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chip}>
                <Layers className="size-3.5" />
                <span className="text-muted-foreground">Group:</span> {GROUP_LABEL[prefs.groupBy]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Group by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={prefs.groupBy} onValueChange={(v) => update({ groupBy: v as GroupBy })}>
                {(['status', 'card', 'assignee', 'priority', 'none'] as GroupBy[]).map((g) => (
                  <DropdownMenuRadioItem key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* body */}
      <div className={cn('min-h-0 flex-1', prefs.mode === 'list' ? 'overflow-y-auto' : 'overflow-hidden')}>
        {isLoading ? null : tasks.length === 0 ? (
          <EmptyState onNew={() => setNewTask({})} newKey={formatBinding(newKey)} />
        ) : visible.length === 0 ? (
          <NoMatches onClear={() => (setFilters(EMPTY_FILTERS), setQuery(''))} />
        ) : prefs.mode === 'list' ? (
          <TaskList
            groups={groups}
            collapsed={prefs.groupBy === 'none' ? new Set() : collapsed}
            onToggleGroup={(key) => update({ collapsed: collapsed.has(key) ? prefs.collapsed.filter((k) => k !== key) : [...prefs.collapsed, key] })}
            selectedKey={selectedKey}
            openKey={openKey}
            onSelect={setSelectedKey}
            onOpen={openTask}
            onAdd={setNewTask}
            showGroupHeaders={prefs.groupBy !== 'none'}
          />
        ) : (
          <TaskBoard tasks={visible} selectedKey={selectedKey} openKey={openKey} onSelect={setSelectedKey} onOpen={openTask} onAdd={setNewTask} />
        )}
      </div>

      <AnimatePresence>
        {opened && <TaskDetailPanel key="detail" task={opened} onClose={() => setOpenKey(null)} />}
      </AnimatePresence>
      <NewTaskDialog
        open={newTask !== null}
        onOpenChange={(o) => !o && setNewTask(null)}
        defaults={newTask ?? undefined}
        onCreated={(t) => setSelectedKey(taskKey(t))}
      />
    </div>
  )
}

const chip =
  'inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground/80 shadow-xs transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent'

function toggle<T>(list: T[], v: T, on: boolean): T[] {
  return on ? [...new Set([...list, v])] : list.filter((x) => x !== v)
}

function QuickFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn(chip, active && 'border-primary/30 bg-primary/5 text-foreground')}>
      {children}
      {active && <Check className="size-3 text-primary" />}
    </button>
  )
}

function ActiveFilterChips({
  filters,
  profiles,
  meId,
  onChange
}: {
  filters: TaskFilters
  profiles: { id: string; name: string }[]
  meId?: string
  onChange: (f: Partial<TaskFilters>) => void
}) {
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.statuses.length) chips.push({ key: 's', label: `Status: ${filters.statuses.map((s) => STATUS_LABEL[s]).join(', ')}`, clear: () => onChange({ statuses: [] }) })
  if (filters.priorities.length)
    chips.push({ key: 'p', label: `Priority: ${filters.priorities.map((p) => PRIORITY_LABEL[p as TaskPriority]).join(', ')}`, clear: () => onChange({ priorities: [] }) })
  if (filters.assignee !== 'any' && filters.assignee !== 'me') {
    const name = filters.assignee === 'none' ? 'Unassigned' : filters.assignee === meId ? 'Me' : (profiles.find((p) => p.id === filters.assignee)?.name ?? 'Someone')
    chips.push({ key: 'a', label: `Assignee: ${name}`, clear: () => onChange({ assignee: 'any' }) })
  }
  if (filters.due !== 'any' && filters.due !== 'overdue') chips.push({ key: 'd', label: DUE_LABEL[filters.due], clear: () => onChange({ due: 'any' }) })
  return (
    <>
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/20 bg-primary/5 pr-1 pl-2 text-xs">
          {c.label}
          <button onClick={c.clear} className="grid size-5 place-items-center rounded text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Remove filter">
            <X className="size-3" />
          </button>
        </span>
      ))}
    </>
  )
}

function EmptyState({ onNew, newKey }: { onNew: () => void; newKey: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-6 h-28 w-64">
          {[
            { y: 0, w: '78%', s: 'todo' as const, p: 'high' as const, o: 1 },
            { y: 36, w: '62%', s: 'in_progress' as const, p: 'medium' as const, o: 0.7 },
            { y: 72, w: '70%', s: 'done' as const, p: 'none' as const, o: 0.4 }
          ].map((r, i) => (
            <div
              key={i}
              className="absolute inset-x-0 flex h-8 items-center gap-2 rounded-lg border bg-card px-2.5 shadow-xs"
              style={{ top: r.y, opacity: r.o, transform: `translateX(${(i - 1) * 10}px)` }}
            >
              <PriorityIcon priority={r.p} className="size-3.5" />
              <StatusIcon status={r.s} className="size-3.5" />
              <span className="h-1.5 rounded-full bg-muted-foreground/20" style={{ width: r.w }} />
            </div>
          ))}
        </div>
        <h2 className="text-base font-semibold tracking-tight">Plan your work</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Tasks live as checkboxes inside your cards. Create one here, or type <code className="rounded bg-muted px-1 py-0.5 text-xs">[ ]</code> in any card — it shows up
          in this list.
        </p>
        <Button size="sm" className="mt-5" onClick={onNew}>
          <Plus className="size-4" /> New task <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">{newKey}</Kbd>
        </Button>
      </div>
    </div>
  )
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-xs flex-col items-center text-center">
        <div className="mb-4 grid size-11 place-items-center rounded-xl border bg-card shadow-xs">
          <Filter className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-semibold">No tasks match</h2>
        <p className="mt-1 text-sm text-muted-foreground">Try a different search or remove some filters.</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  )
}
