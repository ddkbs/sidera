import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Check, ChevronDown, FileText, Plus } from '@/components/icons'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { useAddTaskMutation, useListTasksQuery, useSearchQuery, useSetTaskCheckedMutation } from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import type { Task } from '@shared/types'

type Status = 'open' | 'done' | 'all'

const prettyDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

interface Group {
  cardId: string
  title: string
  isJournal: boolean
  updatedAt: number
  tasks: Task[]
}

export function TasksView() {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<Status>('open')
  const { data: tasks = [], isLoading } = useListTasksQuery({ status })
  const [setChecked] = useSetTaskCheckedMutation()

  const groups = useMemo(() => {
    const byCard = new Map<string, Group>()
    for (const t of tasks) {
      let g = byCard.get(t.cardId)
      if (!g) {
        g = { cardId: t.cardId, title: t.isJournal ? prettyDate(t.journalDate!) : t.cardTitle || 'Untitled', isJournal: t.isJournal, updatedAt: t.updatedAt, tasks: [] }
        byCard.set(t.cardId, g)
      }
      g.tasks.push(t)
    }
    return [...byCard.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [tasks])

  const openCount = tasks.filter((t) => !t.checked).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-10 py-12">
        <div className="mb-6 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {status === 'open' ? `${openCount} open` : `${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
            <TabsList className="h-8">
              <TabsTrigger value="open" className="px-3">Open</TabsTrigger>
              <TabsTrigger value="done" className="px-3">Done</TabsTrigger>
              <TabsTrigger value="all" className="px-3">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <AddTask />

        {!isLoading && groups.length === 0 && (
          <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            {status === 'open' && 'No open tasks — nice work.'}
            {status === 'done' && 'No completed tasks yet.'}
            {status === 'all' && 'No to-dos yet. Add a checklist to a card or journal entry.'}
          </div>
        )}

        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.cardId}>
              <button
                onClick={() => (g.isJournal ? dispatch(navigate({ type: 'journal' })) : dispatch(openCard(g.cardId)))}
                className="mb-1.5 flex items-center gap-1.5 px-0.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {g.isJournal ? <CalendarDays className="size-3.5" /> : <FileText className="size-3.5" />}
                {g.title}
              </button>
              <div className="overflow-hidden rounded-lg border">
                {g.tasks.map((t) => (
                  <TaskRow key={t.index} task={t} onToggle={(checked) => void setChecked({ cardId: t.cardId, index: t.index, checked })} />
                ))}
                {status !== 'done' && <InlineAdd cardId={g.cardId} />}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 border-b bg-card px-3 py-2 text-sm transition last:border-b-0 hover:bg-accent">
      <Checkbox checked={task.checked} onCheckedChange={(v) => onToggle(v === true)} />
      <span className={cn('min-w-0 flex-1 truncate', task.checked && 'text-muted-foreground line-through')}>{task.text || 'Untitled task'}</span>
    </label>
  )
}

type Target = { kind: 'journal' } | { kind: 'card'; id: string; title: string }

const TARGET_KEY = 'canvascl.tasks.target'

/** Quick entry at the top: Enter adds the task to today's journal or a chosen card and keeps focus for the next one. */
function AddTask() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Target>(() => {
    try {
      return (JSON.parse(localStorage.getItem(TARGET_KEY) ?? 'null') as Target | null) ?? { kind: 'journal' }
    } catch {
      return { kind: 'journal' }
    }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: hits = [] } = useSearchQuery(query, { skip: !pickerOpen })
  const [addTask] = useAddTaskMutation()
  const input = useRef<HTMLInputElement>(null)

  const choose = (t: Target) => {
    setTarget(t)
    setPickerOpen(false)
    try {
      localStorage.setItem(TARGET_KEY, JSON.stringify(t))
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => input.current?.focus())
  }

  const submit = async () => {
    const value = text.trim()
    if (!value) return
    const res = await addTask(target.kind === 'card' ? { text: value, cardId: target.id } : { text: value })
    if ('error' in res) {
      toast.error('Could not add task')
      if (target.kind === 'card') choose({ kind: 'journal' })
      return
    }
    setText('')
    input.current?.focus()
  }

  return (
    <div className="mb-8 flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/20">
      <Plus className="size-4 text-muted-foreground" />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void submit()}
        placeholder="Add a task…"
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-7 max-w-52 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground">
            {target.kind === 'journal' ? <CalendarDays className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
            <span className="truncate">{target.kind === 'journal' ? "Today's journal" : target.title || 'Untitled'}</span>
            <ChevronDown className="size-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Add to card…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No cards found</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__journal" onSelect={() => choose({ kind: 'journal' })}>
                  <CalendarDays /> Today's journal
                  {target.kind === 'journal' && <Check className="ml-auto size-3.5" />}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Cards">
                {hits
                  .filter((h) => h.kind === 'card')
                  .map((h) => (
                    <CommandItem key={h.id} value={h.id} onSelect={() => choose({ kind: 'card', id: h.id, title: h.title })}>
                      <FileText className="text-muted-foreground" />
                      <span className="truncate">{h.title || 'Untitled'}</span>
                      {target.kind === 'card' && target.id === h.id && <Check className="ml-auto size-3.5" />}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** "+ Add task" row at the end of a card's group. */
function InlineAdd({ cardId }: { cardId: string }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [addTask] = useAddTaskMutation()
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="flex w-full items-center gap-2.5 bg-card px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground">
        <Plus className="size-4" /> Add task
      </button>
    )
  return (
    <div className="flex items-center gap-2.5 bg-card px-3 py-1.5">
      <span className="size-4 shrink-0 rounded-[4px] border" />
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !text.trim() && setEditing(false)}
        onKeyDown={async (e) => {
          if (e.key === 'Escape') return setEditing(false)
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || !text.trim()) return
          await addTask({ text: text.trim(), cardId })
          setText('')
        }}
        placeholder="New task"
        className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
