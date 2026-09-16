import { useMemo, useState } from 'react'
import { CalendarDays, FileText } from '@/components/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { useListTasksQuery, useSetTaskCheckedMutation } from '@/store/api'
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
